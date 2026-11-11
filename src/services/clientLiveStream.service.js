const {
    Sequelize, Event, EventMenu, EventParticipant, EventLiveStream, EventLiveStreamType, EventLiveStreamView, WebsiteClient,
} = require('../models');
const ApiError = require('../utils/apiError');
const mediaService = require('./media.service');

const { Op } = Sequelize;

/**
 * Live Streaming (2026-10-20) — the app's Live Streaming menu.
 *
 * Stream Types work like gallery categories — per event, the organizer adds /
 * renames / deletes / reorders them — but with NO built-in type (Jamal,
 * 2026-10-20): an event starts with none. A stream must belong to one type;
 * deleting a type deletes its streams.
 *
 * Writing is host-only (an event's organizer works as the host through
 * eventOrganizerAccess); reading is open to the host and to the event's
 * participants. Participants see ENABLED streams only, and only the types that
 * hold one. Nothing is played here — participants open `stream_url`.
 *
 * No plan limit: the plan decides only whether the Live Streaming menu exists.
 *
 * 2026-11-11 (Jamal's "Live Stream Updated" screens):
 *   - 9 platforms, a visibility per stream, an end time, organizer notes, an RTMP address.
 *   - STATUS scheduled / live / ended. The organizer's Go Live / End Stream is stored; a stream
 *     left on "scheduled" with Go Live Automatically on is Live from its start time and Ended
 *     after its end time, worked out on read in the event's time zone (statusOf) - no job runs.
 *   - Viewers are real: a participant's open is recorded (recordView).
 *   - Participants never see a private stream; an unlisted one opens by id but is not listed.
 */

