const crypto = require('crypto');
const axios = require('axios');
const { Msg91Config } = require('../models');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/secretBox');

/**
 * MSG91 provider configuration (Super Admin → Communication → Provider Management → MSG91).
 *
 * One row; each tab of the design is one JSON column. Every tab has a field list below:
 * unknown keys are dropped, every value is checked, and a save replaces that tab only.
 *
 * ── SAVED SETTINGS ONLY (2026-11-25) ───────────────────────────────────────────
 * Sending (msg91Sms.service.js, msg91Whatsapp.service.js) still reads MSG91 keys from .env.
 * Switching it to this row is the next step. The webhook URLs shown here have no receiver yet.
 * The one live call is `testConnection`, a read-only balance check that sends nothing.
 */

const VALIDATE_URL = 'https://control.msg91.com/api/validate.php';
const BALANCE_URL = 'https://control.msg91.com/api/balance.php';
const API_BASE_URL = 'https://control.msg91.com/api/v5/';

/* ── Field rules ─────────────────────────────────────────────────────────── */

const {
    fail, str, bool, int, oneOf, time, date, email, senderId, digits, group, list, clean, publicApiBase,
} = require('../utils/configFields');

const LANGS = ['en', 'ta', 'hi', 'ml', 'te', 'kn'];
const ROUTES = ['transactional', 'promotional'];

