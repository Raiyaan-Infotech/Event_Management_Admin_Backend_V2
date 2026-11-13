/**
 * Event Availability (2026-11-12) — how many events may be created on each date.
 *
 * Rules agreed with Jamal:
 *   - the daily limit is shared by ALL clients together;
 *   - a multi-day event takes one slot on EVERY day it covers;
 *   - a date no active published config covers is "not configured" — clients cannot book it;
 *   - lowering a limit below what is already booked is refused, and the error lists those events
 *     (Mark Fully Booked / Disable Date are the way to stop new bookings — existing events are
 *     never touched);
 *   - two active published configs may not cover the same category on the same date: special days
 *     go through an override.
 *
 * Every per-date change (the Special Limits Override page AND the daily list's action menu) is an
 * AvailabilityOverride row. The daily list is not stored — it is worked out from config + overrides +
 * the real event count each time.
 *
 * Always enforced: a client can only create an event on a configured, open date.
 */
const { Sequelize, AvailabilityConfig, AvailabilityOverride, Event, EventCategory, WebsiteClient } = require('../models');
const ApiError = require('../utils/apiError');

const { Op } = Sequelize;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
const LOW_BALANCE = 2;
/** Event statuses that hold a slot. Cancelled and deleted events free it. */
const BOOKED_STATUSES = ['draft', 'upcoming'];
const MODES = ['limit', 'full', 'disabled', 'removed'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── date helpers (YYYY-MM-DD strings, UTC so no timezone shifts a day) ──────────────────────────

const toUtc = (d) => new Date(`${d}T00:00:00Z`);
const fmt = (date) => date.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = toUtc(d); x.setUTCDate(x.getUTCDate() + n); return fmt(x); };
const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
const dayName = (d) => DAYS[toUtc(d).getUTCDay()];
const isWeekend = (d) => [0, 6].includes(toUtc(d).getUTCDay());
const pretty = (d) => { const x = toUtc(d); return `${String(x.getUTCDate()).padStart(2, '0')} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
const prettyRange = (a, b) => (a === b ? pretty(a) : `${pretty(a)} – ${pretty(b)}`);
const maxDate = (a, b) => (a > b ? a : b);
const minDate = (a, b) => (a < b ? a : b);
const eachDay = (from, to) => {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
};
const today = () => fmt(new Date());

const asDate = (value, label) => {
    const v = String(value ?? '').trim().slice(0, 10);
    if (!v) throw ApiError.badRequest(`Please choose the ${label}.`);
    if (!DATE_ONLY.test(v) || Number.isNaN(toUtc(v).getTime())) throw ApiError.badRequest(`The ${label} is not a valid date.`);
    return v;
};
const asInt = (value, label, { min = 0, max = 100000 } = {}) => {
    const n = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isInteger(n)) {
        throw ApiError.badRequest(`Please enter the ${label}.`);
    }
    if (n < min || n > max) throw ApiError.badRequest(`The ${label} must be between ${min} and ${max}.`);
    return n;
};
const asBool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const text = (v, max) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : null;
};

// ── loading ────────────────────────────────────────────────────────────────────────────────────

const LIVE = { publish_status: 'published', is_active: true };

/** Category names by id, for display. */
const categoryNames = async (ids) => {
    const list = [...new Set(ids.filter(Boolean))];
    if (!list.length) return new Map();
    const rows = await EventCategory.findAll({ where: { id: list }, attributes: ['id', 'name'], paranoid: false });
    return new Map(rows.map((r) => [r.id, r.name]));
};

/** Active overrides of the given configs that touch [from, to]. */
const loadOverrides = async (configIds, from, to) => {
    if (!configIds.length) return [];
    return AvailabilityOverride.findAll({
        where: { config_id: configIds, is_active: true, start_date: { [Op.lte]: to }, end_date: { [Op.gte]: from } },
        raw: true,
    });
};

/** Events holding a slot somewhere in [from, to]. A one-day event may fill only start_date. */
const loadEvents = async (from, to, { excludeEventId = null } = {}) => {
    const where = {
        status: BOOKED_STATUSES,
        start_date: { [Op.ne]: null, [Op.lte]: to },
        [Op.and]: [Sequelize.literal(`COALESCE(\`Event\`.\`end_date\`, \`Event\`.\`start_date\`) >= ${Event.sequelize.escape(from)}`)],
    };
    if (excludeEventId) where.id = { [Op.ne]: excludeEventId };
    return Event.findAll({
        where,
        attributes: ['id', 'name', 'website_client_id', 'event_category_id', 'start_date', 'end_date', 'start_time', 'venue_name', 'status'],
        raw: true,
    });
};

const eventCovers = (ev, d) => ev.start_date <= d && (ev.end_date || ev.start_date) >= d;
const eventMatches = (config, ev) => config.event_category_id == null || ev.event_category_id === config.event_category_id;

// ── the day engine ─────────────────────────────────────────────────────────────────────────────