const PLATFORMS = ['youtube', 'facebook', 'instagram', 'zoom', 'google_meet', 'teams', 'custom_rtmp', 'embedded', 'other'];
const VISIBILITIES = ['public', 'participants', 'guests', 'invite_link', 'unlisted', 'private'];
const STATUSES = ['scheduled', 'live', 'ended'];
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MENU_SLUG = 'live-streaming';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
/** A stream address: a web link or an RTMP one. */
const STREAM_URL = /^(https?|rtmps?):\/\/[^\s/$.?#][^\s]*$/i;
const MEDIA_URL = /^(https?:\/\/|\/uploads\/)/i;

const EVENT_ATTRS = ['id', 'name', 'start_date', 'end_date', 'company_id', 'website_client_id', 'menu_ids', 'timezone'];
const TYPE_ORDER = [['sort_order', 'ASC'], ['id', 'ASC']];
const STREAM_ORDER = [['sort_order', 'ASC'], ['stream_date', 'ASC'], ['stream_time', 'ASC'], ['id', 'ASC']];

const clean = (raw, max) => {
    const s = typeof raw === 'string' ? raw.trim() : '';
    return s ? s.slice(0, max) : null;
};
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const has = (body, f) => Object.prototype.hasOwnProperty.call(body, f);
const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

/** The date and time it is NOW where the event is: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
const nowIn = (timezone, at = new Date()) => {
    const read = (tz) => {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(at);
        const v = (t) => parts.find((x) => x.type === t).value;
        return { date: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour')}:${v('minute')}` };
    };
    try { return read(timezone || DEFAULT_TIMEZONE); } catch { return read(DEFAULT_TIMEZONE); }
};
const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/**
 * The status to SHOW. Ended by the organizer stays ended. Go Live by the organizer stays live
 * through the next day at most. Otherwise the schedule decides, when Go Live Automatically is on:
 * live from the start time, ended after the end time (or the day after, with no end time).
 */
const statusOf = (s, timezone) => {
    if (s.status === 'ended') return 'ended';
    const now = nowIn(timezone);
    const cur = `${now.date} ${now.time}`;
    const startTime = hhmm(s.stream_time);
    const endTime = hhmm(s.end_time);
    if (s.status === 'live') {
        const liveDay = s.started_at ? nowIn(timezone, new Date(s.started_at)).date : s.stream_date;
        return now.date > nextDay(liveDay > s.stream_date ? liveDay : s.stream_date) ? 'ended' : 'live';
    }
    const auto = s.auto_go_live === undefined || s.auto_go_live === true || s.auto_go_live === 1;
    if (!auto || cur < `${s.stream_date} ${startTime}`) return 'scheduled';
    if (endTime) {
        const endDate = endTime > startTime ? s.stream_date : nextDay(s.stream_date);
        return cur >= `${endDate} ${endTime}` ? 'ended' : 'live';
    }
    return now.date > s.stream_date ? 'ended' : 'live';
};

/** The event, proven to belong to this client (writes). */
const resolveEvent = async (clientId, rawId) => {
    const eventId = Number(rawId);
    if (!eventId) throw ApiError.badRequest('Please choose an event.');
    const event = await Event.findOne({ where: { id: eventId, website_client_id: clientId }, attributes: EVENT_ATTRS });
    if (!event) throw ApiError.notFound('That event is not on your account.');
    return event;
};

/** The event as a VIEWER may see it: the host, or a participant of it. */
const resolveEventForView = async (clientId, rawId) => {
    const eventId = Number(rawId);
    if (!eventId) throw ApiError.badRequest('Please choose an event.');
    // The event and the membership probe do not depend on each other — read
    // together, so a guest pays one round trip here, not two.
    const [event, membership] = await Promise.all([
        Event.findByPk(eventId, { attributes: EVENT_ATTRS }),
        EventParticipant.findOne({
            where: { event_id: eventId, participant_client_id: clientId, is_blocked: false },
            attributes: ['id'],
        }),
    ]);
    if (!event) throw ApiError.notFound('That event was not found.');

    const isOwner = Number(event.website_client_id) === Number(clientId);
    if (isOwner) return { event, isOwner };

    if (!membership) throw ApiError.notFound('That event is not on your account.');
    return { event, isOwner: false };
};

/** Stored files a change drops — removed from storage, best effort. */
const dropFile = (url, companyId) => (url
    ? mediaService.deleteByUrl(url, companyId || 1).catch(() => null)
    : Promise.resolve());

/** The event's own days; a stream's date may not be after the last one. */
const eventRange = (event) => ({
    event_start_date: event.start_date || null,
    event_end_date: event.end_date || event.start_date || null,
});

/**
 * Refuse a stream date AFTER the event's last day. Any day before it is fine —
 * an Engagement stream comes before the wedding (Jamal, 2026-10-20), so the
 * start date is not a limit. An event with no dates allows any day.
 */
const assertInEvent = (event, date) => {
    const { event_end_date: last } = eventRange(event);
    if (last && date > last) {
        throw ApiError.badRequest('The live stream date cannot be after the event ends.');
    }
};

/* ─────────────────────────── Stream Types ─────────────────────────────── */

/** Participants never get these in a list (private: not at all; unlisted: by id only). */
const HIDDEN_FROM_LISTS = ['private', 'unlisted'];

const presentType = (r, counts = {}, firstCover = null) => ({
    id: r.id,
    name: r.name,
    description: r.description || null,
    /** A type has no picture of its own; this is its first stream's cover. */
    cover_url: firstCover || null,
    is_active: r.is_active === undefined ? true : (r.is_active === true || r.is_active === 1),
    default_visibility: r.default_visibility || 'public',
    notes: r.notes || null,
    sort_order: r.sort_order,
    stream_count: counts.total || 0,
    enabled_count: counts.enabled || 0,
});

/** The event's types with counts. A participant gets only types holding an enabled stream. */
const typesFor = async (eventId, { viewer = false } = {}) => {
    const [rows, streams] = await Promise.all([
        EventLiveStreamType.findAll({ where: { event_id: eventId }, order: TYPE_ORDER }),
        EventLiveStream.findAll({
            where: { event_id: eventId },
            attributes: ['type_id', 'is_enabled', 'cover_image', 'visibility'],
            order: STREAM_ORDER,
            raw: true,
        }),
    ]);
    const counts = new Map();
    const covers = new Map();
    for (const s of streams) {
        const enabled = s.is_enabled === true || s.is_enabled === 1;
        if (viewer && (!enabled || HIDDEN_FROM_LISTS.includes(s.visibility))) continue;
        const c = counts.get(s.type_id) || { total: 0, enabled: 0 };
        c.total += 1;
        if (enabled) c.enabled += 1;
        counts.set(s.type_id, c);
        if (s.cover_image && !covers.has(s.type_id)) covers.set(s.type_id, s.cover_image);
    }
    const list = rows.map((r) => {
        const t = presentType(r, counts.get(r.id), covers.get(r.id));
        if (viewer) delete t.notes;
        return t;
    });
    return viewer ? list.filter((t) => t.stream_count > 0) : list;
};

/** The Live Streaming menu: its "Show in Event App" switch is this id in the event's menu_ids. */
const menuState = async (event) => {
    const menu = await EventMenu.findOne({ where: { slug: MENU_SLUG }, attributes: ['id', 'is_default'] });
    const chosen = (Array.isArray(event.menu_ids) ? event.menu_ids : []).map(Number);
    const isDefault = !!menu && Number(menu.is_default) === 1;
    return {
        menu_id: menu ? menu.id : null,
        is_default: isDefault,
        show_in_app: isDefault || (!!menu && chosen.includes(Number(menu.id))),
    };
};

const listTypes = async (clientId, eventId) => {
    const { event, isOwner } = await resolveEventForView(clientId, eventId);
    const [types, menu] = await Promise.all([typesFor(event.id, { viewer: !isOwner }), menuState(event)]);
    return { types, ...menu, ...eventRange(event), can_edit: isOwner };
};

const assertTypeNameFree = async (eventId, name, exceptId = null) => {
    const clash = await EventLiveStreamType.findOne({
        where: { event_id: eventId, name, ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) },
        attributes: ['id'],
    });
    if (clash) throw ApiError.conflict(`"${name}" is already a stream type on this event.`);
};