const SECTIONS = {
    general: {
        provider_name: str('Provider name', 60, { required: true }),
        description: str('Description', 250),
        channels: group({ sms: bool(), otp: bool(), email: bool(), webhook: bool() }),
        default_language: oneOf('Default language', LANGS),
        time_zone: str('Time zone', 60, { required: true }),
        default_priority: oneOf('Default priority', ['normal', 'high']),
    },
    api: {
        timeout_seconds: int('Timeout', 5, 60),
        retry_attempts: int('Retry attempts', 0, 5),
        request_logging: bool(),
    },
    sms: {
        transactional_enabled: bool(),
        promotional_enabled: bool(),
        default_route: oneOf('Default SMS route', ROUTES),
        sender_transactional: senderId('Transactional sender ID'),
        sender_promotional: senderId('Promotional sender ID'),
        unicode: bool(),
        length_mode: oneOf('Message length handling', ['auto_split', 'truncate', 'custom']),
        custom_limit: int('Custom limit', 160, 1200),
        dlr_enabled: bool(),
        dlr_realtime: bool(),
        dlr_notify_failure: bool(),
        working_hours_enabled: bool(),
        working_from: time('Working hours from'),
        working_to: time('Working hours to'),
        default_language: oneOf('Default language', LANGS),
    },
    otp: {
        sms_enabled: bool(),
        whatsapp_fallback: bool(),
        sender_id: senderId('OTP sender ID'),
        length: (v) => oneOf('OTP length', ['4', '5', '6', '7', '8'])(String(v)),
        validity_minutes: int('OTP validity', 1, 30),
        resend_seconds: int('Resend interval', 15, 300),
        max_attempts: int('Maximum attempts', 1, 10),
        msg91_template_id: str('MSG91 OTP template ID', 40),
        dlt_template_id: digits('DLT template ID'),
        otp_variable: str('OTP variable name', 30, { pattern: /^[A-Za-z0-9_]+$/, patternMsg: 'OTP variable name: letters, numbers and _ only' }),
        app_hash: str('Android app hash', 11, { pattern: /^[A-Za-z0-9+/]{11}$/, patternMsg: 'Android app hash must be exactly 11 characters' }),
        rate_limit_enabled: bool(),
        rate_limit_per_hour: int('Max OTPs per mobile per hour', 1, 50),
        lockout_enabled: bool(),
        lockout_minutes: int('Lockout duration', 1, 1440),
    },
    dlt: {
        entity_id: digits('DLT entity ID'),
        entity_name: str('Principal entity name', 150),
        registration_status: oneOf('Registration status', ['registered', 'pending', 'not_registered']),
        registration_date: date('Registration date'),
        approval_date: date('Approval date'),
        senders: list('Sender headers', 30, {
            sender_id: senderId('Sender ID', { required: true }),
            channel_use: oneOf('Channel use', ['T', 'P', 'S', 'O']),
            purpose: str('Purpose', 120),
            status: oneOf('Approval status', ['approved', 'pending', 'rejected']),
            approval_date: date('Approval date'),
        }),
    },
    sms_templates: {
        items: list('SMS templates', 200, {
            name: str('Message name', 80, { required: true }),
            key: str('Internal key', 60, { required: true, pattern: /^[a-z0-9_]+$/, patternMsg: 'Internal key: small letters, numbers and _ only' }),
            msg91_template_id: str('MSG91 template ID', 40),
            dlt_template_id: digits('DLT template ID'),
            sender_id: senderId('Sender ID'),
            category: oneOf('Category', ['transactional', 'promotional', 'service', 'otp']),
            language: oneOf('Language', LANGS),
            variables: str('Variables', 200, { pattern: /^[A-Za-z0-9_, ]*$/, patternMsg: 'Variables: names separated by commas' }),
        }),
    },
    email: {
        sender_email: email('Sender email'),
        sender_name: str('Sender name', 80),
        reply_to: email('Reply-to email'),
        domain: str('Email domain', 120, { pattern: /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, patternMsg: 'Email domain must look like eventinvit.com' }),
        domain_status: oneOf('Domain status', ['not_added', 'pending', 'verified', 'failed']),
        bounce_handling: oneOf('Bounce handling', ['mark_notify', 'mark_only', 'ignore']),
        unsubscribe_link: bool(),
        global_suppression: bool(),
        default_language: oneOf('Default language', LANGS),
        categories: group({ invitations: bool(), updates: bool(), reminders: bool(), tickets: bool(), marketing: bool(), system: bool() }),
        track_opens: bool(),
        track_clicks: bool(),
        utm: bool(),
        templates: list('Email templates', 200, {
            name: str('Message name', 80, { required: true }),
            key: str('Internal key', 60, { required: true, pattern: /^[a-z0-9_]+$/, patternMsg: 'Internal key: small letters, numbers and _ only' }),
            msg91_template_id: str('MSG91 email template ID', 80),
        }),
    },
    webhook: {
        events: group({ delivery: bool(), status: bool(), bounce: bool(), otp: bool(), email: bool() }),
    },
    alerts: {
        sms: group({ on: bool(), threshold: (v) => int('SMS alert threshold', 0, 10000000)(v ?? 0) }),
        email: group({ on: bool(), threshold: (v) => int('Email alert threshold', 0, 10000000)(v ?? 0) }),
        otp: group({ on: bool(), threshold: (v) => int('OTP alert threshold', 0, 10000000)(v ?? 0) }),
        notify_email: bool(),
        notify_sms: bool(),
        notify_in_app: bool(),
        recipients: (v) => {
            const arr = (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);
            if (arr.length > 10) fail('At most 10 alert recipients');
            arr.forEach((x) => email('Alert recipient')(x));
            return [...new Set(arr)];
        },
        frequency: oneOf('Alert frequency', ['immediate', 'daily']),
    },
};

/* ── Defaults (what a new row starts with) ───────────────────────────────── */

