const { Op, literal } = require('sequelize');
const { NotificationTemplate, NotificationCategory, EventCategory } = require('../models');
const baseService = require('./base.service');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const catalog = require('../config/notificationCatalog.json');

const MODEL_NAME = 'NotificationTemplate';
const MODULE_SLUG = 'notification_templates';

/*
 * ── TRIGGER CATALOGUE ─────────────────────────────────────────────────────
 * src/config/notificationCatalog.json is generated from the Transactional
 * Notifications decision sheet (Jamal, 2026-11-24): every row of sections
 * A1–A7 (to the organizer) and B1–B6 (to the organizer's guests and team),
 * with the channels Jamal ticked, the variables that row can fill in and the
 * suggested Email / WhatsApp / In-app wording.
 *
 * `live: true` = notificationTrigger.service.js already fires that key today.
 * The others can have a template saved now; it is sent once the developers
 * connect that trigger. One template per trigger (trigger_key is unique).
 */
const SYSTEM_TRIGGERS = catalog.triggers;
const SYSTEM_TRIGGER_MAP = new Map(SYSTEM_TRIGGERS.map((t) => [t.key, t]));
const SECTIONS = catalog.sections;

/**
 * Every placeholder the system knows how to fill: the original in-app set plus
 * each trigger's variables. A free-form variable would render literally as
 * "{{whatever}}", so the editors only offer these.
 */
const BASE_VARIABLES = [
    'guest_name', 'event_name', 'event_date', 'event_time', 'venue_name', 'event_link',
    'storage_percent', 'storage_used', 'storage_limit', 'storage_left',
    'usage_percent', 'usage_used', 'usage_limit', 'usage_left',
];
const AVAILABLE_VARIABLE_KEYS = new Set([
    ...BASE_VARIABLES,
    ...SYSTEM_TRIGGERS.flatMap((t) => t.variables || []),
]);
const AVAILABLE_VARIABLES = Array.from(AVAILABLE_VARIABLE_KEYS).map((key) => ({ key, label: `{{${key}}}` }));

const CHANNELS = ['email', 'whatsapp', 'in_app', 'push'];
const AUDIENCES = ['organizer', 'guest', 'participant', 'contact_person'];
const TEMPLATE_TYPES = ['transactional', 'campaign', 'custom'];
const WA_CATEGORIES = ['utility', 'authentication', 'marketing'];
const WA_HEADER_TYPES = ['none', 'text'];

/* Meta's limits for a WhatsApp template. */
const WA_BODY_MAX = 1024;
const WA_HEADER_MAX = 60;
const WA_FOOTER_MAX = 60;
const WA_BUTTON_TEXT_MAX = 25;
const WA_BUTTONS_MAX = 2;
const IN_APP_TITLE_MAX = 100;
const IN_APP_CONTENT_MAX = 500;

const WRITABLE_FIELDS = [
    'name', 'template_type', 'description', 'trigger_key', 'audience', 'notification_category_id', 'event_category_id',
    'title', 'content', 'image_url', 'action_url', 'channels', 'is_active', 'sort_order',
    'email_subject', 'email_preheader', 'email_heading', 'email_body',
    'email_button_label', 'email_button_url', 'email_footer',
    'whatsapp_template_name', 'whatsapp_category', 'whatsapp_header_type', 'whatsapp_header_text',
    'whatsapp_body', 'whatsapp_footer', 'whatsapp_buttons', 'sample_values',
];

/** Text fields: trimmed, '' stored as NULL. */
const TEXT_FIELDS = [
    'description', 'title', 'content', 'image_url', 'action_url',
    'email_subject', 'email_preheader', 'email_heading', 'email_body',
    'email_button_label', 'email_button_url', 'email_footer',
    'whatsapp_template_name', 'whatsapp_header_text', 'whatsapp_body', 'whatsapp_footer',
];

const pickWritable = (data = {}) =>
    WRITABLE_FIELDS.reduce((acc, key) => {
        if (data[key] !== undefined) acc[key] = data[key];
        return acc;
    }, {});

const toNullableId = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '' || value === 'null') return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
};