const checkCover = (raw) => {
    const url = clean(raw, 500);
    if (url && !MEDIA_URL.test(url)) throw ApiError.badRequest('Invalid cover image.');
    return url;
};

/** The category form's extra fields (2026-11-11) — only the ones sent. */
const typeExtras = (body) => {
    const data = {};
    if (has(body, 'is_active')) data.is_active = truthy(body.is_active);
    if (has(body, 'default_visibility')) {
        const v = String(body.default_visibility || '').trim().toLowerCase();
        if (!VISIBILITIES.includes(v)) throw ApiError.badRequest('Please choose a valid visibility.');
        data.default_visibility = v;
    }
    if (has(body, 'notes')) data.notes = clean(body.notes, 500);
    return data;
};
const sentOrder = (body) => has(body, 'display_order') && body.display_order !== null && body.display_order !== '';

/** Display Order: put one type at position `raw` (1 = first) and renumber the rest. */
const placeType = async (eventId, typeId, raw) => {
    const position = Math.floor(Number(raw));
    if (!Number.isFinite(position) || position < 1) throw ApiError.badRequest('Display order must be 1 or more.');
    const rows = await EventLiveStreamType.findAll({ where: { event_id: eventId }, order: TYPE_ORDER, attributes: ['id'] });
    const ids = rows.map((r) => r.id).filter((id) => id !== typeId);
    ids.splice(Math.min(position - 1, ids.length), 0, typeId);
    const cases = ids.map((id, i) => `WHEN ${Number(id)} THEN ${i}`).join(' ');
    await EventLiveStreamType.sequelize.query(
        `UPDATE event_live_stream_types SET sort_order = CASE id ${cases} END WHERE event_id = ? AND id IN (${ids.map(Number).join(',')})`,
        { replacements: [eventId] },
    );
};

const createType = async (clientId, eventId, body = {}) => {
    const event = await resolveEvent(clientId, eventId);
    const name = clean(body.name, 120);
    if (!name) throw ApiError.badRequest('Please fill all mandatory fields.');
    await assertTypeNameFree(event.id, name);
    const extras = typeExtras(body);

    const last = await EventLiveStreamType.max('sort_order', { where: { event_id: event.id } });
    const row = await EventLiveStreamType.create({
        event_id: event.id,
        website_client_id: clientId,
        name,
        description: clean(body.description, 300),
        ...extras,
        sort_order: Number.isFinite(Number(last)) ? Number(last) + 1 : 0,
        company_id: event.company_id ?? null,
    });
    if (sentOrder(body)) await placeType(event.id, row.id, body.display_order);
    const types = await typesFor(event.id);
    return { type: types.find((t) => t.id === row.id), types };
};

