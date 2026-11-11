const {
    Sequelize, Event, EventParticipant, WebsiteClient,
    EventContactChat, EventContactChatMessage, EventContactInquiry,
} = require('../models');
const ApiError = require('../utils/apiError');

const { Op } = Sequelize;

/**
 * Contact Person chat (Jamal's "Organizer - Participant Contact Person"
 * design, 2026-10-26; portal "Contact Messages", 8 screens, 2026-11-11).
 *
 * A participant has ONE chat per event with the event TEAM. Participants write
 * from the mobile app; the team answers from the Client Portal's Contact page.
 *
 * WHO ANSWERS (Jamal, 2026-11-11): the event OWNER replies, resolves and blocks
 * from the portal; the participant sees each team reply under the event's
 * contact person name. (Before: only the contact person could reply and the
 * owner only read — V2 has no contact-person portal login.) A contact person
 * arriving through eventOrganizerAccess still works the same way.
 *
 * INQUIRY = one question round inside the chat: the participant's first message,
 * or their first after Resolved / Removed, opens one; Mark as Resolved closes it.
 *
 * Status: open → resolved (a new participant message reopens it) → blocked (the
 * participant cannot send in THIS event's chat; "until the event ends" lifts by
 * itself) → removed (off the inbox until the participant writes again).
 */

const MAX_BODY = 2000;
const AUTO_REPLY = 'Thanks for contacting us. We are currently offline and will reply soon.';
/** One auto reply per quiet spell, not one per message. */
const AUTO_REPLY_GAP_MS = 30 * 60 * 1000;
const MAX_MESSAGES = 300;
const STATUSES = ['open', 'resolved', 'blocked', 'removed'];
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
/** Mark as Resolved → Resolution Type (screen 04). */
const RESOLUTION_TYPES = ['Question answered', 'Information shared', 'Issue fixed', 'Duplicate inquiry', 'No reply needed', 'Other'];
/** Block Participant → Reason for Block (screen 05). */
const BLOCK_REASONS = ['Spam or repeated messages', 'Abusive or offensive language', 'Not part of this event', 'Asked to stop contact', 'Other'];
/** The inquiry closed by Remove Conversation (not counted as Resolved). */
const REMOVED_TYPE = 'Conversation removed';
const RESOLVED_NOTE = 'Your inquiry has been marked as resolved. Write to us again any time if you need more help.';
const CLOSED_NOTE = 'This conversation has been closed by the event team. You can write again if you need help.';

const str = (raw, max) => {
    const s = String(raw ?? '').trim();
    return s ? s.slice(0, max) : null;
};

const cleanBody = (raw, hasPhoto = false) => {
    const body = String(raw ?? '').trim();
    if (!body && !hasPhoto) throw ApiError.badRequest('Please type a message.');
    if (body.length > MAX_BODY) throw ApiError.badRequest(`A message can be up to ${MAX_BODY} characters.`);
    return body;
};

const preview = (body) => (body.length > 250 ? `${body.slice(0, 247)}...` : body);
/** The list line for a message: its text, or "Photo". */
const lineOf = (body, photo) => preview(body || (photo ? '📷 Photo' : ''));

const national = (raw) => {
    const d = String(raw || '').replace(/\D/g, '');
    return d.length >= 7 ? d.slice(-10) : null;
};

const EVENT_ATTRS = [
    'id', 'name', 'website_client_id', 'company_id', 'contact_phone', 'contact_email',
    'organizer', 'organizer_image', 'contact_designation', 'start_date', 'end_date', 'end_time',
];

/** The caller's role on the event: team (owner / contact person) or participant. */
const resolveEvent = async (clientId, rawId) => {
    const eventId = Number(rawId);
    if (!eventId) throw ApiError.badRequest('Please choose an event.');
    const [event, membership] = await Promise.all([
        Event.findByPk(eventId, { attributes: EVENT_ATTRS }),
        EventParticipant.findOne({
            where: { event_id: eventId, participant_client_id: clientId, is_blocked: false },
            attributes: ['id'],
        }),
    ]);
    if (!event) throw ApiError.notFound('That event was not found.');
    if (Number(event.website_client_id) === Number(clientId)) return { event, team: true };
    if (!membership) throw ApiError.notFound('That event is not on your account.');
    return { event, team: false };
};