const cleanText = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const s = String(value).trim();
    return s.length ? s : null;
};

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** Placeholders (known to the system) used anywhere in the given texts. */
const extractVariablesUsed = (...texts) => {
    const found = new Set();
    for (const text of texts) {
        if (!text) continue;
        for (const match of String(text).matchAll(PLACEHOLDER_RE)) {
            if (AVAILABLE_VARIABLE_KEYS.has(match[1])) found.add(match[1]);
        }
    }
    return Array.from(found);
};

const textsOf = (t) => [
    t.title, t.content, t.action_url,
    t.email_subject, t.email_preheader, t.email_heading, t.email_body, t.email_button_url, t.email_footer,
    t.whatsapp_header_text, t.whatsapp_body,
    ...(Array.isArray(t.whatsapp_buttons) ? t.whatsapp_buttons.map((b) => b?.url) : []),
];

const assertNotificationCategoryExists = async (notificationCategoryId) => {
    const cat = await NotificationCategory.findByPk(notificationCategoryId, { attributes: ['id'] });
    if (!cat) throw ApiError.badRequest('That notification category does not exist.');
};

const normalizeTriggerKey = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '' || value === 'null') return null;
    if (!SYSTEM_TRIGGER_MAP.has(value)) {
        throw ApiError.badRequest('That system trigger is not recognised.');
    }
    return value;
};

const assertTriggerKeyAvailable = async (triggerKey, excludeId = null) => {
    if (!triggerKey) return;
    const where = { trigger_key: triggerKey };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const clash = await NotificationTemplate.findOne({ where, attributes: ['id', 'name'] });
    if (clash) {
        throw ApiError.badRequest(
            `"${clash.name}" already handles this system trigger. Clear it there first.`
        );
    }
};

const normalizeChannels = (channels) => {
    if (!Array.isArray(channels)) return ['in_app'];
    const clean = CHANNELS.filter((c) => channels.includes(c));
    // Push is the phone banner of an in-app notification; it never goes alone.
    if (clean.includes('push') && !clean.includes('in_app')) clean.unshift('in_app');
    if (!clean.length) throw ApiError.badRequest('Pick at least one channel: Email, WhatsApp or In-app.');
    return clean;
};

const normalizeButtons = (buttons) => {
    if (buttons === undefined) return undefined;
    if (buttons === null) return null;
    if (!Array.isArray(buttons)) throw ApiError.badRequest('WhatsApp buttons must be a list.');
    const clean = buttons
        .filter((b) => b && (b.text || b.url))
        .map((b) => ({
            type: b.type === 'copy_code' ? 'copy_code' : 'url',
            text: String(b.text || '').trim(),
            url: b.type === 'copy_code' ? '' : String(b.url || '').trim(),
        }));
    return clean.length ? clean : null;
};

const normalizeSampleValues = (value) => {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (AVAILABLE_VARIABLE_KEYS.has(k) && v !== null && v !== undefined && String(v).trim()) {
            out[k] = String(v).slice(0, 300);
        }
    }
    return Object.keys(out).length ? out : null;
};

const startsOrEndsWithVariable = (body) => {
    const s = String(body || '').trim();
    return /^\{\{\s*\w+\s*\}\}/.test(s) || /\{\{\s*\w+\s*\}\}[\s.!?]*$/.test(s);
};