/** The override in force on `d` for `config`: shortest range first, then the newest. */
const overrideFor = (config, d, overrides) => overrides
    .filter((o) => o.config_id === config.id && o.start_date <= d && o.end_date >= d)
    .sort((a, b) => (daysBetween(a.start_date, a.end_date) - daysBetween(b.start_date, b.end_date)) || (b.id - a.id))[0] || null;

/**
 * One date of one config.
 * status  available | low | full | disabled | removed
 */
const computeDay = (config, d, overrides, events, { withEvents = false } = {}) => {
    const ovr = overrideFor(config, d, overrides);
    const dayEvents = events.filter((ev) => eventMatches(config, ev) && eventCovers(ev, d));
    const booked = dayEvents.length;

    let max = Number(config.daily_max);
    let status = null;
    let disabledReason = null;

    if (ovr?.mode === 'removed') status = 'removed';
    else if (ovr?.mode === 'disabled') { status = 'disabled'; disabledReason = ovr.reason || 'Disabled by admin'; }
    else if (ovr?.mode === 'full') status = 'full';
    else if (ovr?.mode === 'limit') max = Number(ovr.daily_limit ?? 0);

    if (!status && config.block_weekends && isWeekend(d)) { status = 'disabled'; disabledReason = 'Weekend'; }
    if (!status && config.exclude_holidays && Array.isArray(config.holidays) && config.holidays.includes(d)) {
        status = 'disabled'; disabledReason = 'Public holiday';
    }

    const balance = status === 'full' || status === 'disabled' || status === 'removed' ? 0 : Math.max(0, max - booked);
    if (!status) status = balance <= 0 ? 'full' : (balance <= LOW_BALANCE ? 'low' : 'available');

    const lastUpdated = [config.updated_at, ovr?.updated_at].filter(Boolean).map((x) => new Date(x)).sort((a, b) => b - a)[0] || null;

    return {
        date: d,
        day: dayName(d),
        config_id: config.id,
        config_name: config.name,
        event_category_id: config.event_category_id,
        default_limit: Number(config.daily_max),
        daily_max: max,
        booked,
        balance,
        status,
        disabled_reason: disabledReason,
        override_id: ovr?.id ?? null,
        override_mode: ovr?.mode ?? null,
        notes: ovr?.reason || config.notes || null,
        last_updated: lastUpdated,
        ...(withEvents ? { events: dayEvents } : {}),
    };
};

/** Live configs touching [from, to], optionally only one category (NULL configs cover every category). */
const liveConfigs = async (from, to, { categoryId = null, configId = null } = {}) => {
    const where = { ...LIVE, start_date: { [Op.lte]: to }, end_date: { [Op.gte]: from } };
    if (configId) where.id = configId;
    if (categoryId) where.event_category_id = { [Op.or]: [categoryId, null] };
    return AvailabilityConfig.findAll({ where, raw: true });
};

const parseHolidays = (c) => {
    if (typeof c.holidays === 'string') {
        try { c.holidays = JSON.parse(c.holidays); } catch { c.holidays = []; }
    }
    return c;
};

/** Every configured date in [from, to]. */
const buildDays = async (from, to, opts = {}) => {
    const configs = (await liveConfigs(from, to, opts)).map(parseHolidays);
    const overrides = await loadOverrides(configs.map((c) => c.id), from, to);
    const events = await loadEvents(from, to, opts);
    const days = [];
    for (const c of configs) {
        for (const d of eachDay(maxDate(c.start_date, from), minDate(c.end_date, to))) {
            days.push(computeDay(c, d, overrides, events, opts));
        }
    }
    return { configs, overrides, events, days };
};

