/**
 * Per-event plans (Jamal, 2026-11-19 — Create Event updated v4 designs).
 *
 * Every event is booked with ITS OWN plan: Check Availability → choose a plan (Free is offered
 * too) → the date is booked → Create Event. A booked date with no event yet is what the
 * dashboard's "Event Date Allotted — Create Your Event Now" card shows.
 *
 * ⚠ No payment gateway yet: a paid plan saves the payment details as ONE pending ledger row
 * (clientBilling.savePendingPayment) and the date is reserved straight away (Jamal chose
 * "reserve now, payment pending"). The client's account plan is NOT changed here.
 *
 * Plan limits per event are configured later ("plan config we do later").
 */
const { sequelize, EventBooking, Event } = require('../models');
const ApiError = require('../utils/apiError');
const billing = require('./clientBilling.service');
const eventAvailability = require('./eventAvailability.service');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const present = (b) => ({
    id: b.id,
    start_date: b.start_date,
    end_date: b.end_date,
    plan: { id: b.subscription_plan_id, name: b.plan_name },
    amount: Number(b.amount),
    currency_code: b.currency_code,
    payment_status: b.payment_status,
    status: b.status,
    event_id: b.event_id,
    booking_type: b.end_date && b.end_date > b.start_date ? 'Multi Date Event' : 'Single Date Event',
    booked_at: b.created_at,
    used_at: b.used_at,
});

/** The client's bookings, newest first. ?status=reserved for the ones with no event yet. */
const listBookings = async (clientId, query = {}) => {
    const where = { website_client_id: clientId };
    if (['reserved', 'used', 'cancelled'].includes(query.status)) where.status = query.status;
    const rows = await EventBooking.findAll({ where, order: [['created_at', 'DESC']], limit: 100 });
    return rows.map(present);
};

/** One reserved booking of this client, or a 400 the portal can show. */
const getReservedBooking = async (clientId, bookingId, { transaction } = {}) => {
    const id = Number(bookingId);
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Booking not found.');
    const b = await EventBooking.findOne({ where: { id, website_client_id: clientId }, transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });
    if (!b) throw ApiError.badRequest('Booking not found.');
    if (b.status === 'used') throw ApiError.badRequest('An event has already been created for this booked date.');
    if (b.status !== 'reserved') throw ApiError.badRequest('This booking is no longer active.');
    return b;
};

const getBooking = async (clientId, bookingId) => {
    const b = await EventBooking.findOne({ where: { id: Number(bookingId) || 0, website_client_id: clientId } });
    if (!b) throw ApiError.notFound('Booking not found.');
    return present(b);
};

/**
 * Book a date with a plan.  body: { start_date, end_date?, plan_id, ...payment fields for a paid plan }
 * Free plan → reserved at once, no payment.  Paid plan → pending payment saved + reserved.
 */
const createBooking = async (clientId, body = {}) => {
    const start = String(body.start_date || '');
    if (!DATE_ONLY.test(start)) throw ApiError.badRequest('Please choose the event date.');
    const endRaw = String(body.end_date || '');
    const end = DATE_ONLY.test(endRaw) && endRaw > start ? endRaw : null;
    if (start < todayStr()) throw ApiError.badRequest('The event date cannot be in the past.');

    const { client, subscription } = await billing.getCurrentSubscription(clientId);
    const plan = await billing.findPickablePlan(client, body.plan_id);
    const paid = Number(plan.price) > 0;

    // The date must be open (configured, not full) — bookings and events share the slots.
    await eventAvailability.assertEventDatesBookable({ startDate: start, endDate: end, clientId });

    const booking = await sequelize.transaction(async (transaction) => {
        let payment = null;
        if (paid) {
            payment = await billing.savePendingPayment({ clientId, client, subscription, plan, body, date: start, transaction });
        }
        const row = await EventBooking.create({
            website_client_id: clientId,
            company_id: client.company_id ?? null,
            start_date: start,
            end_date: end,
            subscription_plan_id: plan.id,
            plan_name: String(plan.name).slice(0, 120),
            amount: payment ? payment.amount.total : 0,
            currency_code: plan.currency_code || 'INR',
            payment_status: paid ? 'pending' : 'free',
            client_transaction_id: payment?.id ?? null,
            status: 'reserved',
        }, { transaction });
        return { row, payment };
    });

    return { booking: present(booking.row), transaction: booking.payment };
};

/** clientEvent.createEvent, inside its transaction: the booking is spent by the new event. */
const markUsed = (booking, eventId, transaction) => booking.update({ status: 'used', event_id: eventId, used_at: new Date() }, { transaction });

/** Dashboard numbers: booked dates = reserved bookings + the client's events that hold a date. */
const summary = async (clientId) => {
    const [reserved, events] = await Promise.all([
        EventBooking.count({ where: { website_client_id: clientId, status: 'reserved' } }),
        Event.count({ where: { website_client_id: clientId } }),
    ]);
    return { reserved_bookings: reserved, total_booked_dates: reserved + events };
};

module.exports = { listBookings, getBooking, createBooking, getReservedBooking, markUsed, summary };
