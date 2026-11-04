const { Event, Guest, EventParticipant, GuestNote } = require('../models');
const ApiError = require('../utils/apiError');
const { mobileKey } = require('./guestFields');

/**
 * ── RSVP BOARD (portal "RSVP Responses", Jamal's web design 2026-11-04) ─────
 * One row per GUEST of the event (the invitation list), with their answer.
 *
 * Where the answer lives:
 *   · the guest JOINED (an event_participants row matched by guest_id, else the
 *     last 10 digits of the mobile — the same match as the guest status):
 *     the participant's response_type / rsvp_status / party_size / dietary /
 *     notes / responded_at. Changes made here write that row.
 *   · not joined: the organizer's own answer on the guest (rsvp_* columns).
 *
 * State: yes → confirmed, no → declined, maybe → maybe, no answer → pending
 * when invited (invitation sent or joined), else not_invited.
 * "Hide Response" (rsvp_hidden) takes a row out of the main list; the Hidden
 * tab shows it. Nothing here deletes a guest or a participant.
 *
 * Read in JS, not SQL: one event's guests + participants are two queries (prod
 * ~370 ms each) and the matching / filtering is then exact and cheap.
 */

const STATE = { yes: 'confirmed', no: 'declined', maybe: 'maybe' };
const STATES = ['confirmed', 'pending', 'declined', 'maybe', 'not_invited'];
const P_ATTRS = ['id', 'guest_id', 'mobile', 'rsvp_status', 'response_type', 'party_size', 'dietary_preference',
    'special_requirements', 'notes', 'responded_at', 'invite_source', 'created_at'];

const text = (v, max) => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t ? t.slice(0, max) : null;
};

/** The participant's answer: yes / no / maybe, or null (not answered). */
const answerOf = (p) => {
    if (!p) return null;
    if (p.response_type === 'no' || p.rsvp_status === 'declined') return 'no';
    if (p.response_type === 'yes' || p.rsvp_status === 'accepted') return 'yes';
    if (p.response_type === 'maybe') return 'maybe';
    // RSVP switched off: join writes 'invited' + no answer, and joining is the yes.
    if (p.response_type === 'none' && p.rsvp_status === 'invited') return 'yes';
    return null;
};

const ownEvent = async (clientId, rawId) => {
    const event = await Event.findOne({
        where: { id: Number(rawId) || 0, website_client_id: clientId },
        attributes: ['id', 'name'],
    });
    if (!event) throw ApiError.notFound('That event is not on your account.');
    return event;
};

/** Each participant, findable by guest id and by mobile (newest wins). */
const indexParticipants = (parts) => {
    const byGuest = new Map();
    const byMobile = new Map();
    for (const p of parts) {
        if (p.guest_id && !byGuest.has(Number(p.guest_id))) byGuest.set(Number(p.guest_id), p);
        const k = mobileKey(p.mobile);
        if (k.length >= 7 && !byMobile.has(k)) byMobile.set(k, p);
    }
    return (g) => {
        const k = mobileKey(g.mobile);
        return byGuest.get(Number(g.id)) || (k.length >= 7 ? byMobile.get(k) : null) || null;
    };
};

/** A board row: the guest + `rsvp` (their answer, wherever it lives). */
const rowOf = (guest, p) => {
    const g = guest.toJSON ? guest.toJSON() : guest;
    const answer = p ? answerOf(p) : (g.rsvp_response || null);
    const invited = !!g.invited_at || !!p || !!answer;
    const channels = Array.isArray(g.invite_channels) ? g.invite_channels : [];
    const attending = p
        ? (answer === 'no' ? 0 : answer ? Number(p.party_size) || 1 : null)
        : (g.rsvp_attending ?? (answer === 'yes' ? g.invite_count || 1 : answer === 'no' ? 0 : null));
    return {
        ...g,
        full_name: g.name,
        rsvp: {
            participant_id: p ? p.id : null,
            joined: !!p,
            answer,
            state: answer ? STATE[answer] : invited ? 'pending' : 'not_invited',
            attending_count: attending,
            meal_preference: p ? p.dietary_preference : g.rsvp_meal,
            message: p ? (p.notes || p.special_requirements || null) : g.rsvp_note,
            responded_at: p ? (p.responded_at || (answer ? p.created_at : null)) : g.rsvp_responded_at,
            // How they came in: the QR join, else the channel the invitation went by.
            source: p && p.invite_source === 'qr' ? 'qr' : (channels[0] || (p ? p.invite_source : null)),
            decline_reason: g.rsvp_decline_reason,
            hidden: !!g.rsvp_hidden,
            hidden_reason: g.rsvp_hidden_reason,
        },
    };
};

