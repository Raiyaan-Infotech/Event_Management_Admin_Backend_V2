/**
 * Event Allocation / support requests (2026-11-13).
 *
 * On the client's Check Event Availability page, a date (Single Date Event) or a consecutive range
 * (Multi Date Event) with at least one unavailable day offers "Contact Support". The client chooses
 * Request a Call Back or Email Support; the request is stored with a ticket number and lands in the
 * super admin's Allocation Requests (review → one-time exception approve, or reject — next build).
 */
const { AvailabilityRequest, WebsiteClient } = require('../models');
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

module.exports = { createRequest, listForClient, present, ATTACH_BYTES, ATTACH_MIMES };