const DEFAULTS = {
    general: {
        provider_name: 'MSG91', description: 'MSG91 for SMS, OTP and transactional emails.',
        channels: { sms: true, otp: true, email: true, webhook: true },
        default_language: 'en', time_zone: 'Asia/Kolkata', default_priority: 'normal',
    },
    api: { timeout_seconds: 10, retry_attempts: 3, request_logging: false },
    sms: {
        transactional_enabled: true, promotional_enabled: false, default_route: 'transactional',
        sender_transactional: '', sender_promotional: '', unicode: true,
        length_mode: 'auto_split', custom_limit: 306,
        dlr_enabled: true, dlr_realtime: true, dlr_notify_failure: true,
        working_hours_enabled: true, working_from: '09:00', working_to: '21:00', default_language: 'en',
    },
    otp: {
        sms_enabled: true, whatsapp_fallback: false, sender_id: '', length: '6',
        validity_minutes: 5, resend_seconds: 30, max_attempts: 5,
        msg91_template_id: '', dlt_template_id: '', otp_variable: 'OTP', app_hash: '',
        rate_limit_enabled: true, rate_limit_per_hour: 10, lockout_enabled: true, lockout_minutes: 15,
    },
    dlt: { entity_id: '', entity_name: '', registration_status: 'not_registered', registration_date: '', approval_date: '', senders: [] },
    sms_templates: { items: [] },
    email: {
        sender_email: '', sender_name: 'EventInvit Notifications', reply_to: '', domain: '', domain_status: 'not_added',
        bounce_handling: 'mark_notify', unsubscribe_link: true, global_suppression: true, default_language: 'en',
        categories: { invitations: true, updates: true, reminders: true, tickets: true, marketing: false, system: false },
        track_opens: true, track_clicks: true, utm: false, templates: [],
    },
    webhook: { events: { delivery: true, status: true, bounce: true, otp: true, email: true } },
    alerts: {
        sms: { on: true, threshold: 10000 }, email: { on: true, threshold: 5000 }, otp: { on: true, threshold: 2000 },
        notify_email: true, notify_sms: false, notify_in_app: true, recipients: [], frequency: 'immediate',
    },
};

/** Cross-field rules a single field rule can't see. */
function crossCheck(section, v) {
    if (section === 'sms') {
        if (!v.transactional_enabled && !v.promotional_enabled) fail('Turn on transactional or promotional SMS');
        if (v.default_route === 'transactional' && !v.transactional_enabled) fail('Default route is Transactional, so Transactional SMS must be on');
        if (v.default_route === 'promotional' && !v.promotional_enabled) fail('Default route is Promotional, so Promotional SMS must be on');
        if (v.working_hours_enabled && v.working_from >= v.working_to) fail('Working hours: "From" must be before "To"');
    }
    if (section === 'dlt') {
        const ids = v.senders.map((s) => s.sender_id);
        const dup = ids.find((id, i) => ids.indexOf(id) !== i);
        if (dup) fail(`Sender ID ${dup} is listed twice`);
    }
    if (section === 'sms_templates') {
        const keys = v.items.map((t) => t.key);
        const dup = keys.find((k, i) => keys.indexOf(k) !== i);
        if (dup) fail(`Internal key ${dup} is used twice`);
    }
    if (section === 'email') {
        const keys = v.templates.map((t) => t.key);
        const dup = keys.find((k, i) => keys.indexOf(k) !== i);
        if (dup) fail(`Internal key ${dup} is used twice`);
        if (v.domain && v.sender_email && !v.sender_email.toLowerCase().endsWith(`@${v.domain.toLowerCase()}`)) {
            fail(`Sender email must be on the email domain (${v.domain})`);
        }
    }
}

/* ── Row access ──────────────────────────────────────────────────────────── */

const getRow = async () => {
    let row = await Msg91Config.findOne({ order: [['id', 'ASC']] });
    if (!row) {
        row = await Msg91Config.create({
            ...DEFAULTS,
            webhook_token_enc: encrypt(crypto.randomBytes(24).toString('base64url')),
        });
    }
    return row;
};

/** The row as the admin sees it: secrets masked, defaults filled in for keys added later. */
const present = (row) => {
    const authKey = decrypt(row.auth_key_enc);
    const token = decrypt(row.webhook_token_enc) || '';
    const base = `${publicApiBase()}/api/v1/webhooks/msg91`;
    const out = { id: row.id, is_active: row.is_active };
    for (const s of Object.keys(DEFAULTS)) out[s] = { ...DEFAULTS[s], ...(row[s] || {}) };
    out.api = {
        ...out.api,
        base_url: API_BASE_URL,
        has_auth_key: Boolean(authKey),
        auth_key_hint: authKey ? `•••• ${authKey.slice(-4)}` : '',
        auth_key_unreadable: Boolean(row.auth_key_enc) && !authKey,
    };
    out.webhook = {
        ...out.webhook,
        urls: Object.fromEntries(['delivery', 'status', 'bounce', 'otp', 'email'].map((k) => [k, `${base}/${k}?token=${token}`])),
        receiver_ready: false,
    };
    out.status = {
        connection_status: row.connection_status,
        last_tested_at: row.last_tested_at,
        last_test_message: row.last_test_message,
        last_balance: row.last_balance,
        updated_at: row.updated_at,
    };
    return out;
};

