const crypto = require('crypto');
const { Sequelize, sequelize, Event, Guest, GuestGroup, InvitationSend } = require('../models');
const { Op } = Sequelize;
const ApiError = require('../utils/apiError');

/**
 * Invitations flow — step 3 "Share with Guests" and step 4 "Track Responses"
 * (Jamal's design, 2026-11-18).
 *
 * WHO: the host's phone-book guests of ONE event (`guests.event_id`), picked by
 * group or one by one. Not event participants — a participant is somebody who
 * already scanned the QR, and an invitation goes to people who have not.
 *
 * WHAT IS SAVED: one `invitation_sends` row per guest per send, and the guest is
 * stamped invited (`invited_at`, `invite_channels`, `invite_message`) exactly as
 * the Share Event popup's Send does.
 *
 * ⚠ NOTHING IS DELIVERED YET (Jamal, 2026-11-18: "save this data into db for
 * now"). There is no WhatsApp Business account or SMTP here, so a send is
 * written as `recorded`, never `sent` — a row that said "sent" would be
 * indistinguishable from a real delivery once a provider is connected.
 * A scheduled send is written as `scheduled` and the guest is not stamped until
 * it goes out (a scheduler / provider will do that later).
 *
 * No RSVP anywhere here (Jamal: "don't use RSVP in the list page"). "Joined" =
 * the guest has scanned the QR and become a participant of the event.
 */

const CHANNELS = ['whatsapp', 'email'];
const STATUSES = ['recorded', 'scheduled', 'sent', 'delivered', 'failed'];
const MAX_MESSAGE = 1000;

/** The host's event, or a 404 that does not confirm somebody else's. */
const ownEvent = async (clientId, rawId) => {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Choose an event.');
    const event = await Event.findOne({
        where: { id, website_client_id: clientId },
        attributes: ['id', 'name', 'host_one', 'host_two', 'start_date', 'start_time', 'venue_name', 'venue_address', 'qr_token'],
    });
    if (!event) throw ApiError.notFound('Event not found.');
    return event;
};

/** Can this guest be reached on this channel? */
const reachable = (g, channel) => (channel === 'email' ? Boolean(g.email) : Boolean(g.whatsapp || g.mobile));

/**
 * "Joined" per guest: a participant row of this event linked to the guest, or
 * with the same mobile (last 10 digits) — the same match the Guests list uses.
 */
const joinedSql = (eventId) => `EXISTS (SELECT 1 FROM event_participants p
    WHERE p.event_id = ${Number(eventId)} AND p.deleted_at IS NULL
      AND (p.guest_id = g.id
           OR (CHAR_LENGTH(REGEXP_REPLACE(IFNULL(g.mobile, ''), '[^0-9]', '')) >= 7
               AND RIGHT(REGEXP_REPLACE(IFNULL(p.mobile, ''), '[^0-9]', ''), 10)
                 = RIGHT(REGEXP_REPLACE(g.mobile, '[^0-9]', ''), 10))))`;

/* ── Step 3: who can be picked ─────────────────────────────────────────── */

/**
 * The event's guests (every one, light fields) and the host's groups with how
 * many of this event's guests are in each. One call for the whole step.
 */
const getAudience = async (client, { eventId } = {}) => {
    const event = await ownEvent(client.id, eventId);
    const [guests, groups] = await Promise.all([
        Guest.findAll({
            where: { website_client_id: client.id, event_id: event.id },
            attributes: ['id', 'name', 'email', 'dial_code', 'mobile', 'whatsapp', 'group_id', 'invited_at'],
            order: [['name', 'ASC']],
        }),
        GuestGroup.findAll({
            where: { website_client_id: client.id },
            attributes: ['id', 'name', 'color'],
            order: [['name', 'ASC']],
        }),
    ]);
    const countByGroup = new Map();
    for (const g of guests) if (g.group_id) countByGroup.set(g.group_id, (countByGroup.get(g.group_id) || 0) + 1);
    const groupById = new Map(groups.map((g) => [g.id, g]));
    return {
        event: { id: event.id, name: event.name },
        groups: groups
            .map((g) => ({ id: g.id, name: g.name, color: g.color, guest_count: countByGroup.get(g.id) || 0 }))
            // Only groups that hold somebody of THIS event; an empty one cannot be invited.
            .filter((g) => g.guest_count > 0),
        guests: guests.map((g) => ({
            id: g.id,
            name: g.name,
            email: g.email,
            dial_code: g.dial_code,
            mobile: g.mobile,
            whatsapp: g.whatsapp,
            invited_at: g.invited_at,
            group: g.group_id && groupById.get(g.group_id)
                ? { id: g.group_id, name: groupById.get(g.group_id).name, color: groupById.get(g.group_id).color }
                : null,
        })),
        // No provider is connected: the screen says so instead of implying delivery.
        delivery_connected: false,
    };
};