/** Full check of the merged row, per ticked channel. Throws the first problem found. */
const validateChannels = (t) => {
    const ch = t.channels || [];

    if (ch.includes('in_app')) {
        if (!t.title) throw ApiError.badRequest('In-app: a notification title is required.');
        if (t.title.length > IN_APP_TITLE_MAX) throw ApiError.badRequest(`In-app: the title must be ${IN_APP_TITLE_MAX} characters or fewer.`);
        if (!t.content) throw ApiError.badRequest('In-app: a short message is required.');
        if (t.content.length > IN_APP_CONTENT_MAX) throw ApiError.badRequest(`In-app: the message must be ${IN_APP_CONTENT_MAX} characters or fewer.`);
    }

    if (ch.includes('email')) {
        if (!t.email_subject) throw ApiError.badRequest('Email: a subject is required.');
        if (!t.email_body || !String(t.email_body).replace(/<[^>]*>/g, '').trim()) {
            throw ApiError.badRequest('Email: the email body is required.');
        }
        if (t.email_button_label && !t.email_button_url) {
            throw ApiError.badRequest('Email: the button needs a link.');
        }
    }

    if (ch.includes('whatsapp')) {
        if (!t.whatsapp_template_name || !/^[a-z0-9_]{1,100}$/.test(t.whatsapp_template_name)) {
            throw ApiError.badRequest('WhatsApp: the template name must use lowercase letters, numbers and _ only (Meta rule).');
        }
        if (!WA_CATEGORIES.includes(t.whatsapp_category)) {
            throw ApiError.badRequest('WhatsApp: pick a Meta category (Utility, Authentication or Marketing).');
        }
        if (!WA_HEADER_TYPES.includes(t.whatsapp_header_type || 'none')) {
            throw ApiError.badRequest('WhatsApp: the header can be None or Text.');
        }
        if (t.whatsapp_header_type === 'text') {
            if (!t.whatsapp_header_text) throw ApiError.badRequest('WhatsApp: enter the header text or set the header to None.');
            if (t.whatsapp_header_text.length > WA_HEADER_MAX) throw ApiError.badRequest(`WhatsApp: the header must be ${WA_HEADER_MAX} characters or fewer.`);
        }
        if (!t.whatsapp_body) throw ApiError.badRequest('WhatsApp: the message body is required.');
        if (t.whatsapp_body.length > WA_BODY_MAX) throw ApiError.badRequest(`WhatsApp: the message must be ${WA_BODY_MAX} characters or fewer.`);
        if (t.whatsapp_category !== 'authentication' && startsOrEndsWithVariable(t.whatsapp_body)) {
            throw ApiError.badRequest('WhatsApp: Meta rejects a message that starts or ends with a variable. Add words before or after it.');
        }
        if (t.whatsapp_footer && t.whatsapp_footer.length > WA_FOOTER_MAX) {
            throw ApiError.badRequest(`WhatsApp: the footer must be ${WA_FOOTER_MAX} characters or fewer.`);
        }
        const buttons = t.whatsapp_buttons || [];
        if (buttons.length > WA_BUTTONS_MAX) throw ApiError.badRequest(`WhatsApp: at most ${WA_BUTTONS_MAX} buttons.`);
        for (const b of buttons) {
            if (!b.text) throw ApiError.badRequest('WhatsApp: every button needs a label.');
            if (b.text.length > WA_BUTTON_TEXT_MAX) throw ApiError.badRequest(`WhatsApp: button labels must be ${WA_BUTTON_TEXT_MAX} characters or fewer.`);
            if (b.type === 'url' && !b.url) throw ApiError.badRequest(`WhatsApp: the "${b.text}" button needs a link.`);
        }
        if (t.whatsapp_category === 'authentication' && buttons.some((b) => b.type !== 'copy_code')) {
            throw ApiError.badRequest('WhatsApp: an Authentication template can only have the Copy code button.');
        }
    }
};

/** Cleans the incoming fields (does not validate the whole row). */
const normalizePayload = async (payload) => {
    for (const f of TEXT_FIELDS) {
        if (payload[f] !== undefined) payload[f] = cleanText(payload[f]);
    }
    if (payload.name !== undefined) {
        if (!String(payload.name || '').trim()) throw ApiError.badRequest('A template name is required.');
        payload.name = String(payload.name).trim().slice(0, 150);
    }
    if (payload.template_type !== undefined) {
        payload.template_type = String(payload.template_type || '').toLowerCase();
        if (!TEMPLATE_TYPES.includes(payload.template_type)) {
            throw ApiError.badRequest('Pick a category: Transactional, Campaign or Custom.');
        }
    }
    if (payload.notification_category_id !== undefined) {
        payload.notification_category_id = toNullableId(payload.notification_category_id);
        if (payload.notification_category_id) await assertNotificationCategoryExists(payload.notification_category_id);
    }
    if (payload.event_category_id !== undefined) payload.event_category_id = toNullableId(payload.event_category_id);
    if (payload.channels !== undefined) payload.channels = normalizeChannels(payload.channels);
    if (payload.audience !== undefined) {
        payload.audience = payload.audience ? String(payload.audience) : null;
        if (payload.audience && !AUDIENCES.includes(payload.audience)) throw ApiError.badRequest('That audience is not recognised.');
    }
    if (payload.whatsapp_category !== undefined) {
        payload.whatsapp_category = payload.whatsapp_category ? String(payload.whatsapp_category).toLowerCase() : null;
    }
    if (payload.whatsapp_template_name) payload.whatsapp_template_name = payload.whatsapp_template_name.toLowerCase();
    if (payload.whatsapp_header_type !== undefined) payload.whatsapp_header_type = payload.whatsapp_header_type || 'none';
    if (payload.whatsapp_buttons !== undefined) payload.whatsapp_buttons = normalizeButtons(payload.whatsapp_buttons);
    if (payload.sample_values !== undefined) payload.sample_values = normalizeSampleValues(payload.sample_values);
    if (payload.description) payload.description = payload.description.slice(0, 250);
    return payload;
};