const clientNames = async (events) => {
    const ids = [...new Set(events.map((e) => e.website_client_id).filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await WebsiteClient.findAll({ where: { id: ids }, attributes: ['id', 'name'], paranoid: false });
    return new Map(rows.map((r) => [r.id, r.name]));
};

const presentEvents = async (events) => {
    const names = await clientNames(events);
    return events
        .slice()
        .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
        .map((e) => ({
            id: e.id,
            name: e.name,
            client_name: names.get(e.website_client_id) || null,
            start_date: e.start_date,
            end_date: e.end_date || e.start_date,
            start_time: e.start_time,
            venue_name: e.venue_name,
            status: e.status,
        }));
};

/**
 * Refuse a limit that is lower than what is already booked on any of `dates`.
 * `limitFor(d)` returns the proposed limit on that date, or null when it is not a numeric limit.
 */
const assertNotBelowBooked = async (config, dates, limitFor, { hint = 'Use Mark Fully Booked or Disable Date to stop new bookings.' } = {}) => {
    if (!dates.length) return;
    const from = dates[0];
    const to = dates[dates.length - 1];
    const events = await loadEvents(from, to);
    const problems = [];
    for (const d of dates) {
        const limit = limitFor(d);
        if (limit === null || limit === undefined) continue;
        const booked = events.filter((ev) => eventMatches(config, ev) && eventCovers(ev, d));
        if (booked.length > limit) problems.push({ date: d, limit, booked });
    }
    if (!problems.length) return;

    const first = problems[0];
    const detail = [];
    for (const p of problems.slice(0, 10)) {
        detail.push({ date: p.date, limit: p.limit, booked: p.booked.length, events: await presentEvents(p.booked) });
    }
    const more = problems.length > 1 ? ` (and ${problems.length - 1} more date${problems.length === 2 ? '' : 's'})` : '';
    throw ApiError.badRequest(
        `Unable to set the limit to ${first.limit}: ${first.booked.length} event${first.booked.length === 1 ? ' is' : 's are'} already booked on ${pretty(first.date)}${more}. `
        + `The limit cannot go below the booked count. ${hint}`,
        detail,
    );
};

// ── configs ────────────────────────────────────────────────────────────────────────────────────

const CONFIG_FIELDS = ['name', 'event_category_id', 'start_date', 'end_date', 'daily_max', 'allow_single_date', 'allow_multi_date',
    'auto_full', 'block_weekends', 'exclude_holidays', 'holidays', 'notes', 'is_active', 'publish_status'];

const normaliseConfig = async (body, existing = null) => {
    const src = { ...(existing ? existing.get({ plain: true }) : {}), ...Object.fromEntries(CONFIG_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])) };
    const out = {};

    out.name = text(src.name, 120);
    if (!out.name) throw ApiError.badRequest('Please enter the config name.');

    if (src.event_category_id === '' || src.event_category_id === null || src.event_category_id === undefined || src.event_category_id === 'all') {
        out.event_category_id = null;
    } else {
        const id = Number(src.event_category_id);
        const cat = Number.isInteger(id) ? await EventCategory.findByPk(id, { attributes: ['id'] }) : null;
        if (!cat) throw ApiError.badRequest('Please choose a valid event category.');
        out.event_category_id = id;
    }

    out.start_date = asDate(src.start_date, 'start date');
    out.end_date = asDate(src.end_date, 'end date');
    if (out.end_date < out.start_date) throw ApiError.badRequest('The end date cannot be before the start date.');
    if (daysBetween(out.start_date, out.end_date) + 1 > MAX_RANGE_DAYS) {
        throw ApiError.badRequest(`A config can cover at most ${MAX_RANGE_DAYS} days.`);
    }

    out.daily_max = asInt(src.daily_max, 'daily max events', { min: 1, max: 10000 });
    out.allow_single_date = src.allow_single_date === undefined ? true : asBool(src.allow_single_date);
    out.allow_multi_date = src.allow_multi_date === undefined ? true : asBool(src.allow_multi_date);
    if (!out.allow_single_date && !out.allow_multi_date) {
        throw ApiError.badRequest('Allow single date booking, multiple date booking, or both.');
    }
    out.auto_full = src.auto_full === undefined ? true : asBool(src.auto_full);
    out.block_weekends = asBool(src.block_weekends);
    out.exclude_holidays = asBool(src.exclude_holidays);

    let holidays = src.holidays;
    if (typeof holidays === 'string') { try { holidays = JSON.parse(holidays); } catch { holidays = []; } }
    holidays = Array.isArray(holidays) ? [...new Set(holidays.map((h) => String(h).slice(0, 10)).filter((h) => DATE_ONLY.test(h)))].sort() : [];
    if (holidays.some((h) => h < out.start_date || h > out.end_date)) {
        throw ApiError.badRequest('Holiday dates must be inside the config date range.');
    }
    if (out.exclude_holidays && !holidays.length) throw ApiError.badRequest('Please add the public holiday dates, or switch Exclude Public Holidays off.');
    out.holidays = holidays.length ? holidays : null;

    out.notes = text(src.notes, 500);
    out.is_active = src.is_active === undefined ? true : asBool(src.is_active);
    out.publish_status = src.publish_status === 'published' ? 'published' : 'draft';
    return out;
};

/** Two live configs may not cover the same category on the same date. */
const assertNoOverlap = async (data, ignoreId = null) => {
    if (data.publish_status !== 'published' || !data.is_active) return;
    const where = { ...LIVE, start_date: { [Op.lte]: data.end_date }, end_date: { [Op.gte]: data.start_date } };
    if (ignoreId) where.id = { [Op.ne]: ignoreId };
    if (data.event_category_id != null) where.event_category_id = { [Op.or]: [data.event_category_id, null] };
    const clash = await AvailabilityConfig.findOne({ where, raw: true });
    if (!clash) return;
    const names = await categoryNames([clash.event_category_id, data.event_category_id]);
    const cat = names.get(data.event_category_id) || names.get(clash.event_category_id) || 'All categories';
    throw ApiError.badRequest(
        `${cat} already has a config for ${prettyRange(maxDate(clash.start_date, data.start_date), minDate(clash.end_date, data.end_date))} `
        + `("${clash.name}"). Use a Special Limit Override for those dates instead.`,
    );
};

