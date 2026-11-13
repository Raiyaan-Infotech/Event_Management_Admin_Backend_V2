/**
 * Event Allocation / support requests (2026-11-13).
 *
 * On the client's Check Event Availability page, a date (Single Date Event) or a consecutive range
 * (Multi Date Event) with at least one unavailable day offers "Contact Support". The client chooses
 * Request a Call Back or Email Support; the request is stored with a ticket number and lands in the
 * super admin's Allocation Requests (review → one-time exception approve, or reject — next build).
 */
const { Sequelize, AvailabilityRequest, WebsiteClient, User } = require('../models');
const { Op } = Sequelize;
const ApiError = require('../utils/apiError');
const mediaService = require('./media.service');
const { clientCalendar } = require('./eventAvailability.service');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;
const ATTACH_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const ATTACH_BYTES = 5 * 1024 * 1024;

const text = (v, max) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : '';
};
const ticketFor = (row) => `EAR-${String(row.start_date).slice(0, 4)}-${1000 + Number(row.id)}`;

const present = (r) => {
    const p = typeof r.get === 'function' ? r.get({ plain: true }) : r;
    let unavailable = p.unavailable_dates;
    if (typeof unavailable === 'string') { try { unavailable = JSON.parse(unavailable); } catch { unavailable = []; } }
    return {
        id: p.id,
        ticket_no: p.ticket_no,
        booking_type: p.booking_type,
        start_date: p.start_date,
        end_date: p.end_date,
        unavailable_dates: unavailable || [],
        contact_method: p.contact_method,
        contact_name: p.contact_name,
        contact_mobile: p.contact_mobile,
        contact_email: p.contact_email,
        preferred_call_time: p.preferred_call_time,
        subject: p.subject,
        message: p.message,
        attachment_url: p.attachment_url,
        attachment_name: p.attachment_name,
        status: p.status,
        decision_reason: p.decision_reason,
        decision: (() => { if (typeof p.decision !== 'string') return p.decision || null; try { return JSON.parse(p.decision); } catch { return null; } })(),
        decided_at: p.decided_at,
        created_at: p.created_at,
    };
};

/**
 * body: booking_type, start_date, end_date, contact_method (call | email), contact_name, message,
 *       call → contact_mobile + preferred_call_time; email → contact_email + subject (+ optional file).
 */
const createRequest = async (clientId, body = {}, file = null) => {
    const client = await WebsiteClient.findByPk(clientId, { attributes: ['id', 'company_id'] });
    if (!client) throw ApiError.notFound('Account not found.');

    const bookingType = body.booking_type === 'multiple' ? 'multiple' : 'single';
    const start = text(body.start_date, 10);
    const end = bookingType === 'multiple' ? text(body.end_date, 10) : start;
    if (!DATE_ONLY.test(start) || !DATE_ONLY.test(end)) throw ApiError.badRequest('Please choose the event date(s).');
    if (end < start) throw ApiError.badRequest('The end date cannot be before the start date.');
    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
    if (days > MAX_RANGE_DAYS) throw ApiError.badRequest(`Please choose at most ${MAX_RANGE_DAYS} days.`);

    // The unavailable days are worked out here, not trusted from the browser.
    const cal = await clientCalendar({ from: start, to: end }, clientId);
    const unavailable = cal.days
        .filter((d) => d.status !== 'available' && d.status !== 'low')
        .map((d) => ({ date: d.date, status: d.status }));
    if (!unavailable.length) {
        throw ApiError.badRequest('All the selected dates are available — you can continue and create the event.');
    }

    const method = body.contact_method === 'email' ? 'email' : body.contact_method === 'call' ? 'call' : null;
    if (!method) throw ApiError.badRequest('Please choose Request a Call Back or Email Support.');
    const data = {
        website_client_id: client.id,
        company_id: client.company_id ?? null,
        booking_type: bookingType,
        start_date: start,
        end_date: end,
        unavailable_dates: unavailable,
        contact_method: method,
        contact_name: text(body.contact_name, 150),
        message: text(body.message, 500),
        status: 'pending',
    };
    if (!data.contact_name) throw ApiError.badRequest('Please enter your name.');
    if (!data.message) throw ApiError.badRequest('Please enter the message / details.');

    if (method === 'call') {
        data.contact_mobile = text(body.contact_mobile, 30);
        data.preferred_call_time = text(body.preferred_call_time, 60);
        if (data.contact_mobile.replace(/\D/g, '').length < 10) throw ApiError.badRequest('Please enter a valid mobile number.');
        if (!data.preferred_call_time) throw ApiError.badRequest('Please choose the preferred call time.');
    } else {
        data.contact_email = text(body.contact_email, 190);
        data.subject = text(body.subject, 200);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email)) throw ApiError.badRequest('Please enter a valid email address.');
        if (!data.subject) throw ApiError.badRequest('Please enter the subject.');
        if (file && file.buffer) {
            if (!ATTACH_MIMES.includes(file.mimetype)) throw ApiError.badRequest('Attach a PDF, JPG or PNG file.');
            if (file.size > ATTACH_BYTES) throw ApiError.badRequest('The attachment is larger than 5 MB.');
            const stored = await mediaService.upload(file, { folder: `availability-requests/${client.id}` }, client.company_id || 1);
            if (!stored?.url) throw ApiError.badRequest('The attachment could not be stored.');
            data.attachment_url = stored.url;
            data.attachment_name = String(file.originalname).slice(0, 255);
        }
    }

    const row = await AvailabilityRequest.create(data);
    await row.update({ ticket_no: ticketFor(row) });
    return present(row);
};

