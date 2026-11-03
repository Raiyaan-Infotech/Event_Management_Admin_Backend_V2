/**
 * Participant waiting list (Jamal, 2026-11-03).
 *
 * Everyone who joins an event is also put in the host's Guests module, and the
 * plan's Max Guests applies. When it is full, a QR joiner is NOT refused: they
 * wait here, see "You're on the waiting list" in the app, and the host is told
 * "N participants are waiting — please upgrade your plan".
 *
 * Once there is room (plan upgraded, guests removed) `processHost` lets them in,
 * oldest first, by replaying their join form through `guestRegistration.join`
 * — so they get exactly what a normal join gives (guest + participant rows,
 * the Welcome Invitation push). `start()` runs that every few minutes.
 *
 * An organizer adding a participant by hand is still refused when full (they
 * are the one who must upgrade) — only the QR join waits.
 */

const cron = require('node-cron');
const { Sequelize, Event, WebsiteClient, EventParticipantWaitlist, ClientDeviceToken } = require('../models');
const notifications = require('./clientNotification.service');
const pushSender = require('./pushSender.service');
const guests = require('./clientGuest.service');
const logger = require('../utils/logger');

/** Is the host's guest list full (no room for one more)? */
const guestsFull = async (hostId) => {
    const cap = await guests.getGuestCapacity(hostId);
    return Boolean(cap.full);
};

/** How many people wait for this host (all events), and for one event. */
const countWaiting = async (hostId, eventId = null) =>
    EventParticipantWaitlist.count({
        where: { website_client_id: hostId, ...(eventId ? { event_id: eventId } : {}) },
    });

/** This person's place in the event's queue (1 = next), or null when not waiting. */
const positionOf = async (eventId, clientId) => {
    const row = await EventParticipantWaitlist.findOne({
        where: { event_id: eventId, participant_client_id: clientId },
    });
    if (!row) return null;
    const ahead = await EventParticipantWaitlist.count({
        where: { event_id: eventId, created_at: { [Sequelize.Op.lt]: row.created_at } },
    });
    return ahead + 1;
};

/**
 * Tell the host how many are waiting — in the app's notification list and as a
 * push to their phone. Sent each time someone new joins the queue.
 */
const notifyHost = async (event) => {
    try {
        const n = await countWaiting(event.website_client_id);
        const people = n === 1 ? '1 participant is' : `${n} participants are`;
        const title = 'Participants are waiting';
        const body = `${people} waiting to join ${event.name || 'your event'}. Your plan's guest limit is full — please upgrade your plan to let them in.`;
        await notifications.notify(event.website_client_id, {
            type: 'participants_waiting',
            title,
            body,
            eventId: event.id,
            link: '/dashboard/billing',
            companyId: event.company_id ?? null,
            meta: { waiting: n },
            respectPrefs: false,
        });
        const tokens = await ClientDeviceToken.findAll({
            where: { website_client_id: event.website_client_id, is_active: 1 },
            attributes: ['id', 'token'],
        });
        if (tokens.length) {
            await pushSender.sendToTokens(tokens, {
                title,
                body,
                data: { type: 'participants_waiting', event_id: String(event.id), waiting: String(n) },
            });
        }
    } catch (err) {
        logger.warn?.('[waitlist] host notice failed (non-fatal):', err.message);
    }
};

/**
 * Put this person in the event's queue (or refresh their form if already
 * there — their place is kept). Returns their position.
 */
const enqueue = async (event, client, payload = {}) => {
    const { token, ...form } = payload; // the event is stored by id, not by its QR
    const [row, created] = await EventParticipantWaitlist.findOrCreate({
        where: { event_id: event.id, participant_client_id: client.id },
        defaults: { website_client_id: event.website_client_id, payload: form },
    });
    if (!created) await row.update({ payload: form });
    if (created) notifyHost(event); // fire and forget
    return positionOf(event.id, client.id);
};

/** Remove a person from an event's queue (they joined after all). */
const dequeue = (eventId, clientId) =>
    EventParticipantWaitlist.destroy({ where: { event_id: eventId, participant_client_id: clientId } });

/**
 * Let in as many waiting people of this host as there is room for, oldest
 * first. Stops at the first one that cannot get in (still full).
 */
const processHost = async (hostId) => {
    // Lazy: guestRegistration requires this file.
    const registration = require('./guestRegistration.service');
    const rows = await EventParticipantWaitlist.findAll({
        where: { website_client_id: hostId },
        order: [['created_at', 'ASC'], ['id', 'ASC']],
    });
    let admitted = 0;
    for (const row of rows) {
        if (await guestsFull(hostId)) break;
        const [event, client] = await Promise.all([
            Event.findByPk(row.event_id),
            WebsiteClient.findByPk(row.participant_client_id),
        ]);
        if (!event || !client) {
            await row.destroy();
            continue;
        }
        try {
            const result = await registration.join(client, row.payload || {}, { event, fromWaitlist: true });
            if (result?.waiting) break; // still no room
            await row.destroy();
            admitted += 1;
        } catch (err) {
            // e.g. the event is full of participants, or ended: keep waiting,
            // try the next person.
            logger.warn?.(`[waitlist] could not let in client ${row.participant_client_id} to event ${row.event_id}:`, err.message);
        }
    }
    return admitted;
};

/** Every host with someone waiting. */
const processAll = async () => {
    const hosts = await EventParticipantWaitlist.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('website_client_id')), 'host']],
        raw: true,
    });
    let admitted = 0;
    for (const h of hosts) {
        try {
            admitted += await processHost(h.host);
        } catch (err) {
            logger.warn?.('[waitlist] host run failed:', err.message);
        }
    }
    if (admitted) logger.info?.(`[waitlist] let in ${admitted} waiting participant(s)`);
    return admitted;
};

let task = null;
let running = false;
/** Every 5 minutes: let waiting people in where there is now room. */
const start = () => {
    if (task) return;
    task = cron.schedule('*/5 * * * *', async () => {
        if (running) return;
        running = true;
        try {
            await processAll();
        } catch (err) {
            logger.warn?.('[waitlist] run failed:', err.message);
        } finally {
            running = false;
        }
    });
    console.log('Participant waiting list job started (every 5 minutes)');
};
const stop = () => {
    task?.stop();
    task = null;
};

module.exports = {
    guestsFull,
    countWaiting,
    positionOf,
    enqueue,
    dequeue,
    processHost,
    processAll,
    start,
    stop,
};