const presentConfig = async (c, { withSummary = false } = {}) => {
    const plain = parseHolidays(typeof c.get === 'function' ? c.get({ plain: true }) : { ...c });
    const names = await categoryNames([plain.event_category_id]);
    const out = {
        ...plain,
        category_name: plain.event_category_id ? (names.get(plain.event_category_id) || null) : 'All Categories',
        total_days: daysBetween(plain.start_date, plain.end_date) + 1,
    };
    if (withSummary) {
        const overrides = await AvailabilityOverride.findAll({ where: { config_id: plain.id, is_active: true }, raw: true });
        const events = await loadEvents(plain.start_date, plain.end_date);
        const days = eachDay(plain.start_date, plain.end_date).map((d) => computeDay(plain, d, overrides, events)).filter((x) => x.status !== 'removed');
        out.override_count = overrides.length;
        out.available_days = days.filter((x) => x.status === 'available' || x.status === 'low').length;
        out.total_capacity = days.filter((x) => x.status !== 'disabled').reduce((n, x) => n + x.daily_max, 0);
        out.total_booked = days.reduce((n, x) => n + x.booked, 0);
    }
    return out;
};

const listConfigs = async (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where = {};
    if (query.search) where.name = { [Op.like]: `%${String(query.search).trim()}%` };
    if (query.publish_status === 'draft' || query.publish_status === 'published') where.publish_status = query.publish_status;
    if (query.is_active === 'true' || query.is_active === 'false') where.is_active = query.is_active === 'true';
    if (query.event_category_id) where.event_category_id = Number(query.event_category_id);
    const { rows, count } = await AvailabilityConfig.findAndCountAll({
        where, order: [['start_date', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit,
    });
    const data = [];
    for (const r of rows) data.push(await presentConfig(r));
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 } };
};

const getConfig = async (id) => {
    const c = await AvailabilityConfig.findByPk(id);
    if (!c) throw ApiError.notFound('Availability config not found.');
    return presentConfig(c, { withSummary: true });
};

const createConfig = async (body, userId, companyId) => {
    const data = await normaliseConfig(body);
    await assertNoOverlap(data);
    const c = await AvailabilityConfig.create({ ...data, company_id: companyId ?? null, created_by: userId, updated_by: userId });
    return getConfig(c.id);
};

const updateConfig = async (id, body, userId) => {
    const c = await AvailabilityConfig.findByPk(id);
    if (!c) throw ApiError.notFound('Availability config not found.');
    const data = await normaliseConfig(body, c);
    await assertNoOverlap(data, c.id);

    // A lower daily max must not go below what is booked on any date that still uses the default.
    if (data.publish_status === 'published' && data.daily_max < Number(c.daily_max)) {
        const overrides = await AvailabilityOverride.findAll({ where: { config_id: c.id, is_active: true }, raw: true });
        const probe = { ...c.get({ plain: true }), ...data };
        const dates = eachDay(data.start_date, data.end_date);
        await assertNotBelowBooked(probe, dates, (d) => (overrideFor(probe, d, overrides) ? null : data.daily_max));
    }

    await c.update({ ...data, updated_by: userId });
    return getConfig(c.id);
};

const setConfigStatus = async (id, isActive, userId) => {
    const c = await AvailabilityConfig.findByPk(id);
    if (!c) throw ApiError.notFound('Availability config not found.');
    const data = { ...c.get({ plain: true }), is_active: asBool(isActive) };
    await assertNoOverlap(data, c.id);
    await c.update({ is_active: data.is_active, updated_by: userId });
    return getConfig(c.id);
};

const deleteConfig = async (id) => {
    const c = await AvailabilityConfig.findByPk(id);
    if (!c) throw ApiError.notFound('Availability config not found.');
    await c.destroy();
};

// ── daily list ─────────────────────────────────────────────────────────────────────────────────

const rangeFromQuery = (query) => {
    const now = today();
    const from = query.from ? asDate(query.from, 'start date') : `${now.slice(0, 7)}-01`;
    const to = query.to ? asDate(query.to, 'end date') : addDays(addDays(`${from.slice(0, 7)}-01`, 32).slice(0, 7) + '-01', -1);
    if (to < from) throw ApiError.badRequest('The end date cannot be before the start date.');
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw ApiError.badRequest(`Choose a range of at most ${MAX_RANGE_DAYS} days.`);
    return { from, to };
};

const STATUS_FILTERS = ['available', 'low', 'full', 'disabled'];