const INCLUDE = [
    { model: NotificationCategory, as: 'notificationCategory', attributes: ['id', 'name', 'icon', 'color'], required: false },
    { model: EventCategory, as: 'category', attributes: ['id', 'name'], required: false },
];

const channelFilter = (channel) =>
    CHANNELS.includes(channel)
        ? literal(`JSON_CONTAINS(\`NotificationTemplate\`.\`channels\`, '"${channel}"')`)
        : null;

const getAll = async (query = {}, companyId = undefined) => {
    const where = {};
    const notificationCategoryId = toNullableId(query.notification_category_id);
    if (notificationCategoryId !== undefined) where.notification_category_id = notificationCategoryId;

    const eventCategoryId = toNullableId(query.event_category_id);
    if (eventCategoryId !== undefined) where.event_category_id = eventCategoryId;

    if (query.audience && AUDIENCES.includes(query.audience)) where.audience = query.audience;
    if (query.template_type && TEMPLATE_TYPES.includes(query.template_type)) where.template_type = query.template_type;

    const and = [];
    const byChannel = channelFilter(query.channel);
    if (byChannel) and.push(byChannel);
    if (query.trigger === 'mapped') and.push({ trigger_key: { [Op.ne]: null } });
    if (query.trigger === 'unmapped') and.push({ trigger_key: null });
    if (and.length) where[Op.and] = and;

    return baseService.getAll(NotificationTemplate, MODEL_NAME, query, {
        searchFields: ['name', 'title', 'content', 'email_subject', 'trigger_key'],
        sortableFields: ['sort_order', 'name', 'created_at', 'updated_at'],
        companyId,
        moduleSlug: MODULE_SLUG,
        where,
        include: INCLUDE,
    });
};

/** Tab counts for the list: all / email / whatsapp / in_app / transactional / campaign / custom. */
const getCounts = async (companyId = undefined) => {
    const base = companyId !== undefined && companyId !== null ? { company_id: companyId } : {};
    const [all, email, whatsapp, inApp, transactional, campaign, custom] = await Promise.all([
        NotificationTemplate.count({ where: base }),
        ...['email', 'whatsapp', 'in_app'].map((c) =>
            NotificationTemplate.count({ where: { ...base, [Op.and]: [channelFilter(c)] } })),
        ...TEMPLATE_TYPES.map((type) => NotificationTemplate.count({ where: { ...base, template_type: type } })),
    ]);
    return { all, email, whatsapp, in_app: inApp, transactional, campaign, custom };
};

const getById = async (id, companyId = undefined) =>
    baseService.getById(NotificationTemplate, MODEL_NAME, id, { companyId, include: INCLUDE });

const create = async (data, userId = null, companyId = undefined) => {
    const payload = await normalizePayload(pickWritable(data));

    if (!payload.name) throw ApiError.badRequest('A template name is required.');
    if (!payload.template_type) throw ApiError.badRequest('Pick a category: Transactional, Campaign or Custom.');

    payload.channels = payload.channels ?? ['in_app'];
    payload.event_category_id = payload.event_category_id ?? null;
    payload.trigger_key = normalizeTriggerKey(payload.trigger_key) ?? null;
    await assertTriggerKeyAvailable(payload.trigger_key);
    // Audience is not picked in the admin: it follows the trigger.
    if (payload.trigger_key) payload.audience = SYSTEM_TRIGGER_MAP.get(payload.trigger_key).audience;

    validateChannels(payload);
    payload.variables_used = extractVariablesUsed(...textsOf(payload));

    return baseService.create(NotificationTemplate, MODEL_NAME, payload, userId, companyId);
};