/** client id → { name, photo } for the given ids (one query). */
const clientNames = async (ids) => {
    const unique = [...new Set(ids.filter(Boolean).map(Number))];
    if (!unique.length) return new Map();
    const rows = await WebsiteClient.findAll({
        where: { id: { [Op.in]: unique } },
        attributes: ['id', 'name', 'avatar_url'],
        raw: true,
    });
    return new Map(rows.map((r) => [Number(r.id), { name: r.name, photo: r.avatar_url || null }]));
};

/**
 * Team messages carry the event's contact person name (the owner answers on
 * their behalf, 2026-11-11); the auto reply (sender 0) too.
 */
const shapeMessages = async (rows, viewerId, event = null) => {
    // Replying to: the quoted messages (one query; a quote of a deleted message is dropped).
    const quoteIds = [...new Set(rows.map((m) => Number(m.reply_to_id)).filter(Boolean))];
    const quoted = quoteIds.length
        ? await EventContactChatMessage.findAll({ where: { id: quoteIds }, attributes: ['id', 'sender_side', 'sender_client_id', 'body', 'photo'], raw: true })
        : [];
    const all = [...rows, ...quoted];
    const names = await clientNames(all.map((m) => m.sender_client_id));
    // A participant is named as on this event's guest list (same as the inbox), else their account name.
    const guestIds = [...new Set(all.filter((m) => m.sender_side === 'participant').map((m) => Number(m.sender_client_id)))];
    const guests = event && guestIds.length ? await participantsOf(event.id, guestIds) : new Map();
    const nameOf = (m) => {
        const own = guests.get(Number(m.sender_client_id))?.name || names.get(Number(m.sender_client_id))?.name || null;
        return m.sender_side === 'team' ? event?.organizer || own || 'Contact Person' : own;
    };
    const quoteOf = new Map(quoted.map((q) => [Number(q.id), {
        id: q.id,
        side: q.sender_side,
        sender_name: nameOf(q),
        body: q.body.length > 140 ? `${q.body.slice(0, 137)}...` : q.body,
        photo: Boolean(q.photo),
    }]));
    return rows.map((m) => ({
        id: m.id,
        side: m.sender_side,
        mine: Number(m.sender_client_id) === Number(viewerId),
        sender_name: nameOf(m),
        body: m.body,
        photo: m.photo || null,
        reply_to: quoteOf.get(Number(m.reply_to_id)) || null,
        is_auto: Boolean(m.is_auto),
        // raw rows carry the attribute name (createdAt), not the column name.
        created_at: m.created_at ?? m.createdAt ?? null,
    }));
};

/**
 * Online / Offline for the participant's chat header and the auto reply: the
 * contact person (the event's contact number) or the owner — whoever of the two
 * used the app or the portal in the last few minutes.
 */
const contactOnline = async (event) => {
    const owner = await WebsiteClient.findByPk(event.website_client_id, { attributes: ['mobile', 'vendor_id'], raw: true });
    const { isOnline } = require('./eventOrganizer.service');
    const numbers = [...new Set([national(event.contact_phone), national(owner?.mobile)].filter(Boolean))];
    const seen = await Promise.all(numbers.map((n) => isOnline(n, owner?.vendor_id || null)));
    return seen.some(Boolean);
};

const lastMessages = async (chatId) => {
    const rows = await EventContactChatMessage.findAll({
        where: { chat_id: chatId },
        order: [['id', 'DESC']],
        limit: MAX_MESSAGES,
        raw: true,
    });
    return rows.reverse();
};