const daily = async (query = {}) => {
    const { from, to } = rangeFromQuery(query);
    const categoryId = query.event_category_id && query.event_category_id !== 'all' ? Number(query.event_category_id) : null;
    const { days } = await buildDays(from, to, { categoryId });
    const names = await categoryNames(days.map((d) => d.event_category_id));

    let rows = days
        .filter((d) => d.status !== 'removed')
        .map((d) => ({ ...d, category_name: d.event_category_id ? (names.get(d.event_category_id) || '—') : 'All Categories' }));

    const stats = {
        configured: rows.length,
        available: rows.filter((d) => d.status === 'available' || d.status === 'low').length,
        fully_booked: rows.filter((d) => d.status === 'full').length,
        disabled: rows.filter((d) => d.status === 'disabled').length,
        total_booked: rows.reduce((n, d) => n + d.booked, 0),
    };

    if (STATUS_FILTERS.includes(query.status)) {
        rows = rows.filter((d) => (query.status === 'available' ? d.status === 'available' || d.status === 'low' : d.status === query.status));
    }
    if (query.search) {
        const q = String(query.search).trim().toLowerCase();
        rows = rows.filter((d) => [d.date, pretty(d.date), d.day, d.category_name, d.config_name, d.status].join(' ').toLowerCase().includes(q));
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.category_name).localeCompare(String(b.category_name)));

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 15));
    return {
        range: { from, to },
        stats,
        data: rows.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) || 1 },
    };
};

const loadDay = async (configId, date) => {
    const d = asDate(date, 'date');
    const c = await AvailabilityConfig.findByPk(configId, { raw: true });
    if (!c) throw ApiError.notFound('Availability config not found.');
    parseHolidays(c);
    if (d < c.start_date || d > c.end_date) throw ApiError.badRequest(`${pretty(d)} is outside this config (${prettyRange(c.start_date, c.end_date)}).`);
    const overrides = await loadOverrides([c.id], d, d);
    const events = await loadEvents(d, d);
    return { config: c, date: d, overrides, day: computeDay(c, d, overrides, events, { withEvents: true }) };
};

const dayDetails = async (configId, date) => {
    const { config, day } = await loadDay(configId, date);
    const names = await categoryNames([config.event_category_id]);
    const { events, ...rest } = day;
    return {
        ...rest,
        category_name: config.event_category_id ? (names.get(config.event_category_id) || null) : 'All Categories',
        applies_to: config.applies_to,
        config: await presentConfig(config),
        events: await presentEvents(events),
    };
};

/**
 * The daily list's action menu. Each action writes (or rewrites) the single-day override of that date.
 *   limit     { daily_limit, reason? }   Edit Limit
 *   increase  { increase_by, reason }    Increase Limit
 *   full      { reason? }                Mark Fully Booked
 *   disable   { reason }                 Disable Date
 *   enable    {}                         undo full / disable / limit on that date (back to the default)
 *   remove    {}                         Delete Config (the date leaves the config = not configured)
 */
const dayAction = async (configId, date, body = {}, userId = null) => {
    const { config, date: d, day } = await loadDay(configId, date);
    const action = String(body.action || '');
    const reason = text(body.reason, 250);

    const single = await AvailabilityOverride.findOne({
        where: { config_id: config.id, start_date: d, end_date: d, is_active: true },
        order: [['id', 'DESC']],
    });
    const write = async (fields) => {
        if (single) await single.update({ ...fields, updated_by: userId });
        else await AvailabilityOverride.create({ config_id: config.id, start_date: d, end_date: d, is_active: true, ...fields, created_by: userId, updated_by: userId });
    };

    if (action === 'limit' || action === 'increase') {
        let limit;
        if (action === 'increase') {
            const by = asInt(body.increase_by, 'increase by', { min: 1, max: 10000 });
            if (!reason) throw ApiError.badRequest('Please enter the reason for the increase.');
            limit = day.daily_max + by;
        } else {
            limit = asInt(body.daily_limit, 'new daily max events', { min: 0, max: 10000 });
        }
        await assertNotBelowBooked(config, [d], () => limit);
        await write({ mode: 'limit', daily_limit: limit, reason });
    } else if (action === 'full') {
        await write({ mode: 'full', daily_limit: null, reason });
    } else if (action === 'disable') {
        if (!reason) throw ApiError.badRequest('Please enter the reason for disabling this date.');
        await write({ mode: 'disabled', daily_limit: null, reason });
    } else if (action === 'remove') {
        await write({ mode: 'removed', daily_limit: null, reason });
    } else if (action === 'enable') {
        if (single) await single.destroy();
    } else {
        throw ApiError.badRequest('Unknown action.');
    }
    return dayDetails(config.id, d);
};

// ── special limit overrides ────────────────────────────────────────────────────────────────────

/** The design's Override Type → stored mode + limit. */
const OVERRIDE_TYPES = ['custom', 'increase', 'reduce', 'block', 'full', 'disabled'];

const typeOf = (o, config) => {
    if (o.mode === 'full') return 'full';
    if (o.mode === 'disabled') return 'disabled';
    if (o.mode === 'removed') return 'removed';
    const lim = Number(o.daily_limit ?? 0);
    if (lim === 0) return 'block';
    if (lim > Number(config.daily_max)) return 'increase';
    if (lim < Number(config.daily_max)) return 'reduce';
    return 'custom';
};

