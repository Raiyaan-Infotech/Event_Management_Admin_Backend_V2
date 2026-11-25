const crypto = require('crypto');
const axios = require('axios');
const { WhatsAppConfig } = require('../models');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/secretBox');
const {
    fail, str, bool, int, oneOf, email, group, list, clean, publicApiBase,
} = require('../utils/configFields');

/**
 * Meta WhatsApp Cloud API configuration (Super Admin → Communication → Provider Management → WhatsApp).
 *
 * One row; each tab of the design is one JSON column with its own field list (unknown keys
 * dropped, every value checked). A save replaces that tab only.
 *
 * ── SAVED SETTINGS ONLY (2026-11-25) ───────────────────────────────────────────
 * WhatsApp messages still go out through MSG91 (msg91Whatsapp.service.js). Switching sending to
 * Meta direct is a later step, and the webhook URL shown here has no receiver yet.
 * The one live call is `testConnection`: a read-only Graph API lookup of the default phone
 * number. Nothing is sent.
 */

const GRAPH = 'https://graph.facebook.com';
const VERSIONS = ['v21.0', 'v22.0', 'v23.0', 'v24.0'];
const WA_LANGS = ['en', 'en_US', 'en_GB', 'ta', 'hi', 'ml', 'te', 'kn'];
const QUALITY = ['high', 'medium', 'low', 'unknown'];

const metaId = (label, opts = {}) => str(label, 30, { ...opts, pattern: /^\d{5,25}$/, patternMsg: `${label} must be digits only (copy it from Meta)` });
const money = (label) => (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1000000) fail(`${label} must be a number from 0`);
    return Math.round(n * 10000) / 10000;
};
const url = (label) => str(label, 250, { pattern: /^https:\/\/[^\s]+\.[^\s]+$/, patternMsg: `${label} must start with https://` });