/* ── Step 3: send (= record) ───────────────────────────────────────────── */

const send = async (client, body = {}) => {
    const event = await ownEvent(client.id, body.event_id);

    const channel = String(body.channel || '').toLowerCase();
    if (!CHANNELS.includes(channel)) throw ApiError.badRequest('Choose WhatsApp or Email.');

    const message = String(body.message || '').trim();
    if (!message) throw ApiError.badRequest('Please write the invitation message.');
    if (message.length > MAX_MESSAGE) throw ApiError.badRequest(`The message can be at most ${MAX_MESSAGE} characters.`);

    const subject = String(body.subject || '').trim().slice(0, 255) || null;
    if (channel === 'email' && !subject) throw ApiError.badRequest('Please enter the email subject.');

    let scheduledAt = null;
    if (body.scheduled_at) {
        scheduledAt = new Date(body.scheduled_at);
        if (Number.isNaN(scheduledAt.getTime())) throw ApiError.badRequest('That is not a valid date and time.');
        // A time already past is a mistake, not "send now".
        if (scheduledAt.getTime() < Date.now() - 60_000) throw ApiError.badRequest('That time has already passed. Choose a later time.');
    }

    // Groups and individuals may be combined ("by Group or Individuals, or both").
    const groupIds = (Array.isArray(body.group_ids) ? body.group_ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const guestIds = (Array.isArray(body.guest_ids) ? body.guest_ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!groupIds.length && !guestIds.length) throw ApiError.badRequest('Choose at least one group or guest.');

    const or = [];
    if (groupIds.length) or.push({ group_id: { [Op.in]: groupIds } });
    if (guestIds.length) or.push({ id: { [Op.in]: guestIds } });
    const picked = await Guest.findAll({
        where: { website_client_id: client.id, event_id: event.id, [Op.or]: or },
        attributes: ['id', 'name', 'email', 'mobile', 'whatsapp'],
    });

    const eligible = picked.filter((g) => reachable(g, channel));
    const skipped = picked.length - eligible.length;
    if (!eligible.length) {
        throw ApiError.badRequest(picked.length
            ? `None of the ${picked.length} selected guests has ${channel === 'email' ? 'an email address' : 'a mobile number'}.`
            : 'No guests match that selection.');
    }

    const now = new Date();
    const batchKey = crypto.randomBytes(12).toString('hex');
    const status = scheduledAt ? 'scheduled' : 'recorded';

    await sequelize.transaction(async (t) => {
        await InvitationSend.bulkCreate(eligible.map((g) => ({
            website_client_id: client.id,
            event_id: event.id,
            guest_id: g.id,
            batch_key: batchKey,
            channel,
            subject,
            message,
            status,
            scheduled_at: scheduledAt,
            sent_at: scheduledAt ? null : now,
        })), { transaction: t });

        // Stamped now only when it goes now — a scheduled invite has not reached anybody yet.
        if (!scheduledAt) {
            await Guest.update(
                { invited_at: now, invite_channels: [channel], invite_message: message.slice(0, 1000) },
                { where: { website_client_id: client.id, id: { [Op.in]: eligible.map((g) => g.id) } }, transaction: t },
            );
        }
    });

    return {
        batch_key: batchKey,
        channel,
        status,
        recipients: eligible.length,
        skipped,
        scheduled_at: scheduledAt,
        sent_at: scheduledAt ? null : now,
        delivery_connected: false,
    };
};

/* ── Step 4: the list ──────────────────────────────────────────────────── */

const list = async (client, query = {}) => {
    const event = await ownEvent(client.id, query.event_id);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));

    const where = { website_client_id: client.id, event_id: event.id };
    if (CHANNELS.includes(query.channel)) where.channel = query.channel;
    if (STATUSES.includes(query.status)) where.status = query.status;

    const search = String(query.search || '').trim();
    if (search) {
        const like = `%${search}%`;
        where.guest_id = {
            [Op.in]: Sequelize.literal(`(SELECT gs.id FROM guests gs
                WHERE gs.website_client_id = ${Number(client.id)} AND gs.deleted_at IS NULL
                  AND (gs.name LIKE ${sequelize.escape(like)} OR gs.email LIKE ${sequelize.escape(like)}
                       OR gs.mobile LIKE ${sequelize.escape(like)}))`),
        };
    }

    const { rows, count } = await InvitationSend.findAndCountAll({
        where,
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        offset: (page - 1) * limit,
        limit,
    });

    // The page's guests in one query, with "joined".
    const ids = [...new Set(rows.map((r) => r.guest_id))];
    const guestById = new Map();
    if (ids.length) {
        const [guests] = await sequelize.query(
            `SELECT g.id, g.name, g.email, g.dial_code, g.mobile, g.whatsapp, g.group_id,
                    gg.name AS group_name, gg.color AS group_color,
                    ${joinedSql(event.id)} AS joined
               FROM guests g
               LEFT JOIN guest_groups gg ON gg.id = g.group_id
              WHERE g.id IN (${ids.map(Number).join(',')})`,
        );
        for (const g of guests) guestById.set(Number(g.id), g);
    }

    return {
        rows: rows.map((r) => {
            const g = guestById.get(Number(r.guest_id));
            return {
                id: r.id,
                batch_key: r.batch_key,
                channel: r.channel,
                subject: r.subject,
                message: r.message,
                status: r.status,
                scheduled_at: r.scheduled_at,
                sent_at: r.sent_at,
                delivered_at: r.delivered_at,
                opened_at: r.opened_at,
                failed_reason: r.failed_reason,
                created_at: r.created_at,
                guest: g
                    ? {
                        id: Number(g.id), name: g.name, email: g.email, dial_code: g.dial_code,
                        mobile: g.mobile, whatsapp: g.whatsapp,
                        group: g.group_id ? { id: Number(g.group_id), name: g.group_name, color: g.group_color } : null,
                        joined: Boolean(Number(g.joined)),
                    }
                    // The guest was deleted after the send; the row still tells what was sent.
                    : null,
            };
        }),
        pagination: { page, limit, totalItems: count, totalPages: Math.max(1, Math.ceil(count / limit)) },
        stats: await stats(client.id, event.id),
        delivery_connected: false,
    };
};