const normaliseOverride = async (body, existing = null) => {
    const src = { ...(existing ? existing.get({ plain: true }) : {}), ...body };
    const configId = Number(src.config_id);
    const config = Number.isInteger(configId) ? await AvailabilityConfig.findByPk(configId, { raw: true }) : null;
    if (!config) throw ApiError.badRequest('Please choose the availability config this override belongs to.');

    const start = asDate(src.start_date, 'date');
    const end = src.end_date ? asDate(src.end_date, 'end date') : start;
    if (end < start) throw ApiError.badRequest('The end date cannot be before the start date.');
    if (start < config.start_date || end > config.end_date) {
        throw ApiError.badRequest(`The dates must be inside "${config.name}" (${prettyRange(config.start_date, config.end_date)}).`);
    }

    let type = body.override_type ?? (existing ? typeOf(existing, config) : 'custom');
    if (!OVERRIDE_TYPES.includes(type)) type = 'custom';
    const out = { config_id: config.id, start_date: start, end_date: end, reason: text(src.reason, 250) };
    out.is_active = src.is_active === undefined ? true : asBool(src.is_active);

    if (type === 'full' || type === 'disabled') {
        out.mode = type;
        out.daily_limit = null;
        if (type === 'disabled' && !out.reason) throw ApiError.badRequest('Please enter the reason for disabling these dates.');
    } else if (type === 'block') {
        out.mode = 'limit';
        out.daily_limit = 0;
    } else {
        out.mode = 'limit';
        out.daily_limit = asInt(src.daily_limit, 'daily event limit', { min: 0, max: 10000 });
        if (type === 'increase' && out.daily_limit <= Number(config.daily_max)) {
            throw ApiError.badRequest(`An increase must be above the default limit (${config.daily_max}).`);
        }
        if (type === 'reduce' && out.daily_limit >= Number(config.daily_max)) {
            throw ApiError.badRequest(`A reduction must be below the default limit (${config.daily_max}).`);
        }
    }
    return { data: out, config };
};

const presentOverride = async (o, config, events, names) => {
    const plain = typeof o.get === 'function' ? o.get({ plain: true }) : o;
    const days = eachDay(plain.start_date, plain.end_date);
    // Booked = the busiest day of the range, so balance shows the tightest day.
    const booked = Math.max(0, ...days.map((d) => events.filter((ev) => eventMatches(config, ev) && eventCovers(ev, d)).length));
    const limit = plain.mode === 'limit' ? Number(plain.daily_limit ?? 0) : null;
    return {
        ...plain,
        code: `SLO-${String(plain.start_date).replace(/-/g, '')}-${String(plain.id).padStart(3, '0')}`,
        type: typeOf(plain, config),
        config_name: config.name,
        event_category_id: config.event_category_id,
        category_name: config.event_category_id ? (names.get(config.event_category_id) || null) : 'All Categories',
        default_limit: Number(config.daily_max),
        override_limit: limit,
        booked,
        balance: limit === null ? 0 : Math.max(0, limit - booked),
        utilization: limit ? Math.round((booked / limit) * 100) : null,
    };
};

const listOverrides = async (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const where = { mode: { [Op.ne]: 'removed' } };
    if (query.status === 'active') where.is_active = true;
    if (query.status === 'inactive') where.is_active = false;
    if (query.config_id) where.config_id = Number(query.config_id);

    const all = await AvailabilityOverride.findAll({ where, order: [['start_date', 'ASC'], ['id', 'ASC']], raw: true });
    const configs = await AvailabilityConfig.findAll({ where: { id: [...new Set(all.map((o) => o.config_id))] }, raw: true });
    const byId = new Map(configs.map((c) => [c.id, c]));
    let rows = all.filter((o) => byId.has(o.config_id));
    const names = await categoryNames(configs.map((c) => c.event_category_id));

    if (query.search) {
        const q = String(query.search).trim().toLowerCase();
        rows = rows.filter((o) => {
            const c = byId.get(o.config_id);
            return [o.start_date, o.end_date, pretty(o.start_date), pretty(o.end_date), o.reason, typeOf(o, c), o.is_active ? 'active' : 'inactive', c.name]
                .join(' ').toLowerCase().includes(q);
        });
    }

    const total = rows.length;
    const pageRows = rows.slice((page - 1) * limit, page * limit);
    const data = [];
    if (pageRows.length) {
        const from = pageRows.reduce((m, o) => minDate(m, o.start_date), pageRows[0].start_date);
        const to = pageRows.reduce((m, o) => maxDate(m, o.end_date), pageRows[0].end_date);
        const events = await loadEvents(from, to);
        for (const o of pageRows) data.push(await presentOverride(o, byId.get(o.config_id), events, names));
    }
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
};