/* ── Public API ──────────────────────────────────────────────────────────── */

const get = async () => present(await getRow());

const SECTION_NAMES = [...Object.keys(SECTIONS)];

const updateSection = async (section, body = {}, userId = null) => {
    if (!SECTION_NAMES.includes(section)) throw ApiError.notFound(`Unknown settings tab "${section}"`);
    const row = await getRow();
    const value = clean(SECTIONS[section], body);
    crossCheck(section, value);

    const patch = { [section]: value, updated_by: userId };
    if (section === 'general' && body.is_active !== undefined) patch.is_active = bool()(body.is_active);
    if (section === 'api' && body.auth_key !== undefined && String(body.auth_key).trim() !== '') {
        const key = String(body.auth_key).trim();
        if (!/^[A-Za-z0-9]{16,64}$/.test(key)) fail('Auth key: 16 to 64 letters and numbers, as copied from MSG91');
        patch.auth_key_enc = encrypt(key);
        patch.connection_status = 'not_tested';
        patch.last_test_message = null;
    }
    await row.update(patch);
    logger.logDB('update', 'Msg91Config', `${row.id}:${section}`);
    return present(row);
};

const regenerateWebhookToken = async (userId = null) => {
    const row = await getRow();
    await row.update({ webhook_token_enc: encrypt(crypto.randomBytes(24).toString('base64url')), updated_by: userId });
    return present(row);
};

/**
 * Read-only check of the saved auth key (validate.php), then the transactional SMS balance.
 * Nothing is sent and no credit is used.
 */
const testConnection = async () => {
    const row = await getRow();
    const authKey = decrypt(row.auth_key_enc);
    if (!authKey) {
        await row.update({ connection_status: 'error', last_tested_at: new Date(), last_test_message: 'No auth key saved. Add it on the API Configuration tab.' });
        return present(row);
    }
    const started = Date.now();
    let ok = false;
    let message;
    let balance = null;
    const timeout = ((row.api && row.api.timeout_seconds) || 10) * 1000;
    try {
        // validate.php answers "Valid" for a real key and an error code (e.g. "201") otherwise.
        // balance.php can't be used for this: it answers "0" for ANY key, valid or not.
        const res = await axios.get(VALIDATE_URL, { params: { authkey: authKey }, timeout, transformResponse: (r) => r });
        const text = String(res.data || '').trim();
        if (text.toLowerCase() === 'valid') {
            ok = true;
            message = `Connected. MSG91 accepted the auth key (${Date.now() - started} ms).`;
            try {
                const b = await axios.get(BALANCE_URL, { params: { authkey: authKey, type: 4 }, timeout, transformResponse: (r) => r });
                const num = Number(String(b.data || '').trim());
                if (Number.isFinite(num)) balance = { transactional_sms: num, fetched_at: new Date().toISOString() };
            } catch { /* balance is extra; the key check already passed */ }
        } else {
            message = `MSG91 refused the auth key (code ${text.slice(0, 40) || 'empty'}). Copy it again from MSG91 → API.`;
        }
    } catch (err) {
        message = `Could not reach MSG91: ${err.response ? `HTTP ${err.response.status}` : err.message}`;
    }
    await row.update({
        connection_status: ok ? 'connected' : 'error',
        last_tested_at: new Date(),
        last_test_message: message.slice(0, 500),
        ...(balance ? { last_balance: balance } : {}),
    });
    return present(row);
};

module.exports = { get, updateSection, regenerateWebhookToken, testConnection, SECTION_NAMES, DEFAULTS };