const resolveType = async (clientId, typeId) => {
    const row = await EventLiveStreamType.findOne({ where: { id: Number(typeId) || 0, website_client_id: clientId } });
    if (!row) throw ApiError.notFound('That stream type was not found.');
    return row;
};

/** Only the fields SENT change. */
const updateType = async (clientId, typeId, body = {}) => {
    const row = await resolveType(clientId, typeId);
    if (has(body, 'name')) {
        const name = clean(body.name, 120);
        if (!name) throw ApiError.badRequest('Please fill all mandatory fields.');
        await assertTypeNameFree(row.event_id, name, row.id);
        row.name = name;
    }
    if (has(body, 'description')) row.description = clean(body.description, 300);
    Object.assign(row, typeExtras(body));
    await row.save();
    if (sentOrder(body)) await placeType(row.event_id, row.id, body.display_order);
    const types = await typesFor(row.event_id);
    return { type: types.find((t) => t.id === row.id), types };
};

/**
 * Delete a type AND its live streams (Jamal, 2026-10-20: there is no built-in
 * type to move them to). The app says how many go before it asks.
 */
const removeType = async (clientId, typeId) => {
    const row = await resolveType(clientId, typeId);
    const streams = await EventLiveStream.findAll({
        where: { type_id: row.id },
        attributes: ['id', 'cover_image', 'company_id'],
    });
    const eventId = row.event_id;
    if (streams.length) await EventLiveStream.destroy({ where: { type_id: row.id } });
    await row.destroy();
    const covers = streams.filter((s) => s.cover_image);
    for (let i = 0; i < covers.length; i += 5) {
        await Promise.all(covers.slice(i, i + 5).map((s) => dropFile(s.cover_image, s.company_id)));
    }
    return { removed: true, streams_removed: streams.length, types: await typesFor(eventId) };
};

/** Save the drag order: `ids` = the event's types in the new order; other events' ids ignored. */
const reorderTypes = async (clientId, eventId, body = {}) => {
    const event = await resolveEvent(clientId, eventId);
    if (!Array.isArray(body.ids)) throw ApiError.badRequest('Invalid stream type order.');
    const rows = await EventLiveStreamType.findAll({ where: { event_id: event.id }, order: TYPE_ORDER, attributes: ['id'] });
    const known = new Set(rows.map((r) => r.id));
    const sent = [...new Set(body.ids.map(Number))].filter((id) => known.has(id));
    const order = [...sent, ...rows.map((r) => r.id).filter((id) => !sent.includes(id))];
    if (order.length) {
        // One UPDATE with CASE — prod is ~370ms a query, so never row by row.
        const cases = order.map((id, i) => `WHEN ${Number(id)} THEN ${i}`).join(' ');
        await EventLiveStreamType.sequelize.query(
            `UPDATE event_live_stream_types SET sort_order = CASE id ${cases} END WHERE event_id = ? AND id IN (${order.map(Number).join(',')})`,
            { replacements: [event.id] },
        );
    }
    return { types: await typesFor(event.id) };
};

/* ───────────────────────────── Streams ─────────────────────────────────── */