const getOverride = async (id) => {
    const o = await AvailabilityOverride.findByPk(id, { raw: true });
    if (!o) throw ApiError.notFound('Override not found.');
    const config = await AvailabilityConfig.findByPk(o.config_id, { raw: true, paranoid: false });
    const events = await loadEvents(o.start_date, o.end_date);
    const out = await presentOverride(o, config, events, await categoryNames([config.event_category_id]));
    out.created_by_name = null;
    if (o.created_by) {
        const { User } = require('../models');
        const u = await User.findByPk(o.created_by, { attributes: ['id', 'full_name'], paranoid: false }).catch(() => null);
        out.created_by_name = u?.full_name || null;
    }
    return out;
};

const checkOverrideLimit = async (data, config) => {
    if (!data.is_active || data.mode !== 'limit') return;
    const hint = data.daily_limit === 0
        ? 'To stop new bookings and keep these events, use Mark Fully Booked or Disable Date instead of Block Date.'
        : undefined;
    await assertNotBelowBooked(config, eachDay(data.start_date, data.end_date), () => data.daily_limit, hint ? { hint } : {});
};

const createOverride = async (body, userId) => {
    const { data, config } = await normaliseOverride(body);
    await checkOverrideLimit(data, config);
    const o = await AvailabilityOverride.create({ ...data, created_by: userId, updated_by: userId });
    return getOverride(o.id);
};

const updateOverride = async (id, body, userId) => {
    const o = await AvailabilityOverride.findByPk(id);
    if (!o) throw ApiError.notFound('Override not found.');
    const { data, config } = await normaliseOverride(body, o);
    await checkOverrideLimit(data, config);
    await o.update({ ...data, updated_by: userId });
    return getOverride(o.id);
};

const setOverrideStatus = async (id, isActive, userId) => {
    const o = await AvailabilityOverride.findByPk(id);
    if (!o) throw ApiError.notFound('Override not found.');
    const active = asBool(isActive);
    if (active && !o.is_active) {
        const config = await AvailabilityConfig.findByPk(o.config_id, { raw: true });
        await checkOverrideLimit({ ...o.get({ plain: true }), is_active: true }, config);
    }
    await o.update({ is_active: active, updated_by: userId });
    return getOverride(o.id);
};

const deleteOverride = async (id) => {
    const o = await AvailabilityOverride.findByPk(id);
    if (!o) throw ApiError.notFound('Override not found.');
    await o.destroy();
};

/** Bulk bar: { ids: [], action: activate | deactivate | delete }. Activations that would break a limit are skipped. */
const bulkOverrides = async (body = {}, userId) => {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger);
    if (!ids.length) throw ApiError.badRequest('Select at least one override.');
    const action = String(body.action || '');
    if (!['activate', 'deactivate', 'delete'].includes(action)) throw ApiError.badRequest('Unknown action.');
    let done = 0;
    const skipped = [];
    for (const id of ids) {
        try {
            if (action === 'delete') await deleteOverride(id);
            else await setOverrideStatus(id, action === 'activate', userId);
            done += 1;
        } catch (e) {
            skipped.push({ id, reason: e.message });
        }
    }
    return { done, skipped };
};

// ── client side ────────────────────────────────────────────────────────────────────────────────

/** The live config for one category on one date: the exact category first, then an all-categories one. */
const configForDay = (configs, categoryId, d) => {
    const covering = configs.filter((c) => c.start_date <= d && c.end_date >= d
        && (c.event_category_id == null || c.event_category_id === (categoryId ?? null)));
    return covering.find((c) => c.event_category_id != null) || covering[0] || null;
};

/**
 * The client portal calendar (Jamal 2026-11-13): one entry per date, TOTAL slots across every live
 * config that covers it (no category picker). Dates no config covers are `not_configured` (the
 * portal hides them). `my_events` = this client's OWN events on the date — never other clients'.
 * status  available | low | full | disabled | not_configured
 *
 * The category is still checked when the event is saved (assertEventDatesBookable).
 */