const update = async (id, data, userId = null, companyId = undefined) => {
    const row = await NotificationTemplate.findByPk(id);
    if (!row) throw ApiError.notFound('That notification template was not found.');

    const payload = await normalizePayload(pickWritable(data));

    if (payload.trigger_key !== undefined) {
        payload.trigger_key = normalizeTriggerKey(payload.trigger_key);
        await assertTriggerKeyAvailable(payload.trigger_key, id);
        // Audience is not picked in the admin: it follows the trigger.
        if (payload.trigger_key) payload.audience = SYSTEM_TRIGGER_MAP.get(payload.trigger_key).audience;
    }

    const merged = { ...row.toJSON(), ...payload };
    validateChannels(merged);
    payload.variables_used = extractVariablesUsed(...textsOf(merged));

    return baseService.update(NotificationTemplate, MODEL_NAME, id, payload, userId, companyId);
};

const updateStatus = async (id, is_active, userId = null, companyId = undefined) =>
    baseService.update(NotificationTemplate, MODEL_NAME, id, { is_active: is_active ? 1 : 0 }, userId, companyId);

/**
 * An active template that owns a system trigger is live wiring: deleting it
 * would silently stop that message. The admin deactivates it first (the
 * design's "Deletion is restricted" popup). trigger_key is unique even across
 * soft-deleted rows, so remove() stamps it to free the trigger for a new one.
 */
const deleteById = async (id, userId = null, companyId = undefined) => {
    const row = await NotificationTemplate.findByPk(id, { attributes: ['id', 'trigger_key', 'is_active'] });
    if (!row) throw ApiError.notFound('That notification template was not found.');
    if (row.trigger_key && Number(row.is_active) === 1) {
        throw ApiError.badRequest('This template is active and mapped to a trigger. Deactivate it before deleting.');
    }
    return baseService.remove(NotificationTemplate, MODEL_NAME, id, userId, companyId, { uniqueFields: ['trigger_key'] });
};

const duplicate = async (id, userId = null, companyId = undefined) => {
    const row = await NotificationTemplate.findByPk(id);
    if (!row) throw ApiError.notFound('That notification template was not found.');

    const clone = row.toJSON();
    delete clone.id;
    delete clone.created_at;
    delete clone.updated_at;
    delete clone.deleted_at;
    clone.name = `${clone.name} (Copy)`.slice(0, 150);
    clone.is_active = 0;
    // trigger_key is unique — the original keeps ownership of its system trigger.
    clone.trigger_key = null;

    return baseService.create(NotificationTemplate, MODEL_NAME, clone, userId, companyId ?? row.company_id);
};

// ── Send test ───────────────────────────────────────────────────────────────

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * {{var}} -> value. A missing value shows as "[var]" so it is obvious in a test;
 * real sends pass `blank: true` so the reader never sees a placeholder.
 */
const fillValues = (text, values, { html = false, blank = false } = {}) =>
    String(text || '').replace(PLACEHOLDER_RE, (m, key) => {
        const v = values[key];
        if (v === undefined || v === null || v === '') return blank ? '' : `[${key}]`;
        return html ? escapeHtml(v) : String(v);
    });

const buildEmailHtml = (t, values, { blank = false } = {}) => {
    const { wrapWithBaseTemplate } = require('../utils/baseEmailTemplate');
    const fill = (text, v, o = {}) => fillValues(text, v, { ...o, blank });
    const pre = t.email_preheader
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(fill(t.email_preheader, values))}</div>`
        : '';
    const heading = t.email_heading
        ? `<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${escapeHtml(fill(t.email_heading, values))}</h1>`
        : '';
    const button = t.email_button_label && t.email_button_url
        ? `<p style="margin:24px 0"><a href="${escapeHtml(fill(t.email_button_url, values))}" style="background:#e6007e;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(fill(t.email_button_label, values))}</a></p>`
        : '';
    const footer = t.email_footer
        ? `<p style="font-size:12px;color:#6b7280;margin-top:28px">${escapeHtml(fill(t.email_footer, values))}</p>`
        : '';
    const content = `${pre}${heading}${fill(t.email_body, values, { html: true })}${button}${footer}`;
    return wrapWithBaseTemplate(content, { appName: 'EventInvit', appUrl: process.env.CLIENT_URL || '', primaryColor: '#e6007e' });
};

const fill = fillValues;

/** Named {{var}} in order of first use -> the values for Meta's {{1}}, {{2}}, ... */
const orderedValues = (body, values) => {
    const order = [];
    for (const m of String(body || '').matchAll(PLACEHOLDER_RE)) {
        if (!order.includes(m[1])) order.push(m[1]);
    }
    return order.map((k) => (values[k] !== undefined && values[k] !== '' ? String(values[k]) : `[${k}]`));
};

