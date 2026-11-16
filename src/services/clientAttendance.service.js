const { Sequelize, Event, EventParticipant, WebsiteClient } = require('../models');
const ApiError = require('../utils/apiError');
const { relationOf } = require('./clientQrScan.service');

const { Op } = Sequelize;

/**
 * EVENT ATTENDANCE — client portal → event → QR Code → Event Attendance (Jamal's design, 2026-11-16).
 *
 * A LIST of what happened at the event, plus the organizer's own actions:
 *   Attended      = `checked_in_at` set — by a QR scan (clientCheckIn.checkIn, source 'event_qr'),
 *                   a self check-in link ('self_link'), or Mark Attendance here ('manual').
 *   Verified      = `verified_at` set — Verify Participant here (QR code / manual ID check).
 *                   NULL = Pending. (Before this module Verify only SHOWED the details.)
 * Session QR is out (Jamal, 2026-11-16).
 *
 * Routes are /events/:id/attendance…, so eventOrganizerAccess has already made an organizer or
 * contact person act as the event's owner: owning the event is the check (as clientCheckIn).
 * Hidden participants stay out (as the Participants main list); blocked ones are listed but
 * cannot be verified or checked in.
 */

const SOURCES = ['event_qr', 'manual', 'self_link'];
const METHODS = ['qr', 'manual'];

const ownEvent = async (req, eventId) => {
    const event = await Event.findOne({
        where: { id: Number(eventId) || 0, website_client_id: req.websiteClient.id },
        attributes: ['id', 'name', 'start_date', 'end_date'],
    });
    if (!event) throw ApiError.notFound('Event not found.');
    return event;
};

/** Who did it: the real caller (organizer / contact person), else the owner. */
const actor = (req) => {
    const by = req.organizerClient || req.websiteClient;
    return { id: Number(by?.id) || null, name: by?.name || null };
};

const str = (v, max) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : null;
};

/** A check-in made before sources were recorded came from the organizer's QR scan in the app. */
const sourceOf = (p) => (p.checked_in_at ? p.check_in_source || 'event_qr' : null);

const participantCode = (p, event) =>
    `EVT${String(event.start_date || '').slice(0, 4) || new Date().getFullYear()}-${String(p.id).padStart(6, '0')}`;

const CLIENT_ATTRS = ['id', 'name', 'avatar_url', 'dial_code', 'mobile', 'email'];

const present = (p, event, client) => {
    const name = [p.title, p.name].filter((v) => String(v || '').trim()).join(' ');
    return {
        id: p.id,
        participant_code: participantCode(p, event),
        name: name || client?.name || 'Participant',
        photo: p.photo || client?.avatar_url || null,
        dial_code: p.dial_code || client?.dial_code || '+91',
        mobile: p.mobile || client?.mobile || null,
        email: p.email || client?.email || null,
        relation: relationOf(p),
        relationship: p.relationship || null,
        rsvp_status: p.rsvp_status,
        party_size: Number(p.party_size) || 1,
        is_blocked: !!p.is_blocked,
        joined_app: !!p.participant_client_id,
        registered_at: p.created_at || p.createdAt || null,
        attendance: p.checked_in_at ? 'attended' : 'not_attended',
        checked_in_at: p.checked_in_at,
        checked_in_by_name: p.checked_in_by_name,
        check_in_source: sourceOf(p),
        check_in_note: p.check_in_note,
        verification: p.verified_at ? 'verified' : 'pending',
        verified_at: p.verified_at,
        verified_by_name: p.verified_by_name,
        verify_method: p.verify_method,
        verify_note: p.verify_note,
    };
};

/** App accounts of the rows, for the photo / contact fallback. */
const clientsOf = async (rows) => {
    const ids = [...new Set(rows.map((r) => r.participant_client_id).filter(Boolean))];
    if (!ids.length) return new Map();
    const list = await WebsiteClient.findAll({ where: { id: ids }, attributes: CLIENT_ATTRS });
    return new Map(list.map((c) => [c.id, c]));
};

const baseWhere = (eventId) => ({ event_id: eventId, is_hidden: false });