const clientCalendar = async (query = {}, clientId = null) => {
    const { from, to } = rangeFromQuery(query);
    const configs = (await liveConfigs(from, to)).map(parseHolidays);
    const overrides = await loadOverrides(configs.map((c) => c.id), from, to);
    const events = await loadEvents(from, to);
    const mine = clientId ? events.filter((e) => e.website_client_id === Number(clientId)) : [];
    const exceptions = await clientExceptions(clientId, from, to);

    const days = eachDay(from, to).map((d) => {
        const parts = configs
            .filter((c) => c.start_date <= d && c.end_date >= d)
            .map((c) => computeDay(c, d, overrides, events))
            .filter((x) => x.status !== 'removed');
        const myEvents = mine.filter((e) => eventCovers(e, d))
            .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
            .map((e) => ({ id: e.id, name: e.name, start_time: e.start_time, status: e.status }));
        // A date the super admin reserved for this client's approved request: bookable for them only.
        if (exceptions.some((e) => e.dates.includes(d))) {
            const booked = parts.reduce((n, x) => n + x.booked, 0);
            return { date: d, day: dayName(d), status: 'available', reserved: true, daily_max: booked + 1, booked, balance: 1, my_events: myEvents };
        }
        if (!parts.length) return { date: d, day: dayName(d), status: 'not_configured', daily_max: 0, booked: 0, balance: 0, my_events: myEvents };

        const open = parts.filter((x) => x.status !== 'disabled');
        const dailyMax = open.reduce((n, x) => n + x.daily_max, 0);
        const booked = parts.reduce((n, x) => n + x.booked, 0);
        const balance = open.reduce((n, x) => n + x.balance, 0);
        let status;
        if (!open.length) status = 'disabled';
        else if (balance <= 0) status = 'full';
        else status = balance <= LOW_BALANCE ? 'low' : 'available';
        return { date: d, day: dayName(d), status, daily_max: dailyMax, booked, balance, my_events: myEvents };
    });
    return { range: { from, to }, days };
};

/**
 * Called by clientEvent.service on create, and on update when the dates or category change.
 * Throws the message the client portal shows.
 */
/**
 * Approved one-time exceptions of THIS client (Allocation Requests, 2026-11-13): a date the super admin
 * reserved for the client's request is bookable for them even when it is full / not open for others.
 * Valid until it expires or an event has used it.
 */
const clientExceptions = async (clientId, from, to) => {
    if (!clientId) return [];
    const { AvailabilityRequest } = require('../models');
    const rows = await AvailabilityRequest.findAll({
        where: { website_client_id: clientId, status: 'approved', start_date: { [Op.lte]: to }, end_date: { [Op.gte]: from } },
        raw: true,
    });
    const now = Date.now();
    return rows.map((r) => {
        let d = r.decision;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
        return { id: r.id, dates: Array.isArray(d?.dates) ? d.dates : [], expires: d?.expires_at ? Date.parse(d.expires_at) : 0, used: !!d?.used_event_id };
    }).filter((x) => !x.used && x.expires > now && x.dates.length);
};

/**
 * Returns { usedRequestIds } — the approved exceptions this booking relies on, so the caller can mark
 * them used once the event is saved.
 */
const assertEventDatesBookable = async ({ categoryId = null, startDate, endDate, excludeEventId = null, clientId = null }) => {
    if (!startDate) return { usedRequestIds: [] };
    const from = startDate;
    const to = endDate && endDate > startDate ? endDate : startDate;
    const dates = eachDay(from, to);
    const configs = (await liveConfigs(from, to, { categoryId })).map(parseHolidays);
    const overrides = await loadOverrides(configs.map((c) => c.id), from, to);
    const events = await loadEvents(from, to, { excludeEventId });
    const exceptions = await clientExceptions(clientId, from, to);
    const used = new Set();

    for (const d of dates) {
        const ex = exceptions.find((e) => e.dates.includes(d));
        if (ex) { used.add(ex.id); continue; }
        const c = configForDay(configs, categoryId, d);
        const x = c ? computeDay(c, d, overrides, events) : null;
        if (!c || x.status === 'removed') {
            throw ApiError.badRequest(`${pretty(d)} is not configured for event booking. Please contact admin.`);
        }
        if (dates.length > 1 && !c.allow_multi_date) throw ApiError.badRequest(`Multi-day events are not allowed on ${pretty(d)}. Please choose a single date.`);
        if (dates.length === 1 && !c.allow_single_date) throw ApiError.badRequest(`Single-day events are not allowed on ${pretty(d)}. Please choose more than one date.`);
        if (x.status === 'disabled') throw ApiError.badRequest(`${pretty(d)} is not available for booking. Please choose another date.`);
        if (x.status === 'full') throw ApiError.badRequest(`${pretty(d)} is fully booked. Please choose another date.`);
    }
    return { usedRequestIds: [...used] };
};

/** Mark approved exceptions as used by an event (one event per approval). */
const markExceptionsUsed = async (requestIds, eventId) => {
    if (!requestIds?.length) return;
    const { AvailabilityRequest } = require('../models');
    for (const id of requestIds) {
        const r = await AvailabilityRequest.findByPk(id);
        if (!r) continue;
        let d = r.decision;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
        await r.update({ decision: { ...(d || {}), used_event_id: eventId, used_at: new Date().toISOString() } });
    }
};

module.exports = {
    MODES,
    // configs
    listConfigs, getConfig, createConfig, updateConfig, setConfigStatus, deleteConfig,
    // daily list
    daily, dayDetails, dayAction,
    // overrides
    listOverrides, getOverride, createOverride, updateOverride, setOverrideStatus, deleteOverride, bulkOverrides,
    // client
    clientCalendar, assertEventDatesBookable, markExceptionsUsed, clientExceptions,
};