/** The client's own requests, newest first. */
const listForClient = async (clientId) => {
    const rows = await AvailabilityRequest.findAll({
        where: { website_client_id: clientId },
        order: [['created_at', 'DESC']],
        limit: 50,
    });
    return rows.map(present);
};

/**
 * One of the client's own requests + the live availability of its dates (the Tracking / Approved /
 * Rejected pages). `days` are the general totals; the client's own exception is in `decision`.
 */
const getForClient = async (clientId, id) => {
    const row = await AvailabilityRequest.findOne({ where: { id, website_client_id: clientId } });
    if (!row) throw ApiError.notFound('Request not found.');
    const out = present(row);
    const cal = await clientCalendar({ from: out.start_date, to: out.end_date }, null);
    out.days = cal.days.map((d) => ({ date: d.date, day: d.day, status: d.status, daily_max: d.daily_max, booked: d.booked, balance: d.balance }));
    return out;
};

/* ── super admin: Allocation Requests ──────────────────────────────────────────────────────────── */

const REJECT_CATEGORIES = ['No capacity available', 'Date blocked by admin', 'Incomplete information', 'Duplicate request', 'Other'];
const EXPIRY_HOURS = [24, 48, 72];

const parseJson = (v) => {
    if (typeof v !== 'string') return v || null;
    try { return JSON.parse(v); } catch { return null; }
};

const withClient = async (rows) => {
    const ids = [...new Set(rows.map((r) => r.website_client_id))];
    const clients = ids.length
        ? await WebsiteClient.findAll({ where: { id: ids }, attributes: ['id', 'name', 'email', 'mobile', 'dial_code', 'company_name'], paranoid: false, raw: true })
        : [];
    const byId = new Map(clients.map((c) => [c.id, c]));
    return rows.map((r) => {
        const c = byId.get(r.website_client_id) || {};
        const mobile = c.mobile ? `${c.dial_code ? `${c.dial_code} ` : ''}${c.mobile}` : null;
        return { ...present(r), client: { id: r.website_client_id, name: c.name || null, email: c.email || null, mobile, company_name: c.company_name || null } };
    });
};