/** When the event is over (its end date, else its start date; end of that day without a time). */
const eventEnd = (event) => {
    const day = event.end_date || event.start_date;
    if (!day) return null;
    const at = new Date(`${day}T${event.end_time || '23:59:59'}`);
    return Number.isNaN(at.getTime()) ? null : at;
};

const UNBLOCKED = { status: 'open', block_reason: null, block_note: null, block_duration: null, blocked_at: null };

/** "Until event ends" blocks of a finished event are lifted (lazily, on the next read / send). */
const liftEndedBlocks = async (event) => {
    const end = eventEnd(event);
    if (!end || end > new Date()) return;
    await EventContactChat.update(UNBLOCKED, { where: { event_id: event.id, status: 'blocked', block_duration: 'event_end' } });
};

const openInquiryOf = (chatId) => EventContactInquiry.findOne({
    where: { chat_id: chatId, resolved_at: null },
    order: [['id', 'DESC']],
});

/** A JPG / PNG / WEBP stored under the event (multer already capped the size). */
const storePhoto = async (event, file) => {
    if (!file) return null;
    if (!PHOTO_MIMES.includes(file.mimetype)) throw ApiError.badRequest('Please choose a JPG, PNG or WEBP image.');
    const stored = await require('./media.service').upload(file, { folder: `event-contact-chat/${event.id}` }, event.company_id || 1);
    if (!stored || !stored.url) throw ApiError.badRequest('That photo could not be stored.');
    return { photo: stored.url, size_bytes: Number(stored.size || file.size || 0) };
};

/** A line from the event team in the chat (notify participant, closure note). Counts as the auto kind. */
const teamNote = async (chat, body) => {
    await EventContactChatMessage.create({ chat_id: chat.id, sender_side: 'team', sender_client_id: 0, body, is_auto: true });
    await chat.update({ last_message: preview(body), last_message_at: new Date(), participant_unread: chat.participant_unread + 1 });
};

/* ── Team (owner / contact person) ───────────────────────────────────────── */

const assertTeam = async (clientId, eventId) => {
    const r = await resolveEvent(clientId, eventId);
    if (!r.team) throw ApiError.forbidden('Only the event team can see participant chats.');
    return r;
};

const teamChat = async (clientId, eventId, chatId) => {
    const { event } = await assertTeam(clientId, eventId);
    const chat = await EventContactChat.findOne({ where: { id: Number(chatId) || 0, event_id: event.id } });
    if (!chat) throw ApiError.notFound('That chat was not found.');
    return { event, chat };
};

/** The event's participant rows for [clientIds], one per client (the first with a photo wins). */
const participantsOf = async (eventId, clientIds) => {
    if (!clientIds.length) return new Map();
    const rows = await EventParticipant.findAll({
        where: { event_id: eventId, participant_client_id: { [Op.in]: clientIds } },
        attributes: [
            'id', 'participant_client_id', 'name', 'photo', 'mobile', 'email', 'rsvp_side', 'relationship',
            'rsvp_status', 'response_type', 'invited_at', 'is_blocked',
        ],
        order: [['id', 'ASC']],
        raw: true,
    });
    const out = new Map();
    for (const r of rows) {
        const key = Number(r.participant_client_id);
        const seen = out.get(key);
        if (!seen || (!seen.photo && r.photo)) out.set(key, r);
    }
    return out;
};

const blockInfo = (c) => (c.status === 'blocked'
    ? { reason: c.block_reason, note: c.block_note, duration: c.block_duration || 'permanent', at: c.blocked_at }
    : null);

/**
 * Contact Messages: every chat of the event (newest first) with its counts,
 * the stat tiles, the designated contact person and their performance.
 */