/**
 * GET /client/events/:id/attendance
 *   ?search= &attendance=all|attended|not_attended &verification=all|verified|pending
 *   &relationship=<value>|all &page= &limit=
 * → { stats, relationships, rows, pagination }. Stats are for the whole event (not the filter).
 */
const list = async (req, eventId, query = {}) => {
    const event = await ownEvent(req, eventId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 8));

    // The list = only participants who were verified or marked present (Jamal, 2026-11-16).
    // The stat cards still count the whole event.
    const where = { ...baseWhere(event.id), [Op.and]: [{ [Op.or]: [{ verified_at: { [Op.ne]: null } }, { checked_in_at: { [Op.ne]: null } }] }] };
    const attendance = String(query.attendance || 'all');
    if (attendance === 'attended') where.checked_in_at = { [Op.ne]: null };
    else if (attendance === 'not_attended') where.checked_in_at = null;
    const verification = String(query.verification || 'all');
    if (verification === 'verified') where.verified_at = { [Op.ne]: null };
    else if (verification === 'pending') where.verified_at = null;
    const relationship = String(query.relationship || '').trim();
    if (relationship && relationship !== 'all') where.relationship = relationship;
    const search = String(query.search || '').trim();
    if (search) {
        where[Op.or] = [
            { name: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
            { mobile: { [Op.like]: `%${search}%` } },
        ];
    }

    const [{ rows, count }, all] = await Promise.all([
        EventParticipant.findAndCountAll({
            where,
            order: [[Sequelize.literal('checked_in_at IS NULL'), 'ASC'], ['checked_in_at', 'DESC'], ['id', 'DESC']],
            limit,
            offset: (page - 1) * limit,
        }),
        EventParticipant.findAll({
            where: baseWhere(event.id),
            attributes: ['checked_in_at', 'check_in_source', 'verified_at', 'relationship'],
            raw: true,
        }),
    ]);

    const total = all.length;
    const attended = all.filter((r) => r.checked_in_at).length;
    const verified = all.filter((r) => r.verified_at).length;
    // Total Scans = check-ins that came from a scan or link, not from Mark Attendance by hand.
    const scans = all.filter((r) => r.checked_in_at && r.check_in_source !== 'manual').length;
    const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    const clients = await clientsOf(rows);

    return {
        stats: {
            total,
            attended, attended_pct: pct(attended),
            verified, verified_pct: pct(verified),
            not_attended: total - attended, not_attended_pct: pct(total - attended),
            total_scans: scans,
        },
        relationships: [...new Set(all.map((r) => String(r.relationship || '').trim()).filter(Boolean))].sort(),
        rows: rows.map((p) => present(p, event, clients.get(p.participant_client_id))),
        pagination: { page, limit, totalItems: count, totalPages: Math.max(1, Math.ceil(count / limit)) },
    };
};

const findRow = async (event, participantId) => {
    const p = await EventParticipant.findOne({
        where: { id: Number(participantId) || 0, ...baseWhere(event.id) },
    });
    if (!p) throw ApiError.notFound('Participant not found.');
    return p;
};

const withClient = async (p, event) => {
    const client = p.participant_client_id ? await WebsiteClient.findByPk(p.participant_client_id, { attributes: CLIENT_ATTRS }) : null;
    return present(p, event, client);
};

/** Newest first: registered, verified, checked in — what the record holds. */
const historyOf = (row) => {
    const items = [];
    if (row.registered_at) items.push({ type: 'registered', at: row.registered_at, label: row.joined_app ? 'Registered through the app' : 'Added by the organizer' });
    if (row.verified_at) items.push({ type: 'verified', at: row.verified_at, label: `Verified (${row.verify_method === 'qr' ? 'QR code' : 'manual check'})`, by: row.verified_by_name });
    if (row.checked_in_at) {
        const how = { event_qr: 'QR scan', manual: 'marked by hand', self_link: 'self check-in link' }[row.check_in_source] || 'QR scan';
        items.push({ type: 'checked_in', at: row.checked_in_at, label: `Checked in (${how})`, by: row.checked_in_by_name });
    }
    return items.sort((a, b) => new Date(b.at) - new Date(a.at));
};

