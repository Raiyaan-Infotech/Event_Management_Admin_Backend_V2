/**
 * Email channel of the Message Templates (admin Notification section).
 *
 * When something happens in the app (account created, date booked, plan changed ...)
 * the code calls `notifyEmail('<trigger_key>', { to, values })`. This finds the ACTIVE
 * template mapped to that trigger, and if its channels include "email" it fills the
 * {{variables}} and sends it — through Amazon SES when the SES_* env variables are set
 * (see sesMailer.service.js), otherwise through the saved Email Configuration.
 *
 * Rules:
 *   - No template, template inactive / draft, or email not ticked -> nothing is sent.
 *   - Per-event templates obey the organizer's on/off switch for that event
 *     (event_notification_template_prefs, "no row = on").
 *   - Never throws and never slows the request: notifyEmail runs after the response
 *     path, a failure is only logged.
 */
const { Op } = require('sequelize');
const { NotificationTemplate, EventNotificationTemplatePref } = require('../models');
const logger = require('../utils/logger');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The client portal address used for {{login_link}} and other portal links. */
const portalUrl = () =>
    String(process.env.CLIENT_PORTAL_URL || process.env.CLIENT_URL || 'https://eventmanagementclientv2.vercel.app')
        .trim()
        .replace(/\/+$/, '');

/** Values every template may use without the caller passing them. */
const defaultValues = () => {
    const portal = portalUrl();
    return {
        app_name: process.env.APP_NAME || 'EventInvit',
        support_email: process.env.SUPPORT_EMAIL || process.env.SES_REPLY_TO || require('./sesMailer.service').fromEmail() || '',
        login_link: `${portal}/dashboard`,
        create_event_link: `${portal}/dashboard/events/create`,
        upgrade_link: `${portal}/dashboard/billing`,
        invoice_link: `${portal}/dashboard/billing`,
        chat_link: `${portal}/dashboard`,
        current_year: String(new Date().getFullYear()),
    };
};

const hasEmail = (t) => Array.isArray(t.channels) && t.channels.includes('email');

const findTemplate = async (triggerKey, eventCategoryId) => {
    const where = { trigger_key: triggerKey, is_active: 1 };
    if (eventCategoryId) {
        where[Op.or] = [{ event_category_id: null }, { event_category_id: eventCategoryId }];
    }
    const row = await NotificationTemplate.findOne({ where, order: [['id', 'ASC']] });
    return row ? row.toJSON() : null;
};

const isOffForEvent = async (eventId, templateId) => {
    if (!eventId) return false;
    const pref = await EventNotificationTemplatePref.findOne({
        where: { event_id: eventId, notification_template_id: templateId },
        attributes: ['enabled'],
    });
    return Boolean(pref && !pref.enabled);
};

/**
 * Sends the trigger's email now and reports what happened:
 *   { status: 'sent' | 'skipped' | 'failed', reason?, messageId? }
 */
const sendTriggerEmail = async (triggerKey, { to, values = {}, eventId = null, eventCategoryId = null } = {}) => {
    const recipients = (Array.isArray(to) ? to : [to])
        .map((s) => String(s || '').trim().toLowerCase())
        .filter((s) => EMAIL_RE.test(s));
    if (!recipients.length) return { status: 'skipped', reason: 'no recipient email' };

    const t = await findTemplate(triggerKey, eventCategoryId);
    if (!t) return { status: 'skipped', reason: 'no active template for this trigger' };
    if (!hasEmail(t)) return { status: 'skipped', reason: 'email not ticked on the template' };
    if (!t.email_subject || !t.email_body) return { status: 'skipped', reason: 'template has no email subject / body' };
    if (await isOffForEvent(eventId, t.id)) return { status: 'skipped', reason: 'turned off for this event' };

    const templates = require('./notificationTemplate.service');
    const emailSender = require('./emailSender.service');
    const all = { ...defaultValues(), ...clean(values) };

    const subject = templates.fillValues(t.email_subject, all, { blank: true });
    const html = templates.buildEmailHtml(t, all, { blank: true });

    const result = { status: 'sent', sent: [], failed: [] };
    // One mail per person, so one guest never sees another guest's address.
    for (const addr of recipients) {
        try {
            const r = await emailSender.sendDirect({ to: addr, subject, body: html });
            result.sent.push(addr);
            result.messageId = r.messageId;
        } catch (err) {
            result.failed.push({ to: addr, reason: err.message });
        }
    }
    if (!result.sent.length) {
        result.status = 'failed';
        result.reason = result.failed[0]?.reason;
    }
    logger.info?.(`[notification-email] ${triggerKey} template #${t.id}: sent ${result.sent.length}, failed ${result.failed.length}${result.reason ? ` (${result.reason})` : ''}`);
    return result;
};

/** Drops null / undefined and turns numbers / dates into text. */
const clean = (values) => {
    const out = {};
    for (const [k, v] of Object.entries(values || {})) {
        if (v === undefined || v === null) continue;
        out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    }
    return out;
};

/**
 * Fire-and-forget: the caller does not wait and a failure never reaches the
 * user's request. Use this at every fire point.
 */
const notifyEmail = (triggerKey, opts = {}) => {
    setImmediate(() => {
        sendTriggerEmail(triggerKey, opts).catch((err) => {
            logger.warn?.(`[notification-email] ${triggerKey} failed: ${err.message}`);
        });
    });
};

/** "INR 1,180.00" style amount for the templates. */
const money = (amount, currency = 'INR') => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '';
    return `${currency} ${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

module.exports = { notifyEmail, sendTriggerEmail, portalUrl, money };