const listChats = async (clientId, eventId) => {
    const { event } = await assertTeam(clientId, eventId);
    await liftEndedBlocks(event);
    const chats = await EventContactChat.findAll({
        // Removed conversations are off the inbox until the participant writes again.
        where: { event_id: event.id, status: { [Op.ne]: 'removed' } },
        order: [['last_message_at', 'DESC'], ['id', 'DESC']],
        raw: true,
    });
    const ids = chats.map((c) => Number(c.participant_client_id));
    const wish = require('./clientWish.service');
    const [names, people, inquiries, seen, online, reply] = await Promise.all([
        clientNames(ids),
        participantsOf(event.id, ids),
        EventContactInquiry.findAll({
            where: { event_id: event.id },
            attributes: ['chat_id', 'resolved_at', 'resolution_type'],
            raw: true,
        }),
        wish.lastSeenOf(ids).catch(() => new Map()),
        contactOnline(event).catch(() => false),
        EventContactChat.findOne({
            where: { event_id: event.id },
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('reply_count')), 'n'],
                [Sequelize.fn('SUM', Sequelize.col('reply_seconds')), 's'],
            ],
            raw: true,
        }),
    ]);
    const inquiriesOf = new Map();
    let resolvedInquiries = 0;
    for (const i of inquiries) {
        inquiriesOf.set(Number(i.chat_id), (inquiriesOf.get(Number(i.chat_id)) || 0) + 1);
        if (i.resolved_at && i.resolution_type !== REMOVED_TYPE) resolvedInquiries += 1;
    }
    const rows = chats.map((c) => {
        const cid = Number(c.participant_client_id);
        const g = people.get(cid);
        const n = names.get(cid);
        const lastSeen = seen.get(cid) || null;
        return {
            id: c.id,
            participant: {
                client_id: cid,
                name: g?.name || n?.name || 'Participant',
                photo: g?.photo || n?.photo || null,
                // groom / bride (RSVP answer) — the list's side filter.
                side: g?.rsvp_side || null,
                relationship: g?.relationship || null,
                online: wish.isOnlineAt(lastSeen),
                last_seen_at: lastSeen ? lastSeen.toISOString() : null,
            },
            status: c.status,
            last_message: c.last_message,
            last_message_at: c.last_message_at,
            unread: c.team_unread,
            awaiting: Boolean(c.awaiting_since) && c.status === 'open',
            awaiting_since: c.awaiting_since,
            inquiries: inquiriesOf.get(Number(c.id)) || 0,
            block: blockInfo(c),
        };
    });
    const live = rows.filter((r) => r.status !== 'blocked');
    const counts = {
        all: live.length,
        open: rows.filter((r) => r.status === 'open').length,
        unread: live.filter((r) => r.unread > 0).length,
        awaiting: rows.filter((r) => r.awaiting).length,
        resolved: rows.filter((r) => r.status === 'resolved').length,
        blocked: rows.filter((r) => r.status === 'blocked').length,
    };
    const replies = Number(reply?.n || 0);
    return {
        event: { id: event.id, name: event.name },
        can_reply: true,
        chats: rows,
        counts,
        stats: {
            total_inquiries: inquiries.length,
            open: counts.open,
            awaiting: counts.awaiting,
            resolved: resolvedInquiries,
            blocked: counts.blocked,
        },
        contact: {
            name: event.organizer || null,
            photo: event.organizer_image || null,
            designation: event.contact_designation || null,
            phone: event.contact_phone || null,
            email: event.contact_email || null,
            online,
        },
        performance: {
            total_inquiries: inquiries.length,
            resolved: resolvedInquiries,
            awaiting: counts.awaiting,
            /** Average wait before a team answer, in minutes (null = no answers yet). */
            avg_reply_minutes: replies ? Math.round(Number(reply.s || 0) / replies / 60) : null,
        },
        options: { resolution_types: RESOLUTION_TYPES, block_reasons: BLOCK_REASONS },
    };
};

const chatSummary = (chat) => ({
    id: chat.id,
    status: chat.status,
    awaiting: Boolean(chat.awaiting_since) && chat.status === 'open',
    block: blockInfo(chat),
});