/** GET /client/events/:id/attendance/:participantId → the row + its history. */
const getOne = async (req, eventId, participantId) => {
    const event = await ownEvent(req, eventId);
    const row = await withClient(await findRow(event, participantId), event);
    return { ...row, history: historyOf(row) };
};

const notBlocked = (p) => {
    if (p.is_blocked) throw ApiError.badRequest('This participant is blocked. Unblock them in Participants first.');
};

/**
 * POST /client/events/:id/attendance/:participantId/verify { verified = true, method, note }
 * verified:false puts them back to Pending.
 */
const verify = async (req, eventId, participantId, body = {}) => {
    const event = await ownEvent(req, eventId);
    const p = await findRow(event, participantId);
    const on = body.verified === undefined ? true : body.verified === true || body.verified === 'true' || body.verified === 1;
    if (!on) {
        await p.update({ verified_at: null, verified_by_client_id: null, verified_by_name: null, verify_method: null, verify_note: null });
    } else {
        notBlocked(p);
        const method = METHODS.includes(body.method) ? body.method : 'manual';
        const by = actor(req);
        await p.update({
            verified_at: p.verified_at || new Date(),
            verified_by_client_id: by.id,
            verified_by_name: by.name,
            verify_method: method,
            verify_note: str(body.note, 500),
        });
    }
    return withClient(p, event);
};

/**
 * POST /client/events/:id/attendance/:participantId/mark { status: attended|not_attended, at?, note? }
 * Mark Attendance by hand — source 'manual'. `at` = when they arrived (defaults to now).
 */
const mark = async (req, eventId, participantId, body = {}) => {
    const event = await ownEvent(req, eventId);
    const p = await findRow(event, participantId);
    const status = String(body.status || '');
    if (!['attended', 'not_attended'].includes(status)) throw ApiError.badRequest('Please choose Attended or Not Attended.');
    if (status === 'not_attended') {
        await p.update({ checked_in_at: null, checked_in_by_client_id: null, checked_in_by_name: null, check_in_source: null, check_in_note: str(body.note, 500) });
    } else {
        notBlocked(p);
        let at = new Date();
        if (body.at) {
            at = new Date(body.at);
            if (Number.isNaN(at.getTime())) throw ApiError.badRequest('Please enter a valid date and time.');
            if (at.getTime() > Date.now() + 5 * 60 * 1000) throw ApiError.badRequest('The check-in time cannot be in the future.');
        }
        const by = actor(req);
        await p.update({
            checked_in_at: at,
            checked_in_by_client_id: by.id,
            checked_in_by_name: by.name,
            check_in_source: 'manual',
            check_in_note: str(body.note, 500),
        });
    }
    return withClient(p, event);
};

/**
 * POST /client/events/:id/attendance/bulk { action: verify|attend, ids: [] }
 * Marks the selected rows that are not verified / checked in yet. Blocked rows are skipped.
 */
const bulk = async (req, eventId, body = {}) => {
    const event = await ownEvent(req, eventId);
    const action = String(body.action || '');
    if (!['verify', 'attend'].includes(action)) throw ApiError.badRequest('Unknown action.');
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean))].slice(0, 500);
    if (!ids.length) throw ApiError.badRequest('Please select at least one participant.');
    const by = actor(req);
    const now = new Date();
    const where = { id: ids, ...baseWhere(event.id), is_blocked: false };
    const [updated] = action === 'verify'
        ? await EventParticipant.update(
            { verified_at: now, verified_by_client_id: by.id, verified_by_name: by.name, verify_method: 'manual' },
            { where: { ...where, verified_at: null } },
        )
        : await EventParticipant.update(
            { checked_in_at: now, checked_in_by_client_id: by.id, checked_in_by_name: by.name, check_in_source: 'manual' },
            { where: { ...where, checked_in_at: null } },
        );
    return { updated, selected: ids.length };
};

module.exports = { list, getOne, verify, mark, bulk, SOURCES };