/**
 * Sends the template to the given test recipients only. Production trigger
 * mapping is untouched. Each channel reports its own result:
 *   sent | failed (with the provider's reason) | skipped (with why).
 */
const testSend = async (id, body = {}, companyId = undefined) => {
    const row = await NotificationTemplate.findByPk(id);
    if (!row) throw ApiError.notFound('That notification template was not found.');
    const t = row.toJSON();

    const wanted = Array.isArray(body.channels) ? body.channels.filter((c) => (t.channels || []).includes(c)) : [];
    if (!wanted.length) throw ApiError.badRequest('Pick at least one channel this template uses.');

    const values = { ...(t.sample_values || {}), ...(normalizeSampleValues(body.sample_values) || {}) };
    const results = {};

    if (wanted.includes('email')) {
        const to = String(body.email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            results.email = { status: 'skipped', message: 'Enter a valid test email address.' };
        } else {
            try {
                const emailSender = require('./emailSender.service');
                await emailSender.sendDirect({
                    to,
                    subject: `[TEST] ${fill(t.email_subject, values)}`,
                    body: buildEmailHtml(t, values),
                    companyId,
                });
                results.email = { status: 'sent', message: `Sent to ${to}.` };
            } catch (err) {
                results.email = { status: 'failed', message: err.message || 'The email could not be sent.' };
            }
        }
    }

    if (wanted.includes('whatsapp')) {
        const wa = require('./msg91Whatsapp.service');
        const mobile = String(body.mobile || '').replace(/\D/g, '');
        if (mobile.length < 6) {
            results.whatsapp = { status: 'skipped', message: 'Enter a test WhatsApp number.' };
        } else {
            const r = await wa.sendTemplate({
                dialCode: body.dial_code || '91',
                mobile,
                name: t.whatsapp_template_name,
                bodyValues: t.whatsapp_category === 'authentication'
                    ? [values.otp || '123456']
                    : orderedValues(t.whatsapp_body, values),
                headerText: t.whatsapp_header_type === 'text' ? orderedValues(t.whatsapp_header_text, values) : [],
                buttons: (t.whatsapp_buttons || []).map((b) => (b.type === 'copy_code'
                    ? { kind: 'copy_code', value: values.otp || '123456' }
                    : { kind: 'url', value: orderedValues(b.url, values)[0] || null })),
                purpose: 'template test',
            });
            const reasons = {
                disabled: 'WhatsApp sending is switched off on the server (MSG91_OTP_ENABLED=false).',
                not_configured: 'WhatsApp is not configured on the server yet (MSG91 key / number missing).',
                no_number: 'That WhatsApp number is not valid.',
            };
            results.whatsapp = r.delivered
                ? { status: 'sent', message: `Sent to +${wa.toWhatsAppNumber(body.dial_code || '91', mobile)}.` }
                : {
                    status: r.reason === 'disabled' || r.reason === 'not_configured' ? 'skipped' : 'failed',
                    message: reasons[r.reason] || `MSG91 refused it: ${r.reason}. The template must be approved by Meta under the name "${t.whatsapp_template_name}".`,
                };
        }
    }

    if (wanted.includes('in_app')) {
        // In-app messages land in the Event Invite app of a signed-in organizer
        // or guest; the admin portal has no app inbox to receive a test.
        results.in_app = {
            status: 'skipped',
            message: 'In-app messages appear in the Event Invite app only. Check the preview here; it is exactly what the app shows.',
        };
    }

    logger.info?.(`[notification-template] test send #${id}: ${JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.status])))}`);
    return { results };
};

const getAvailableVariables = () => AVAILABLE_VARIABLES;
const getSystemTriggers = () => SYSTEM_TRIGGERS;
const getSections = () => SECTIONS;

module.exports = {
    getAll,
    getCounts,
    getById,
    create,
    update,
    updateStatus,
    deleteById,
    duplicate,
    testSend,
    buildEmailHtml,
    fillValues,
    getAvailableVariables,
    getSystemTriggers,
    getSections,
    extractVariablesUsed,
    // Alias used by approval.service.js executeApprovedAction
    remove: deleteById,
};