/** One chat for the team; reading it clears the team's unread count. */
const getTeamMessages = async (clientId, eventId, chatId, senderId) => {
    const { event, chat } = await teamChat(clientId, eventId, chatId);
    const [rows] = await Promise.all([
        lastMessages(chat.id),
        chat.team_unread ? chat.update({ team_unread: 0 }) : null,
    ]);
    return {
        chat: chatSummary(chat),
        can_reply: true,
        messages: await shapeMessages(rows, senderId, event),
    };
};

/** A team message into [chat] (text and / or photo); answers whatever was waiting. */
const postTeamMessage = async (event, chat, senderId, rawBody, file, rawReplyTo = null) => {
    const body = cleanBody(rawBody, Boolean(file));
    // Replying to: only a participant message of THIS chat.
    let replyTo = null;
    if (Number(rawReplyTo)) {
        const q = await EventContactChatMessage.findOne({
            where: { id: Number(rawReplyTo), chat_id: chat.id, sender_side: 'participant' }, attributes: ['id'],
        });
        if (!q) throw ApiError.badRequest('That message is not in this conversation.');
        replyTo = q.id;
    }
    const media = await storePhoto(event, file);
    const msg = await EventContactChatMessage.create({
        chat_id: chat.id,
        sender_side: 'team',
        sender_client_id: senderId,
        body,
        photo: media?.photo || null,
        size_bytes: media?.size_bytes || 0,
        reply_to_id: replyTo,
    });
    const now = new Date();
    const waited = chat.awaiting_since ? Math.max(0, Math.round((now - new Date(chat.awaiting_since)) / 1000)) : null;
    await chat.update({
        last_message: lineOf(body, media?.photo),
        last_message_at: now,
        participant_unread: chat.participant_unread + 1,
        team_unread: 0,
        awaiting_since: null,
        ...(waited !== null ? { reply_count: chat.reply_count + 1, reply_seconds: Number(chat.reply_seconds) + waited } : {}),
        // Writing to a removed conversation brings it back.
        ...(chat.status === 'removed' ? { status: 'open', remove_reason: null, removed_at: null } : {}),
    });
    // The participant's bell: "<contact> replied" (in-app; never throws).
    require('./clientNotification.service').notify(chat.participant_client_id, {
        type: 'contact_chat_reply',
        title: `${event.organizer || 'The contact person'} replied`,
        body: lineOf(body, media?.photo),
        eventId: event.id,
        meta: { chat_id: chat.id },
    });
    return (await shapeMessages([msg.get({ plain: true })], senderId, event))[0];
};

const sendTeamMessage = async (clientId, eventId, chatId, senderId, rawBody, file = null, replyTo = null) => {
    const { event, chat } = await teamChat(clientId, eventId, chatId);
    return postTeamMessage(event, chat, senderId, rawBody, file, replyTo);
};

/** New Message: the participants of the event the team can write to (app users only). */
const recipients = async (clientId, eventId) => {
    const { event } = await assertTeam(clientId, eventId);
    const rows = await EventParticipant.findAll({
        where: { event_id: event.id, participant_client_id: { [Op.ne]: null }, is_blocked: false },
        attributes: ['participant_client_id', 'name', 'photo', 'rsvp_side', 'relationship'],
        order: [['name', 'ASC']],
        raw: true,
    });
    const chats = await EventContactChat.findAll({ where: { event_id: event.id }, attributes: ['id', 'participant_client_id', 'status'], raw: true });
    const chatOf = new Map(chats.map((c) => [Number(c.participant_client_id), c]));
    const seen = new Set();
    const out = [];
    for (const r of rows) {
        const cid = Number(r.participant_client_id);
        if (seen.has(cid)) continue;
        seen.add(cid);
        const chat = chatOf.get(cid);
        out.push({
            client_id: cid,
            name: r.name,
            photo: r.photo || null,
            side: r.rsvp_side || null,
            relationship: r.relationship || null,
            chat_id: chat?.id || null,
            chat_status: chat?.status || null,
        });
    }
    return { participants: out };
};