/** The four cards and the Delivery Snapshot, for the whole event (never the filtered page). */
const stats = async (clientId, eventId) => {
    const [[totals]] = await sequelize.query(
        `SELECT COUNT(*) AS total,
                SUM(s.status <> 'scheduled') AS shared,
                SUM(s.status IN ('sent','delivered')) AS sent,
                SUM(s.status = 'delivered') AS delivered,
                SUM(s.status = 'scheduled') AS scheduled,
                SUM(s.status = 'failed') AS failed,
                SUM(s.channel = 'whatsapp') AS whatsapp,
                SUM(s.channel = 'email') AS email,
                COUNT(DISTINCT s.guest_id) AS guests
           FROM invitation_sends s
          WHERE s.website_client_id = :clientId AND s.event_id = :eventId AND s.deleted_at IS NULL`,
        { replacements: { clientId, eventId } },
    );
    const [[joined]] = await sequelize.query(
        `SELECT COUNT(*) AS n FROM guests g
          WHERE g.deleted_at IS NULL AND g.website_client_id = :clientId
            AND g.id IN (SELECT s.guest_id FROM invitation_sends s
                          WHERE s.event_id = :eventId AND s.deleted_at IS NULL)
            AND ${joinedSql(eventId)}`,
        { replacements: { clientId, eventId } },
    );
    const n = (v) => Number(v) || 0;
    return {
        total: n(totals.total),
        shared: n(totals.shared),
        sent: n(totals.sent),
        delivered: n(totals.delivered),
        scheduled: n(totals.scheduled),
        failed: n(totals.failed),
        guests: n(totals.guests),
        joined: n(joined.n),
        by_channel: { whatsapp: n(totals.whatsapp), email: n(totals.email) },
    };
};

/* ── Step 4: row actions ───────────────────────────────────────────────── */

const ownRow = async (clientId, id) => {
    const row = await InvitationSend.findOne({ where: { id: Number(id) || 0, website_client_id: clientId } });
    if (!row) throw ApiError.notFound('Invitation not found.');
    return row;
};

/** Resend Invitation: a new row for the same guest, channel and message, now. */
const resend = async (client, id) => {
    const row = await ownRow(client.id, id);
    const guest = await Guest.findOne({
        where: { id: row.guest_id, website_client_id: client.id },
        attributes: ['id', 'email', 'mobile', 'whatsapp'],
    });
    if (!guest) throw ApiError.badRequest('That guest has been removed.');
    if (!reachable(guest, row.channel)) {
        throw ApiError.badRequest(`This guest has no ${row.channel === 'email' ? 'email address' : 'mobile number'} any more.`);
    }
    const now = new Date();
    const created = await sequelize.transaction(async (t) => {
        const r = await InvitationSend.create({
            website_client_id: client.id,
            event_id: row.event_id,
            guest_id: row.guest_id,
            batch_key: crypto.randomBytes(12).toString('hex'),
            channel: row.channel,
            subject: row.subject,
            message: row.message,
            status: 'recorded',
            sent_at: now,
        }, { transaction: t });
        await Guest.update({ invited_at: now }, { where: { id: guest.id }, transaction: t });
        return r;
    });
    return { id: created.id, status: created.status, sent_at: created.sent_at, delivery_connected: false };
};

/** Remove Recipient: the row leaves the list (soft delete). The guest is untouched. */
const remove = async (client, id) => {
    const row = await ownRow(client.id, id);
    await row.destroy();
    return { id: row.id };
};

module.exports = { getAudience, send, list, resend, remove, CHANNELS, STATUSES };