const listAdmin = async (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const where = {};
    if (['pending', 'approved', 'rejected'].includes(query.status)) where.status = query.status;
    const created = {};
    if (DATE_ONLY.test(String(query.from || ''))) created[Op.gte] = `${query.from} 00:00:00`;
    if (DATE_ONLY.test(String(query.to || ''))) created[Op.lte] = `${query.to} 23:59:59`;
    if (Object.getOwnPropertySymbols(created).length) where.created_at = created;
    const q = String(query.search || '').trim();
    if (q) {
        const clientIds = (await WebsiteClient.findAll({ where: { name: { [Op.like]: `%${q}%` } }, attributes: ['id'], raw: true, paranoid: false })).map((c) => c.id);
        where[Op.or] = [
            { ticket_no: { [Op.like]: `%${q}%` } },
            { contact_name: { [Op.like]: `%${q}%` } },
            { subject: { [Op.like]: `%${q}%` } },
            ...(clientIds.length ? [{ website_client_id: clientIds }] : []),
        ];
    }
    const { rows, count } = await AvailabilityRequest.findAndCountAll({ where, order: [['created_at', 'DESC']], limit, offset: (page - 1) * limit, raw: true });
    const [total, pending, approved, rejected] = await Promise.all([
        AvailabilityRequest.count(),
        AvailabilityRequest.count({ where: { status: 'pending' } }),
        AvailabilityRequest.count({ where: { status: 'approved' } }),
        AvailabilityRequest.count({ where: { status: 'rejected' } }),
    ]);
    return {
        stats: { total, pending, approved, rejected },
        data: await withClient(rows),
        pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
    };
};

const loadRow = async (id) => {
    const r = await AvailabilityRequest.findByPk(id);
    if (!r) throw ApiError.notFound('Request not found.');
    return r;
};

const getAdmin = async (id) => {
    const r = await loadRow(id);
    const [out] = await withClient([r.get({ plain: true })]);
    // Live availability of the requested range (totals, as every client sees them).
    const cal = await clientCalendar({ from: out.start_date, to: out.end_date }, null);
    out.days = cal.days.map((d) => ({ date: d.date, day: d.day, status: d.status, daily_max: d.daily_max, booked: d.booked, balance: d.balance }));
    out.decided_by_name = null;
    if (r.decided_by) {
        const u = await User.findByPk(r.decided_by, { attributes: ['full_name'], paranoid: false }).catch(() => null);
        out.decided_by_name = u?.full_name || null;
    }
    return out;
};

/** Approve with a one-time, request-specific exception. The general daily limit is NOT changed. */
const approve = async (id, body = {}, userId = null) => {
    const r = await loadRow(id);
    if (r.status !== 'pending') throw ApiError.badRequest(`This request is already ${r.status}.`);
    const unavailable = parseJson(r.unavailable_dates) || [];
    let dates = Array.isArray(body.dates) && body.dates.length ? body.dates.filter((d) => DATE_ONLY.test(d)) : unavailable.map((u) => u.date);
    dates = dates.filter((d) => d >= r.start_date && d <= r.end_date);
    if (!dates.length) throw ApiError.badRequest('Choose at least one date for the exception.');
    const slots = Number(body.exception_slots ?? 1);
    if (!Number.isInteger(slots) || slots < 1 || slots > 10) throw ApiError.badRequest('Exception slots must be between 1 and 10.');
    const hours = Number(body.expiry_hours ?? 48);
    if (!EXPIRY_HOURS.includes(hours)) throw ApiError.badRequest('Choose the reservation expiry.');
    if (!(body.capacity_checked === true || body.capacity_checked === 'true')) throw ApiError.badRequest('Please confirm the operational capacity check.');
    const reason = text(body.reason, 500);
    if (!reason) throw ApiError.badRequest('Please enter the admin reason / notes.');
    const now = new Date();
    await r.update({
        status: 'approved',
        decision_reason: reason,
        decision: {
            dates, exception_slots: slots, expiry_hours: hours,
            expires_at: new Date(now.getTime() + hours * 3600000).toISOString(),
            capacity_checked: true, scope: 'request',
        },
        decided_by: userId,
        decided_at: now,
    });
    return getAdmin(r.id);
};

const reject = async (id, body = {}, userId = null) => {
    const r = await loadRow(id);
    if (r.status !== 'pending') throw ApiError.badRequest(`This request is already ${r.status}.`);
    const category = REJECT_CATEGORIES.includes(body.category) ? body.category : null;
    if (!category) throw ApiError.badRequest('Please choose the rejection category.');
    const reason = text(body.reason, 500);
    if (!reason) throw ApiError.badRequest('Please enter the rejection reason.');
    await r.update({ status: 'rejected', decision_reason: reason, decision: { category }, decided_by: userId, decided_at: new Date() });
    return getAdmin(r.id);
};

module.exports = {
    createRequest, listForClient, getForClient, present, ATTACH_BYTES, ATTACH_MIMES,
    listAdmin, getAdmin, approve, reject, REJECT_CATEGORIES, EXPIRY_HOURS,
};