/** New Message: start (or continue) the chat with one participant. */
const startChat = async (clientId, eventId, senderId, body = {}, file = null) => {
    const { event } = await assertTeam(clientId, eventId);
    const participantId = Number(body.participant_client_id) || 0;
    const person = participantId
        ? await EventParticipant.findOne({ where: { event_id: event.id, participant_client_id: participantId, is_blocked: false }, attributes: ['id'] })
        : null;
    if (!person) throw ApiError.badRequest('Please choose a participant of this event.');
    cleanBody(body.body, Boolean(file));
    const [chat] = await EventContactChat.findOrCreate({
        where: { event_id: event.id, participant_client_id: participantId },
        defaults: { event_id: event.id, participant_client_id: participantId },
    });
    const message = await postTeamMessage(event, chat, senderId, body.body, file);
    return { chat: chatSummary(chat), message };
};

/**
 * Status changes from the conversation's forms:
 *   resolved  { resolution_type, note, notify }      — closes the open inquiry (screen 04)
 *   blocked   { reason (required), note, duration }  — event_end | permanent (screen 05)
 *   removed   { reason, notify }                     — off the inbox (screen 06)
 *   open      unblock / reopen
 */
const setStatus = async (clientId, eventId, chatId, input = {}) => {
    const status = String(input.status || '');
    if (!STATUSES.includes(status)) throw ApiError.badRequest('Please choose a valid status.');
    const { event, chat } = await teamChat(clientId, eventId, chatId);
    const notify = input.notify === true || input.notify === 'true' || input.notify === 1;
    const notifier = require('./clientNotification.service');
    const now = new Date();

    if (status === 'resolved') {
        const type = str(input.resolution_type, 40) || RESOLUTION_TYPES[0];
        const inquiry = await openInquiryOf(chat.id);
        if (inquiry) await inquiry.update({ resolved_at: now, resolution_type: type, resolution_note: str(input.note, 500) });
        await chat.update({ status, team_unread: 0, awaiting_since: null });
        if (notify) {
            await teamNote(chat, RESOLVED_NOTE);
            notifier.notify(chat.participant_client_id, {
                type: 'contact_chat_resolved',
                title: 'Your inquiry was resolved',
                body: `${event.name}: ${RESOLVED_NOTE}`,
                eventId: event.id,
                meta: { chat_id: chat.id },
            });
        }
    } else if (status === 'blocked') {
        const reason = str(input.reason, 60);
        if (!reason) throw ApiError.badRequest('Please choose a reason for the block.');
        const duration = input.duration === 'permanent' ? 'permanent' : 'event_end';
        await chat.update({ status, block_reason: reason, block_note: str(input.note, 500), block_duration: duration, blocked_at: now, team_unread: 0, awaiting_since: null });
    } else if (status === 'removed') {
        const inquiry = await openInquiryOf(chat.id);
        if (inquiry) await inquiry.update({ resolved_at: now, resolution_type: REMOVED_TYPE });
        await chat.update({ status, remove_reason: str(input.reason, 500), removed_at: now, team_unread: 0, awaiting_since: null });
        if (notify) {
            await teamNote(chat, CLOSED_NOTE);
            notifier.notify(chat.participant_client_id, {
                type: 'contact_chat_closed',
                title: 'Conversation closed',
                body: `${event.name}: ${CLOSED_NOTE}`,
                eventId: event.id,
                meta: { chat_id: chat.id },
            });
        }
    } else {
        // open: unblock, or reopen a resolved / removed conversation (its last inquiry goes on).
        if (chat.status === 'resolved' || chat.status === 'removed') {
            const last = await EventContactInquiry.findOne({ where: { chat_id: chat.id }, order: [['id', 'DESC']] });
            if (last && last.resolved_at) await last.update({ resolved_at: null, resolution_type: null, resolution_note: null });
        }
        await chat.update({ ...UNBLOCKED, remove_reason: null, removed_at: null });
    }
    return chatSummary(chat);
};