const loadRows = async (clientId, eventId) => {
    const [guests, parts] = await Promise.all([
        Guest.findAll({ where: { website_client_id: clientId, event_id: eventId } }),
        EventParticipant.findAll({ where: { event_id: eventId }, attributes: P_ATTRS, order: [['id', 'DESC']] }),
    ]);
    const find = indexParticipants(parts);
    return guests.map((g) => rowOf(g, find(g)));
};

const time = (r) => (r.rsvp.responded_at ? new Date(r.rsvp.responded_at).getTime() : 0);
const SORTS = {
    response_desc: (a, b) => time(b) - time(a) || a.name.localeCompare(b.name),
    response_asc: (a, b) => (time(a) || Infinity) - (time(b) || Infinity) || a.name.localeCompare(b.name),
    name_asc: (a, b) => a.name.localeCompare(b.name),
    name_desc: (a, b) => b.name.localeCompare(a.name),
};

/**
 * The board: rows (filtered, sorted, paged) + the tiles, tab counts, channel
 * breakdown and recent activity — all for this event.
 */
const list = async (clientId, eventId, query = {}) => {
    const event = await ownEvent(clientId, eventId);
    const all = await loadRows(clientId, event.id);

    const showUninvited = ['1', 'true'].includes(String(query.show_uninvited));
    const visible = all.filter((r) => !r.rsvp.hidden);
    // The main list: invited guests (+ not-invited ones when asked).
    const base = visible.filter((r) => showUninvited || r.rsvp.state !== 'not_invited');

    const tab = String(query.tab || 'all').toLowerCase();
    const status = String(query.status || '').toLowerCase();
    const side = String(query.side || '').toLowerCase();
    const source = String(query.source || '').toLowerCase();
    const search = String(query.search || '').trim().toLowerCase();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? new Date(`${query.from}T00:00:00Z`).getTime() : null;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? new Date(`${query.to}T23:59:59Z`).getTime() : null;

    let rows = tab === 'hidden' ? all.filter((r) => r.rsvp.hidden) : base;
    if (['confirmed', 'pending', 'declined', 'maybe'].includes(tab)) rows = rows.filter((r) => r.rsvp.state === tab);
    if (tab === 'bride' || tab === 'groom') rows = rows.filter((r) => r.side === tab);
    if (tab === 'vip') rows = rows.filter((r) => r.is_vip);
    if (STATES.includes(status)) rows = rows.filter((r) => r.rsvp.state === status);
    if (side === 'bride' || side === 'groom') rows = rows.filter((r) => r.side === side);
    if (source) rows = rows.filter((r) => r.rsvp.source === source || (Array.isArray(r.invite_channels) && r.invite_channels.includes(source)));
    if (from || to) rows = rows.filter((r) => { const t = time(r); return t && (!from || t >= from) && (!to || t <= to); });
    if (search) {
        rows = rows.filter((r) => [r.name, r.mobile, r.email, r.relationship].some((v) => String(v || '').toLowerCase().includes(search)));
    }
    rows.sort(SORTS[String(query.sort || '')] || SORTS.response_desc);

    const total = rows.length;
    const exportAll = String(query.limit) === 'all';
    const limit = exportAll ? Math.max(1, total) : Math.min(200, Math.max(1, Number(query.limit) || 10));
    const page = exportAll ? 1 : Math.max(1, Number(query.page) || 1);

    // ── Tiles: of the invited guests (hidden responses still count — "retained in reports") ──
    const invitedRows = all.filter((r) => r.rsvp.state !== 'not_invited');
    const count = (st) => invitedRows.filter((r) => r.rsvp.state === st).length;
    const invited = invitedRows.length;
    const pct = (n) => (invited ? Math.round((n / invited) * 1000) / 10 : 0);
    const confirmed = count('confirmed');
    const declined = count('declined');
    const maybe = count('maybe');
    const pending = count('pending');
    const responded = confirmed + declined + maybe;
    const channel = (c) => invitedRows.filter((r) => (Array.isArray(r.invite_channels) && r.invite_channels.includes(c))
        || (c === 'in_app' && r.rsvp.source === 'qr')).length;

    return {
        rows: rows.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        stats: {
            invited, responded, confirmed, pending, declined, maybe,
            responded_pct: pct(responded), confirmed_pct: pct(confirmed), pending_pct: pct(pending),
            declined_pct: pct(declined), maybe_pct: pct(maybe),
            not_invited: visible.filter((r) => r.rsvp.state === 'not_invited').length,
            total_guests: all.length,
        },
        tabs: {
            all: base.length,
            confirmed: base.filter((r) => r.rsvp.state === 'confirmed').length,
            pending: base.filter((r) => r.rsvp.state === 'pending').length,
            declined: base.filter((r) => r.rsvp.state === 'declined').length,
            maybe: base.filter((r) => r.rsvp.state === 'maybe').length,
            bride: base.filter((r) => r.side === 'bride').length,
            groom: base.filter((r) => r.side === 'groom').length,
            vip: base.filter((r) => r.is_vip).length,
            hidden: all.filter((r) => r.rsvp.hidden).length,
        },
        channels: { whatsapp: channel('whatsapp'), email: channel('email'), in_app: channel('in_app') },
        recent: invitedRows
            .filter((r) => r.rsvp.answer && r.rsvp.responded_at)
            .sort(SORTS.response_desc)
            .slice(0, 5)
            .map((r) => ({ guest_id: r.id, name: r.name, state: r.rsvp.state, attending_count: r.rsvp.attending_count, at: r.rsvp.responded_at })),
    };
};