const SECTIONS = {
    general: {
        provider_name: str('Provider name', 60, { required: true }),
        description: str('Description', 250),
        default_language: oneOf('Default template language', WA_LANGS),
        opt_in_required: bool(),
    },
    api: {
        graph_version: oneOf('Graph API version', VERSIONS),
        app_id: metaId('App ID'),
        waba_id: metaId('WhatsApp Business Account ID'),
        timeout_seconds: int('Request timeout', 5, 60),
        retry_attempts: int('Retry attempts', 0, 5),
        retry_interval_seconds: int('Retry interval', 1, 60),
    },
    business: {
        portfolio_id: metaId('Business Portfolio ID'),
        portfolio_name: str('Business Portfolio name', 120),
        verification_status: oneOf('Business verification', ['verified', 'pending', 'not_verified', 'rejected']),
        display_name: str('Display name', 80),
        display_name_status: oneOf('Display name status', ['approved', 'pending', 'rejected']),
        quality_rating: oneOf('Account quality', QUALITY),
        vertical: oneOf('Business category', ['EVENT_PLAN', 'ENTERTAIN', 'PROF_SERVICES', 'OTHER']),
        timezone: str('Timezone', 60),
        about: str('About', 139),
        profile_description: str('Business description', 512),
        profile_email: email('Business email'),
        address: str('Address', 256),
        website: url('Website'),
    },
    senders: {
        items: list('Phone numbers', 20, {
            display_name: str('Display name', 80, { required: true }),
            phone_number: str('Phone number', 16, { required: true, pattern: /^\+\d{8,15}$/, patternMsg: 'Phone number must be in +91XXXXXXXXXX format' }),
            phone_number_id: metaId('Phone Number ID', { required: true }),
            purpose: str('Purpose', 120),
            verification: oneOf('Verification', ['verified', 'pending', 'not_verified']),
            quality: oneOf('Quality', QUALITY),
            is_default: bool(),
        }),
        fallback_phone_number_id: str('Fallback sender', 30),
        incoming_enabled: bool(),
    },
    templates: {
        items: list('WhatsApp templates', 300, {
            name: str('Template name', 512, { required: true, pattern: /^[a-z0-9_]+$/, patternMsg: 'Template name: small letters, numbers and _ only (as in Meta)' }),
            key: str('Internal key', 60, { required: true, pattern: /^[a-z0-9_]+$/, patternMsg: 'Internal key: small letters, numbers and _ only' }),
            category: oneOf('Category', ['marketing', 'utility', 'authentication']),
            language: oneOf('Language', WA_LANGS),
            status: oneOf('Approval status', ['approved', 'pending', 'rejected', 'paused', 'disabled']),
            variables: (v) => int('Variables', 0, 20)(v ?? 0),
        }),
    },
    webhook: {
        events: group({ messages: bool(), message_status: bool(), template_status: bool(), quality: bool(), account: bool() }),
    },
    limits: {
        tier: oneOf('Messaging tier', ['250', '1000', '10000', '100000', 'unlimited']),
        throughput: oneOf('Throughput', ['80', '1000']),
        max_per_second: int('Max messages per second', 1, 1000),
        max_per_event_day: int('Max messages per event per day', 1, 1000000),
        cap_applies: oneOf('Apply caps to', ['all', 'campaign']),
        include_system: bool(),
        warn_yellow: bool(),
        warn_red: bool(),
        notify_quality_change: bool(),
        recipients: (v) => {
            const arr = (Array.isArray(v) ? v : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
            if (arr.length > 10) fail('At most 10 notification recipients');
            arr.forEach((x) => email('Notification recipient')(x));
            return [...new Set(arr)];
        },
        auto_throttle_enabled: bool(),
        auto_throttle_percent: int('Auto-throttle level', 50, 100),
        pause_enabled: bool(),
        pause_percent: int('Pause level', 50, 100),
        resume_next_day: bool(),
    },
    budget: {
        daily_limit: int('Daily budget limit', 0, 100000000),
        monthly_cap: int('Monthly budget cap', 0, 1000000000),
        alert_percent: int('Alert threshold', 50, 100),
        hard_limit_action: oneOf('Hard limit action', ['stop', 'alert_only']),
        rates: group({
            marketing: money('Marketing rate'),
            utility: money('Utility rate'),
            authentication: money('Authentication rate'),
        }),
    },
};

const DEFAULTS = {
    general: {
        provider_name: 'Meta WhatsApp Cloud API',
        description: 'WhatsApp channel for event invitations, RSVP, reminders and notifications.',
        default_language: 'en', opt_in_required: true,
    },
    api: { graph_version: 'v23.0', app_id: '', waba_id: '', timeout_seconds: 30, retry_attempts: 3, retry_interval_seconds: 5 },
    business: {
        portfolio_id: '', portfolio_name: '', verification_status: 'not_verified', display_name: '', display_name_status: 'pending',
        quality_rating: 'unknown', vertical: 'EVENT_PLAN', timezone: 'Asia/Kolkata', about: '', profile_description: '',
        profile_email: '', address: '', website: '',
    },
    senders: { items: [], fallback_phone_number_id: '', incoming_enabled: true },
    templates: { items: [] },
    webhook: { events: { messages: true, message_status: true, template_status: true, quality: true, account: true } },
    limits: {
        tier: '1000', throughput: '80', max_per_second: 50, max_per_event_day: 20000, cap_applies: 'all', include_system: true,
        warn_yellow: true, warn_red: true, notify_quality_change: true, recipients: [],
        auto_throttle_enabled: true, auto_throttle_percent: 90, pause_enabled: true, pause_percent: 98, resume_next_day: true,
    },
    budget: {
        daily_limit: 10000, monthly_cap: 250000, alert_percent: 80, hard_limit_action: 'stop',
        rates: { marketing: 0, utility: 0, authentication: 0 },
    },
};

function crossCheck(section, v) {
    if (section === 'senders') {
        const ids = v.items.map((s) => s.phone_number_id);
        const dup = ids.find((id, i) => ids.indexOf(id) !== i);
        if (dup) fail(`Phone Number ID ${dup} is listed twice`);
        const defaults = v.items.filter((s) => s.is_default);
        if (v.items.length && defaults.length !== 1) fail('Pick exactly one default sender');
        if (v.fallback_phone_number_id) {
            if (!ids.includes(v.fallback_phone_number_id)) fail('Fallback sender must be one of the phone numbers');
            if (defaults[0] && defaults[0].phone_number_id === v.fallback_phone_number_id) fail('Fallback sender must be different from the default sender');
        }
    }
    if (section === 'templates') {
        const pairs = v.items.map((t) => `${t.name}/${t.language}`);
        const dupPair = pairs.find((p, i) => pairs.indexOf(p) !== i);
        if (dupPair) fail(`Template ${dupPair.replace('/', ' (')}) is listed twice`);
        const keys = v.items.map((t) => `${t.key}/${t.language}`);
        const dupKey = keys.find((k, i) => keys.indexOf(k) !== i);
        if (dupKey) fail(`Internal key ${dupKey.split('/')[0]} is used twice for the same language`);
    }
    if (section === 'limits' && v.auto_throttle_enabled && v.pause_enabled && v.pause_percent <= v.auto_throttle_percent) {
        fail('Pause level must be higher than the auto-throttle level');
    }
    if (section === 'budget' && v.monthly_cap > 0 && v.daily_limit > v.monthly_cap) {
        fail('Daily budget limit cannot be more than the monthly cap');
    }
}

/* ── Row access ──────────────────────────────────────────────────────────── */

const newToken = () => crypto.randomBytes(24).toString('base64url');

const getRow = async () => {
    let row = await WhatsAppConfig.findOne({ order: [['id', 'ASC']] });
    if (!row) row = await WhatsAppConfig.create({ ...DEFAULTS, verify_token_enc: encrypt(newToken()) });
    return row;
};

const hint = (s) => (s ? `•••• ${s.slice(-4)}` : '');

const present = (row) => {
    const appSecret = decrypt(row.app_secret_enc);
    const token = decrypt(row.access_token_enc);
    const out = { id: row.id, is_active: row.is_active };
    for (const s of Object.keys(DEFAULTS)) out[s] = { ...DEFAULTS[s], ...(row[s] || {}) };
    out.api = {
        ...out.api,
        base_url: `${GRAPH}/${out.api.graph_version}`,
        has_app_secret: Boolean(appSecret),
        app_secret_hint: hint(appSecret),
        has_access_token: Boolean(token),
        access_token_hint: hint(token),
        secrets_unreadable: (Boolean(row.app_secret_enc) && !appSecret) || (Boolean(row.access_token_enc) && !token),
    };
    out.webhook = {
        ...out.webhook,
        callback_url: `${publicApiBase()}/api/v1/webhooks/whatsapp`,
        // Shown in full: the admin has to paste it into Meta. It only proves the webhook set-up
        // request comes from someone who has it; message calls are checked with the App Secret.
        verify_token: decrypt(row.verify_token_enc) || '',
        receiver_ready: false,
    };
    out.status = {
        connection_status: row.connection_status,
        last_tested_at: row.last_tested_at,
        last_test_message: row.last_test_message,
        last_test_info: row.last_test_info,
        updated_at: row.updated_at,
    };
    return out;
};

/* ── Public API ──────────────────────────────────────────────────────────── */

const get = async () => present(await getRow());

const updateSection = async (section, body = {}, userId = null) => {
    if (!SECTIONS[section]) throw ApiError.notFound(`Unknown settings tab "${section}"`);
    const row = await getRow();
    const value = clean(SECTIONS[section], body);
    crossCheck(section, value);

    const patch = { [section]: value, updated_by: userId };
    if (section === 'general' && body.is_active !== undefined) patch.is_active = bool()(body.is_active);
    if (section === 'api') {
        const secret = String(body.app_secret || '').trim();
        const token = String(body.access_token || '').trim();
        if (secret) {
            if (!/^[a-f0-9]{32}$/i.test(secret)) fail('App Secret is 32 letters/numbers (Meta App → Settings → Basic)');
            patch.app_secret_enc = encrypt(secret);
        }
        if (token) {
            if (!/^[A-Za-z0-9_-]{50,1024}$/.test(token)) fail('Access token looks wrong: copy the full system user token (starts with EAA)');
            patch.access_token_enc = encrypt(token);
        }
        if (secret || token) { patch.connection_status = 'not_tested'; patch.last_test_message = null; }
    }
    await row.update(patch);
    logger.logDB('update', 'WhatsAppConfig', `${row.id}:${section}`);
    return present(row);
};

const regenerateVerifyToken = async (userId = null) => {
    const row = await getRow();
    await row.update({ verify_token_enc: encrypt(newToken()), updated_by: userId });
    return present(row);
};

/**
 * Read-only check: asks the Graph API for the default phone number's details with the saved
 * token. Proves the token, the version and the Phone Number ID together. Nothing is sent.
 */
const testConnection = async () => {
    const row = await getRow();
    const cfg = present(row);
    const token = decrypt(row.access_token_enc);
    const sender = (cfg.senders.items || []).find((s) => s.is_default);
    const done = (ok, message, info = null) => row.update({
        connection_status: ok ? 'connected' : 'error',
        last_tested_at: new Date(),
        last_test_message: String(message).slice(0, 500),
        last_test_info: info,
    }).then(() => present(row));

    if (!token) return done(false, 'No access token saved. Add it on the API Configuration tab.');
    if (!sender) return done(false, 'No default sender. Add a phone number on the Sender Configuration tab.');

    const started = Date.now();
    try {
        const res = await axios.get(`${GRAPH}/${cfg.api.graph_version}/${sender.phone_number_id}`, {
            params: { fields: 'display_phone_number,verified_name,quality_rating,code_verification_status' },
            headers: { Authorization: `Bearer ${token}` },
            timeout: (cfg.api.timeout_seconds || 30) * 1000,
        });
        const d = res.data || {};
        return done(true, `Connected. Meta returned ${d.verified_name || 'the number'} (${Date.now() - started} ms).`, {
            display_phone_number: d.display_phone_number || null,
            verified_name: d.verified_name || null,
            quality_rating: d.quality_rating || null,
            code_verification_status: d.code_verification_status || null,
        });
    } catch (err) {
        const meta = err.response && err.response.data && err.response.data.error;
        return done(false, meta ? `Meta refused: ${meta.message}` : `Could not reach Meta: ${err.message}`);
    }
};

module.exports = { get, updateSection, regenerateVerifyToken, testConnection, DEFAULTS };