const present = (row, typeName = null, { timezone = null, owner = true } = {}) => {
    const s = row.toJSON ? row.toJSON() : row;
    const out = {
        id: s.id,
        event_id: s.event_id,
        type_id: s.type_id,
        type_name: typeName,
        title: s.title,
        platform: s.platform,
        stream_url: s.stream_url,
        stream_date: s.stream_date,
        stream_time: hhmm(s.stream_time),
        end_time: hhmm(s.end_time),
        visibility: s.visibility || 'public',
        /** What is shown: the organizer's Go Live / End Stream, else the schedule. */
        status: statusOf(s, timezone),
        started_at: s.started_at || null,
        ended_at: s.ended_at || null,
        description: s.description,
        cover_image: s.cover_image,
        is_enabled: s.is_enabled === true || s.is_enabled === 1,
        sort_order: s.sort_order,
        created_at: s.created_at,
        updated_at: s.updated_at,
    };
    if (owner) {
        Object.assign(out, {
            /** What the organizer set (the form's Status). */
            set_status: s.status || 'scheduled',
            rtmp_url: s.rtmp_url || null,
            notes: s.notes || null,
            auto_go_live: s.auto_go_live === undefined ? true : (s.auto_go_live === true || s.auto_go_live === 1),
            notify_participants: s.notify_participants === undefined ? true : (s.notify_participants === true || s.notify_participants === 1),
            views_count: Number(s.views_count) || 0,
        });
    }
    return out;
};

/** A type id proven to belong to THIS event. A stream must have one. */
const requireType = async (eventId, raw) => {
    const id = Number(raw);
    if (!id) throw ApiError.badRequest('Please fill all mandatory fields.');
    const row = await EventLiveStreamType.findOne({ where: { id, event_id: eventId }, attributes: ['id'] });
    if (!row) throw ApiError.badRequest('Please choose a valid stream type.');
    return row.id;
};

/**
 * Validate a create / update body. `current` set = update: only the fields
 * present are checked and changed.
 */