/** A guest of the caller (with an event), and that guest's participant row if they joined. */
const resolve = async (clientId, guestId) => {
    const guest = await Guest.findOne({ where: { id: Number(guestId) || 0, website_client_id: clientId } });
    if (!guest || !guest.event_id) throw ApiError.notFound('That guest was not found.');
    const parts = await EventParticipant.findAll({ where: { event_id: guest.event_id }, order: [['id', 'DESC']] });
    return { guest, participant: indexParticipants(parts)(guest) };
};

const reload = async (clientId, guest) => {
    const parts = await EventParticipant.findAll({ where: { event_id: guest.event_id }, attributes: P_ATTRS, order: [['id', 'DESC']] });
    await guest.reload();
    return rowOf(guest, indexParticipants(parts)(guest));
};

/**
 * Update RSVP Status / Mark as Confirmed / Pending / Declined. `response`:
 * yes | no | maybe | pending. Joined → written on the participant row; not
 * joined → the organizer's answer on the guest. An admin note becomes a guest
 * note (Internal).
 */
const update = async (clientId, guestId, body = {}) => {
    const { guest, participant } = await resolve(clientId, guestId);
    const response = String(body.response || '').toLowerCase();
    if (!['yes', 'no', 'maybe', 'pending'].includes(response)) throw ApiError.badRequest('Please choose the RSVP status.');
    const has = (f) => Object.prototype.hasOwnProperty.call(body, f);
    let count = null;
    if (has('attending_count')) {
        count = Number(body.attending_count);
        if (!Number.isInteger(count) || count < 0 || count > 50) throw ApiError.badRequest('The attendance count must be between 0 and 50.');
    }
    if (response === 'no') count = 0;
    const answered = response !== 'pending';
    const now = new Date();

    if (participant) {
        await participant.update({
            response_type: answered ? response : 'none',
            rsvp_status: response === 'yes' ? 'accepted' : response === 'no' ? 'declined' : 'pending',
            ...(count !== null ? { party_size: Math.max(response === 'no' ? 0 : 1, count) } : {}),
            ...(has('meal_preference') ? { dietary_preference: text(body.meal_preference, 255) } : {}),
            ...(has('response_note') ? { notes: text(body.response_note, 500) } : {}),
            responded_at: answered ? now : null,
        });
    } else {
        await guest.update({
            rsvp_response: answered ? response : null,
            rsvp_attending: answered ? count : null,
            ...(has('meal_preference') ? { rsvp_meal: text(body.meal_preference, 255) } : {}),
            ...(has('response_note') ? { rsvp_note: text(body.response_note, 500) } : {}),
            rsvp_responded_at: answered ? now : null,
        });
    }
    await guest.update({ rsvp_decline_reason: response === 'no' ? text(body.decline_reason, 60) : null });

    const adminNote = text(body.admin_note, 2000);
    if (adminNote) {
        await GuestNote.create({
            website_client_id: clientId, guest_id: guest.id, title: 'RSVP note', body: adminNote,
            category: 'general', visibility: 'internal', created_by_client_id: clientId,
        });
    }
    return reload(clientId, guest);
};

/** Hide Response / Show again — the records stay. */
const hide = async (clientId, guestId, body = {}) => {
    const { guest } = await resolve(clientId, guestId);
    const hidden = body.hidden === undefined ? true : ['1', 'true', true, 1].includes(body.hidden);
    if (hidden && !text(body.reason, 60)) throw ApiError.badRequest('Please choose a reason for hiding.');
    await guest.update({ rsvp_hidden: hidden, rsvp_hidden_reason: hidden ? text(body.reason, 60) : null });
    return reload(clientId, guest);
};

/**
 * Delete Response: the answer, count, meal and date are cleared — the guest
 * goes back to Pending. The guest and their participant row are NOT deleted.
 */
const clear = async (clientId, guestId) => {
    const { guest, participant } = await resolve(clientId, guestId);
    if (participant) {
        await participant.update({
            response_type: 'none', rsvp_status: 'not_responded', party_size: 1,
            dietary_preference: null, notes: null, responded_at: null,
        });
    }
    await guest.update({
        rsvp_response: null, rsvp_attending: null, rsvp_meal: null, rsvp_note: null,
        rsvp_decline_reason: null, rsvp_responded_at: null,
    });
    return reload(clientId, guest);
};

module.exports = { list, update, hide, clear, answerOf };