const RSVP_LABEL = { yes: 'Attending', no: 'Not attending', maybe: 'Maybe', none: 'No response' };
const INVITE_LABEL = { invited: 'Invited', accepted: 'Accepted', declined: 'Declined', pending: 'Pending', not_responded: 'Not responded' };

/** Participant Details (screen 08): profile, inquiry summary, inquiries and activity. */
const details = async (clientId, eventId, chatId) => {
    const { event, chat } = await teamChat(clientId, eventId, chatId);
    const cid = Number(chat.participant_client_id);
    const [people, names, inquiries, total, lastIn, seen] = await Promise.all([
        participantsOf(event.id, [cid]),
        clientNames([cid]),
        EventContactInquiry.findAll({ where: { chat_id: chat.id }, order: [['id', 'DESC']], raw: true }),
        EventContactChatMessage.count({ where: { chat_id: chat.id, is_auto: false } }),
        EventContactChatMessage.max('created_at', { where: { chat_id: chat.id, sender_side: 'participant' } }),
        require('./clientWish.service').lastSeenOf([cid]).catch(() => new Map()),
    ]);
    const g = people.get(cid);
    const n = names.get(cid);
    const lastSeen = seen.get(cid) || null;
    const activity = [];
    for (const i of inquiries) {
        activity.push({ at: i.opened_at, kind: 'opened', text: `Inquiry opened: ${i.first_message || 'Photo'}` });
        if (i.resolved_at) {
            activity.push({
                at: i.resolved_at,
                kind: i.resolution_type === REMOVED_TYPE ? 'removed' : 'resolved',
                text: i.resolution_type === REMOVED_TYPE ? 'Conversation removed' : `Resolved — ${i.resolution_type || 'Question answered'}`,
            });
        }
    }
    if (chat.blocked_at && chat.status === 'blocked') {
        activity.push({ at: chat.blocked_at, kind: 'blocked', text: `Blocked — ${chat.block_reason || ''}`.trim() });
    }
    activity.sort((a, b) => new Date(b.at) - new Date(a.at));
    return {
        chat: chatSummary(chat),
        participant: {
            client_id: cid,
            name: g?.name || n?.name || 'Participant',
            photo: g?.photo || n?.photo || null,
            mobile: g?.mobile || null,
            email: g?.email || null,
            side: g?.rsvp_side || null,
            relationship: g?.relationship || null,
            invitation_status: g ? INVITE_LABEL[g.rsvp_status] || (g.invited_at ? 'Invited' : 'Not invited') : null,
            rsvp: g ? RSVP_LABEL[g.response_type] || 'No response' : null,
            online: require('./clientWish.service').isOnlineAt(lastSeen),
            last_seen_at: lastSeen ? lastSeen.toISOString() : null,
        },
        summary: {
            total_messages: total,
            inquiries: inquiries.length,
            last_contacted: lastIn || null,
            assigned_contact: event.organizer || null,
        },
        inquiries: inquiries.map((i) => ({
            id: i.id,
            first_message: i.first_message,
            opened_at: i.opened_at,
            resolved_at: i.resolved_at,
            resolution_type: i.resolution_type,
            resolution_note: i.resolution_note,
        })),
        activity,
    };
};

/* ── Participant ─────────────────────────────────────────────────────────── */

const assertParticipant = async (clientId, eventId) => {
    const r = await resolveEvent(clientId, eventId);
    if (r.team) throw ApiError.badRequest('This is your own event — open Participant Chats instead.');
    return r;
};