const normalise = (body, current = null) => {
    const partial = !!current;
    const data = {};
    const need = (f) => !partial || has(body, f);

    if (need('title')) {
        const title = clean(body.title, 150);
        if (!title) throw ApiError.badRequest('Please fill all mandatory fields.');
        data.title = title;
    }
    if (need('platform')) {
        const p = String(body.platform || '').trim().toLowerCase();
        if (!PLATFORMS.includes(p)) throw ApiError.badRequest('Please choose a platform.');
        data.platform = p;
    }
    if (need('stream_url')) {
        const url = clean(body.stream_url, 500);
        if (!url) throw ApiError.badRequest('Please fill all mandatory fields.');
        if (!STREAM_URL.test(url)) throw ApiError.badRequest('Please enter a valid link starting with http://, https:// or rtmp://.');
        data.stream_url = url;
    }
    if (has(body, 'rtmp_url')) {
        const rtmp = clean(body.rtmp_url, 500);
        if (rtmp && !/^rtmps?:\/\//i.test(rtmp)) throw ApiError.badRequest('The RTMP address must start with rtmp:// or rtmps://.');
        data.rtmp_url = rtmp;
    }
    if (has(body, 'visibility')) {
        const v = String(body.visibility || '').trim().toLowerCase();
        if (!VISIBILITIES.includes(v)) throw ApiError.badRequest('Please choose a valid visibility.');
        data.visibility = v;
    }
    if (has(body, 'end_time')) {
        const t = clean(body.end_time, 8);
        if (t && !TIME.test(t)) throw ApiError.badRequest('Please choose a valid end time.');
        data.end_time = t;
    }
    if (has(body, 'status')) {
        const st = String(body.status || '').trim().toLowerCase();
        if (!STATUSES.includes(st)) throw ApiError.badRequest('Please choose a valid status.');
        data.status = st;
    }
    if (has(body, 'notes')) data.notes = clean(body.notes, 500);
    if (has(body, 'auto_go_live')) data.auto_go_live = truthy(body.auto_go_live);
    if (has(body, 'notify_participants')) data.notify_participants = truthy(body.notify_participants);
    if (need('stream_date')) {
        const d = clean(body.stream_date, 10);
        if (!d) throw ApiError.badRequest('Please fill all mandatory fields.');
        if (!DATE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) throw ApiError.badRequest('Please choose a valid date.');
        data.stream_date = d;
    }
    if (need('stream_time')) {
        const t = clean(body.stream_time, 8);
        if (!t) throw ApiError.badRequest('Please fill all mandatory fields.');
        if (!TIME.test(t)) throw ApiError.badRequest('Please choose a valid time.');
        data.stream_time = t;
    }
    if (has(body, 'description')) data.description = clean(body.description, 500);
    if (has(body, 'cover_image')) data.cover_image = checkCover(body.cover_image);
    if (has(body, 'is_enabled')) data.is_enabled = body.is_enabled === true || body.is_enabled === 1 || body.is_enabled === '1' || body.is_enabled === 'true';
    return data;
};

/** Go Live / End Stream stamps for a status the organizer sets. */
const stampsFor = (status, row = null) => {
    const now = new Date();
    if (status === 'live') return { started_at: now, ended_at: null };
    if (status === 'ended') return { started_at: row?.started_at || null, ended_at: now };
    return { started_at: null, ended_at: null };
};

const countsOf = (list) => ({
    total: list.length,
    live: list.filter((s) => s.status === 'live').length,
    scheduled: list.filter((s) => s.status === 'scheduled').length,
    ended: list.filter((s) => s.status === 'ended').length,
    enabled: list.filter((s) => s.is_enabled).length,
    disabled: list.filter((s) => !s.is_enabled).length,
});

/**
 * The streams of one event — of one type when `type_id` is given. Host: every
 * stream + counts; participant: enabled streams only.
 */
const list = async (clientId, eventId, query = {}) => {
    const { event, isOwner } = await resolveEventForView(clientId, eventId);
    const where = { event_id: event.id };
    const typeId = Number(query.type_id) || null;
    if (typeId) where.type_id = typeId;
    if (!isOwner) {
        where.is_enabled = true;
        where.visibility = { [Op.notIn]: HIDDEN_FROM_LISTS };
    }

    // Every read needs only the event — one round trip for all of them. A
    // guest's list hides empty types, so the names come from a full read.
    const [types, allTypesForViewer, rows, menu] = await Promise.all([
        typesFor(event.id, { viewer: !isOwner }),
        isOwner ? null : typesFor(event.id),
        EventLiveStream.findAll({ where, order: STREAM_ORDER }),
        menuState(event),
    ]);
    // Names from the types already read — no join per row.
    const allTypes = isOwner ? types : allTypesForViewer;
    const nameOf = new Map(allTypes.map((t) => [t.id, t.name]));
    const streams = rows.map((r) => present(r, nameOf.get(r.type_id) || null, { timezone: event.timezone, owner: isOwner }));
    return {
        streams,
        counts: countsOf(streams),
        types,
        type: typeId ? (allTypes.find((t) => t.id === typeId) || null) : null,
        platforms: PLATFORMS,
        visibilities: VISIBILITIES,
        event_timezone: event.timezone || DEFAULT_TIMEZONE,
        ...menu,
        can_edit: isOwner,
    };
};

const resolveStream = async (clientId, streamId) => {
    const row = await EventLiveStream.findOne({ where: { id: Number(streamId) || 0, website_client_id: clientId } });
    if (!row) throw ApiError.notFound('That live stream was not found.');
    return row;
};

const withType = async (row, { owner = true } = {}) => {
    const [type, event] = await Promise.all([
        row.type_id ? EventLiveStreamType.findByPk(row.type_id, { attributes: ['name'] }) : null,
        Event.findByPk(row.event_id, { attributes: ['timezone'] }),
    ]);
    return present(row, type ? type.name : null, { timezone: event?.timezone, owner });
};

/** Viewer numbers of one stream: every open, and how many different participants. */
const statsOf = async (row) => {
    const unique = await EventLiveStreamView.count({ where: { stream_id: row.id } });
    return { total_views: Number(row.views_count) || 0, unique_viewers: unique };
};

const getOne = async (clientId, streamId) => {
    const row = await EventLiveStream.findByPk(Number(streamId) || 0);
    if (!row) throw ApiError.notFound('That live stream was not found.');
    const { isOwner } = await resolveEventForView(clientId, row.event_id);
    if (!isOwner && (!row.is_enabled || row.visibility === 'private')) throw ApiError.notFound('That live stream was not found.');
    const stream = await withType(row, { owner: isOwner });
    return isOwner ? { stream, stats: await statsOf(row), can_edit: true } : { stream, can_edit: false };
};

/** A participant opened the stream: counted once per open, one row per person. The owner's opens are not counted. */
const recordView = async (clientId, streamId) => {
    const row = await EventLiveStream.findByPk(Number(streamId) || 0, { attributes: ['id', 'event_id', 'is_enabled', 'visibility'] });
    if (!row) throw ApiError.notFound('That live stream was not found.');
    const { isOwner } = await resolveEventForView(clientId, row.event_id);
    if (isOwner) return { counted: false };
    if (!row.is_enabled || row.visibility === 'private') throw ApiError.notFound('That live stream was not found.');
    await EventLiveStreamView.sequelize.query(
        `INSERT INTO event_live_stream_views (stream_id, event_id, website_client_id) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE views = views + 1, last_viewed_at = CURRENT_TIMESTAMP`,
        { replacements: [row.id, row.event_id, clientId] },
    );
    await EventLiveStream.increment('views_count', { by: 1, where: { id: row.id }, silent: true });
    return { counted: true };
};

/** Tell the event's app participants about a stream (the Notify Participants switch). Never throws. */
const notifyParticipants = async (row, type, { force = false } = {}) => {
    try {
        if (!row.is_enabled || row.visibility === 'private') return 0;
        if (!force && !row.notify_participants) return 0;
        const people = await EventParticipant.findAll({
            where: { event_id: row.event_id, is_blocked: false, participant_client_id: { [Op.ne]: null } },
            attributes: ['participant_client_id'],
            raw: true,
        });
        const live = type === 'live_stream_live';
        const when = `${row.stream_date}, ${hhmm(row.stream_time)}`;
        return await require('./clientNotification.service').notifyMany(people.map((p) => ({
            clientId: p.participant_client_id,
            type,
            title: live ? `Live now: ${row.title}` : force ? `Watch live: ${row.title}` : `Live stream scheduled: ${row.title}`,
            body: live ? 'The live stream has started. Open Live Streaming to watch.' : `Starts ${when}. Open Live Streaming to watch.`,
            eventId: row.event_id,
            companyId: row.company_id ?? null,
            meta: { stream_id: row.id },
        })));
    } catch (err) {
        console.error('[live stream] could not notify participants:', err.message);
        return 0;
    }
};

/** Share to Participants (the Share panel): an in-app notification to every app participant of the event. */
const share = async (clientId, streamId) => {
    const row = await resolveStream(clientId, streamId);
    if (!row.is_enabled) throw ApiError.badRequest('Turn on "Show Stream in Event Page" first - participants cannot open a hidden stream.');
    if (row.visibility === 'private') throw ApiError.badRequest('A private stream cannot be shared with participants. Change its visibility first.');
    const event = await Event.findByPk(row.event_id, { attributes: ['timezone'] });
    const live = statusOf(row.toJSON(), event?.timezone) === 'live';
    const sent = await notifyParticipants(row, live ? 'live_stream_live' : 'live_stream_scheduled', { force: true });
    return { sent };
};

const create = async (clientId, eventId, body = {}) => {
    const event = await resolveEvent(clientId, eventId);
    const data = normalise(body);
    assertInEvent(event, data.stream_date);
    const typeId = await requireType(event.id, body.type_id);
    if (!has(data, 'visibility')) {
        const type = await EventLiveStreamType.findByPk(typeId, { attributes: ['default_visibility'] });
        data.visibility = type?.default_visibility || 'public';
    }
    const last = await EventLiveStream.max('sort_order', { where: { event_id: event.id } });
    const row = await EventLiveStream.create({
        ...data,
        ...(data.status ? stampsFor(data.status) : {}),
        is_enabled: has(body, 'is_enabled') ? data.is_enabled : true,
        event_id: event.id,
        website_client_id: clientId,
        type_id: typeId,
        sort_order: Number.isFinite(Number(last)) ? Number(last) + 1 : 0,
        company_id: event.company_id ?? null,
    });
    await notifyParticipants(row, row.status === 'live' ? 'live_stream_live' : 'live_stream_scheduled');
    return withType(row);
};

const update = async (clientId, streamId, body = {}) => {
    const row = await resolveStream(clientId, streamId);
    const data = normalise(body, row);
    if (data.stream_date) {
        const event = await Event.findByPk(row.event_id, { attributes: ['start_date', 'end_date'] });
        assertInEvent(event, data.stream_date);
    }
    if (has(body, 'type_id')) data.type_id = await requireType(row.event_id, body.type_id);
    const oldCover = has(data, 'cover_image') && row.cover_image && row.cover_image !== data.cover_image
        ? row.cover_image : null;
    const wentLive = data.status === 'live' && row.status !== 'live';
    if (data.status && data.status !== row.status) Object.assign(data, stampsFor(data.status, row));
    await row.update(data);
    if (oldCover) await dropFile(oldCover, row.company_id);
    if (wentLive) await notifyParticipants(row, 'live_stream_live');
    return withType(row);
};

/** Go Live / End Stream / back to Scheduled, from the list and the View page. */
const setStatus = async (clientId, streamId, body = {}) => update(clientId, streamId, { status: body.status });

/** Duplicate Stream: the same details as a new Scheduled stream, "(Copy)" in the title, no viewers. */
const duplicate = async (clientId, streamId) => {
    const src = await resolveStream(clientId, streamId);
    const last = await EventLiveStream.max('sort_order', { where: { event_id: src.event_id } });
    const s = src.toJSON();
    const row = await EventLiveStream.create({
        event_id: s.event_id,
        website_client_id: clientId,
        type_id: s.type_id,
        title: `${String(s.title).slice(0, 143)} (Copy)`,
        platform: s.platform,
        stream_url: s.stream_url,
        rtmp_url: s.rtmp_url,
        visibility: s.visibility,
        stream_date: s.stream_date,
        stream_time: s.stream_time,
        end_time: s.end_time,
        status: 'scheduled',
        description: s.description,
        notes: s.notes,
        // The picture file belongs to the original (deleting either would remove it for both).
        cover_image: null,
        is_enabled: s.is_enabled,
        // A copy waits for its own Go Live: its date is usually still the original's.
        auto_go_live: false,
        notify_participants: s.notify_participants,
        sort_order: Number.isFinite(Number(last)) ? Number(last) + 1 : 0,
        company_id: s.company_id ?? null,
    });
    return withType(row);
};

const remove = async (clientId, streamId) => {
    const row = await resolveStream(clientId, streamId);
    const { cover_image: cover, company_id: companyId } = row;
    await row.destroy();
    if (cover) await dropFile(cover, companyId);
    return { removed: true };
};

/** Store a stream's cover and hand back its URL; the form saves the URL. */
const uploadCover = async (clientId, eventId, file) => {
    if (!file || !file.buffer) throw ApiError.badRequest('Please choose an image to upload.');
    const event = await resolveEvent(clientId, eventId);
    if (!IMAGE_MIMES.includes(file.mimetype)) throw ApiError.badRequest('Please choose a JPG, PNG or WEBP image.');
    const client = await WebsiteClient.findByPk(clientId, { attributes: ['company_id'] });
    const stored = await mediaService.upload(
        file, { folder: `event-live-streams/${event.id}` }, event.company_id || client?.company_id || 1,
    );
    if (!stored || !stored.url) throw ApiError.badRequest('That image could not be stored.');
    return { url: stored.url };
};

/** A deleted event's stream covers leave storage, then its streams and types go. */
const purgeEvent = async (eventId) => {
    const streams = await EventLiveStream.findAll({
        where: { event_id: eventId }, attributes: ['cover_image', 'company_id'], raw: true,
    });
    const files = streams.filter((r) => r.cover_image);
    for (let i = 0; i < files.length; i += 5) {
        await Promise.all(files.slice(i, i + 5).map((r) => dropFile(r.cover_image, r.company_id)));
    }
    await EventLiveStream.destroy({ where: { event_id: eventId } });
    await EventLiveStreamType.destroy({ where: { event_id: eventId } });
};

module.exports = {
    PLATFORMS,
    VISIBILITIES,
    statusOf,
    MAX_IMAGE_BYTES,
    IMAGE_MIMES,
    listTypes,
    createType,
    updateType,
    removeType,
    reorderTypes,
    list,
    getOne,
    create,
    update,
    setStatus,
    duplicate,
    share,
    recordView,
    remove,
    uploadCover,
    purgeEvent,
};