/** The participant's own chat with the event team (empty before the first message). */
const getMyChat = async (clientId, eventId) => {
    const { event } = await assertParticipant(clientId, eventId);
    await liftEndedBlocks(event);
    const chat = await EventContactChat.findOne({ where: { event_id: event.id, participant_client_id: clientId } });
    const contact = {
        name: event.organizer || null,
        photo: event.organizer_image || null,
        designation: event.contact_designation || null,
        online: await contactOnline(event),
        event_name: event.name,
    };
    if (!chat) return { chat: null, contact, messages: [] };
    const [rows] = await Promise.all([
        lastMessages(chat.id),
        chat.participant_unread ? chat.update({ participant_unread: 0 }) : null,
    ]);
    return {
        chat: { id: chat.id, status: chat.status },
        contact,
        messages: await shapeMessages(rows, clientId, event),
    };
};

const sendMyMessage = async (clientId, eventId, rawBody, file = null) => {
    const body = cleanBody(rawBody, Boolean(file));
    const { event } = await assertParticipant(clientId, eventId);
    await liftEndedBlocks(event);
    const [chat] = await EventContactChat.findOrCreate({
        where: { event_id: event.id, participant_client_id: clientId },
        defaults: { event_id: event.id, participant_client_id: clientId },
    });
    if (chat.status === 'blocked') {
        throw ApiError.forbidden('You can no longer send messages in this chat.');
    }
    const media = await storePhoto(event, file);
    const msg = await EventContactChatMessage.create({
        chat_id: chat.id,
        sender_side: 'participant',
        sender_client_id: clientId,
        body,
        photo: media?.photo || null,
        size_bytes: media?.size_bytes || 0,
    });
    const now = new Date();
    const wasWaiting = Boolean(chat.awaiting_since);
    // A new question round: nothing open yet (first message, or after Resolved / Removed).
    if (!(await openInquiryOf(chat.id))) {
        await EventContactInquiry.create({ chat_id: chat.id, event_id: event.id, first_message: lineOf(body, media?.photo), opened_at: now });
    }
    await chat.update({
        last_message: lineOf(body, media?.photo),
        last_message_at: now,
        team_unread: chat.team_unread + 1,
        participant_unread: 0,
        awaiting_since: chat.awaiting_since || now,
        // A new question reopens a resolved (or removed) chat.
        ...(chat.status === 'resolved' || chat.status === 'removed'
            ? { status: 'open', remove_reason: null, removed_at: null }
            : {}),
    });
    const [message] = await shapeMessages([msg.get({ plain: true })], clientId, event);

    // The owner's bell, once per waiting spell (not once per message).
    if (!wasWaiting) {
        const person = await EventParticipant.findOne({ where: { event_id: event.id, participant_client_id: clientId }, attributes: ['name'], raw: true });
        require('./clientNotification.service').notify(event.website_client_id, {
            type: 'contact_chat_message',
            title: `New message from ${person?.name || 'a participant'}`,
            body: `${event.name}: ${lineOf(body, media?.photo)}`,
            eventId: event.id,
            link: `/dashboard/events/${event.id}?tab=contact`,
            meta: { chat_id: chat.id },
        });
    }

    // Contact person offline → one automatic reply per quiet spell.
    const online = await contactOnline(event);
    let autoReply = null;
    if (!online) {
        const recentAuto = await EventContactChatMessage.findOne({
            where: {
                chat_id: chat.id,
                is_auto: true,
                body: AUTO_REPLY,
                created_at: { [Op.gt]: new Date(Date.now() - AUTO_REPLY_GAP_MS) },
            },
            attributes: ['id'],
        });
        if (!recentAuto) {
            const auto = await EventContactChatMessage.create({
                chat_id: chat.id, sender_side: 'team', sender_client_id: 0, body: AUTO_REPLY, is_auto: true,
            });
            [autoReply] = await shapeMessages([auto.get({ plain: true })], clientId, event);
        }
    }
    return { message, auto_reply: autoReply, contact_online: online };
};

module.exports = {
    PHOTO_MIMES,
    listChats,
    getTeamMessages,
    sendTeamMessage,
    recipients,
    startChat,
    setStatus,
    details,
    getMyChat,
    sendMyMessage,
};
