const axios = require('axios');
const {
    Event, EventParticipant, EventNearbyPlace, NearbyCategory, WebsiteClient,
} = require('../models');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const mediaService = require('./media.service');
const { TtlCache } = require('../utils/ttlCache');
const nearbyService = require('./clientNearby.service');

/**
 * Near By places (2026-11-10, Jamal's web design) — the places the organizer chooses for guests.
 *
 * "Add Nearby Place" searches Google Places API (New) around the venue pin — by category tiles
 * (Nearby Search, the tile's `google_types`) or by typed text (Text Search) — and the organizer saves
 * the ones guests should see. Google is called HERE only (the key never leaves the server). A saved
 * place keeps its own copy of name / address / rating / photo, so guests opening Near By cost no
 * Google call. Suggestion results are kept 10 minutes per search.
 *
 * Read: organizer (every place) and participants (the visible ones). Write: organizer only.
 */

const RADII_KM = [1, 2, 3, 5, 10];
const DEFAULT_RADIUS_KM = 2;
const SORTS = ['distance', 'rating', 'name'];
const PER_CATEGORY = 10;
const MAX_SUGGESTIONS = 20;
const MAX_SAVE = 20;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
/** Google photo URLs we copy from (anything else is refused — no fetching arbitrary URLs). */
const PHOTO_HOST = /(^|\.)googleusercontent\.com$/i;
const ORDER = [['sort_order', 'ASC'], ['id', 'ASC']];
const EVENT_ATTRS = ['id', 'company_id', 'website_client_id', 'venue_name', 'venue_address', 'venue_lat', 'venue_lng', 'venue_map_link'];

const FALLBACK_CATEGORIES = [
    ['hotel', 'Hotel', 'mdi:bed', '#2563EB', 'lodging,hotel'],
    ['restaurant', 'Restaurant', 'mdi:silverware-fork-knife', '#EA580C', 'restaurant'],
    ['hospital', 'Hospital', 'mdi:hospital-box', '#E11D48', 'hospital'],
    ['parking', 'Parking', 'mdi:car', '#7C3AED', 'parking'],
    ['atm', 'ATM / Bank', 'mdi:bank', '#1D4ED8', 'atm,bank'],
    ['fuel', 'Fuel Station', 'mdi:gas-station', '#0284C7', 'gas_station'],
    ['temple', 'Temple', 'mdi:temple-hindu', '#9333EA', 'hindu_temple,church,mosque'],
    ['shopping', 'Shopping', 'mdi:shopping', '#D97706', 'shopping_mall,department_store'],
    ['tourist', 'Tourist Spot', 'mdi:camera', '#16A34A', 'tourist_attraction'],
    ['other', 'Other', 'mdi:dots-horizontal', '#6B7280', ''],
].map(([key, name, icon, color, types]) => ({ key, name, icon, color, types: types ? types.split(',') : [] }));

const { distanceKm, venueOf } = nearbyService._internal;

const apiKey = () => process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || process.env.Places_API || '';

const clean = (raw, max) => {
    const s = typeof raw === 'string' ? raw.trim() : '';
    return s ? s.slice(0, max) : null;
};
const has = (body, f) => Object.prototype.hasOwnProperty.call(body, f);
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const dropFile = (url, companyId) => (url
    ? mediaService.deleteByUrl(url, companyId || 1).catch(() => null)
    : Promise.resolve());

const categoryCache = new TtlCache(60 * 1000);
const categories = () => categoryCache.wrap('all', async () => {
    try {
        const rows = await NearbyCategory.findAll({ where: { is_active: true }, order: [['sort_order', 'ASC'], ['id', 'ASC']], raw: true });
        return rows.map((r) => ({
            key: r.category_key,
            name: r.name,
            icon: r.icon,
            color: r.color || null,
            types: String(r.google_types || '').split(',').map((t) => t.trim()).filter(Boolean),
        }));
    } catch (e) {
        const code = e?.original?.code ?? e?.parent?.code;
        if (code === 'ER_NO_SUCH_TABLE') return FALLBACK_CATEGORIES;
        throw e;
    }
});
/** What the page gets — the Google types stay on the server. */
const publicCategories = (cats) => cats.map(({ key, name, icon, color, types }) => ({ key, name, icon, color, searchable: types.length > 0 }));

/** Ten minutes per (venue, search) — reopening the panel or flipping a sort costs nothing. */
const suggestionCache = new TtlCache(10 * 60 * 1000);
/** A venue address → its point on the map, kept a day (the address rarely changes). */
const geocodeCache = new TtlCache(24 * 60 * 60 * 1000);

/**
 * Where Near By searches from — the EVENT's location (Jamal, 2026-11-10):
 *   1. the venue pin (venue_lat / venue_lng)          source "pin"
 *   2. the coordinates inside the venue's map link     source "map_link"   (both via venueOf)
 *   3. the venue name + address looked up on Google    source "address"
 * None of them → has_location false and the page asks for the pin.
 */
const locate = async (event) => {
    const venue = venueOf(event);
    if (venue.has_location) {
        const pinned = event.venue_lat != null && Number(event.venue_lat) !== 0;
        return { ...venue, source: pinned ? 'pin' : 'map_link' };
    }
    const text = [event.venue_name, event.venue_address].map((s) => String(s || '').trim()).filter(Boolean).join(', ');
    if (!text || !apiKey()) return { ...venue, source: null };
    const point = await geocodeCache.wrap(text.toLowerCase(), async () => {
        try {
            const res = await axios.post('https://places.googleapis.com/v1/places:searchText', { textQuery: text, maxResultCount: 1 }, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey(), 'X-Goog-FieldMask': 'places.location' },
            });
            const loc = res.data?.places?.[0]?.location;
            // `false` (not null) so "not found" is remembered too and not asked again every open.
            return loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) ? { lat: loc.latitude, lng: loc.longitude } : false;
        } catch (e) {
            logger.error(`[nearby-places] venue lookup failed: ${e.message}`);
            return undefined; // not cached: try again next time
        }
    });
    if (!point) return { ...venue, source: null };
    return { ...venue, lat: point.lat, lng: point.lng, has_location: true, source: 'address' };
};

const resolveEventForView = async (clientId, rawId) => {
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
    if (Number(event.website_client_id) === Number(clientId)) return { event, isOwner: true };
    if (!membership) throw ApiError.notFound('That event is not on your account.');
    return { event, isOwner: false };
};

const resolveEvent = async (clientId, rawId) => {
    const eventId = Number(rawId);
    if (!eventId) throw ApiError.badRequest('Please choose an event.');
    const event = await Event.findOne({ where: { id: eventId, website_client_id: clientId }, attributes: EVENT_ATTRS });
    if (!event) throw ApiError.notFound('That event is not on your account.');
    return event;
};

const resolveRow = async (clientId, id) => {
    const row = await EventNearbyPlace.findOne({ where: { id: Number(id) || 0, website_client_id: clientId } });
    if (!row) throw ApiError.notFound('That place was not found.');
    return row;
};

const present = (row) => {
    const r = row.toJSON ? row.toJSON() : row;
    return {
        id: r.id,
        event_id: r.event_id,
        google_place_id: r.google_place_id || null,
        name: r.name,
        description: r.description || null,
        category_key: r.category_key,
        address: r.address || null,
        lat: num(r.lat),
        lng: num(r.lng),
        distance_km: num(r.distance_km),
        rating: num(r.rating),
        rating_count: num(r.rating_count),
        map_url: r.map_url || null,
        photo_url: r.photo_url || null,
        show_in_app: r.show_in_app === true || r.show_in_app === 1,
        sort_order: r.sort_order,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
};

const rowsFor = (eventId) => EventNearbyPlace.findAll({ where: { event_id: eventId }, order: ORDER });

/** GET /events/:id/nearby-places — organizer: every place + totals; participant: the visible ones. */
const list = async (clientId, eventId) => {
    const { event, isOwner } = await resolveEventForView(clientId, eventId);
    const [rows, cats, venue] = await Promise.all([rowsFor(event.id), categories(), isOwner ? locate(event) : venueOf(event)]);
    const places = rows.map(present).filter((p) => isOwner || p.show_in_app);
    const visible = places.filter((p) => p.show_in_app).length;
    return {
        places,
        categories: publicCategories(cats),
        venue,
        ...(isOwner ? {
            counts: { total: places.length, visible, hidden: places.length - visible },
            options: { radii_km: RADII_KM, default_radius_km: DEFAULT_RADIUS_KM, sorts: SORTS },
        } : {}),
        can_edit: isOwner,
    };
};

// ── Google ──────────────────────────────────────────────────────────────────

const FIELDS = [
    'places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress', 'places.location',
    'places.rating', 'places.userRatingCount', 'places.googleMapsUri', 'places.types', 'places.photos',
].join(',');

const googleError = (e, what) => {
    const g = e.response?.data?.error;
    logger.error(`[nearby-places] Google ${what}: ${g?.status || e.code} ${g?.message || e.message}`);
    const disabled = (g?.details || []).some((d) => d.reason === 'SERVICE_DISABLED');
    return new ApiError(503, disabled
        ? 'Google Places is not turned on for this app yet. Please try again later.'
        : 'We couldn\'t load Google Maps suggestions right now. Please try again.');
};

const googlePost = async (path, body, what) => {
    try {
        const res = await axios.post(`https://places.googleapis.com/v1/${path}`, body, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey(), 'X-Goog-FieldMask': FIELDS },
        });
        return res.data?.places || [];
    } catch (e) {
        throw googleError(e, what);
    }
};

/**
 * A public photo URL for a Google photo (`skipHttpRedirect` returns the googleusercontent URL as
 * JSON — that URL carries no key, so the browser may load it). Null on any failure: a place without
 * a photo is still a place.
 */
const photoUri = async (photoName) => {
    if (!photoName) return null;
    try {
        const res = await axios.get(`https://places.googleapis.com/v1/${photoName}/media`, {
            timeout: 10000,
            params: { maxWidthPx: 400, skipHttpRedirect: true, key: apiKey() },
        });
        return res.data?.photoUri || null;
    } catch (_) {
        return null;
    }
};

/** The tile a Google place belongs to: the first category whose types it has, else the searched one. */
const categoryFor = (types, cats, fallback) => {
    const set = new Set(types || []);
    return cats.find((c) => c.types.some((t) => set.has(t)))?.key || fallback || 'other';
};

/**
 * GET /events/:id/nearby-places/suggestions — Google Maps suggestions around the venue.
 *   ?categories=hotel,restaurant   tiles to search (Nearby Search, one call per tile)
 *   ?q=text                         typed search (Text Search near the venue) — wins over tiles
 *   ?radius_km=2  ?sort=distance|rating|name
 */
const suggestions = async (clientId, eventId, query = {}) => {
    const event = await resolveEvent(clientId, eventId);
    if (!apiKey()) throw new ApiError(503, 'Google Maps suggestions are not set up on the server yet.');
    const venue = await locate(event);
    if (!venue.has_location) throw ApiError.badRequest('We could not find the event location. Please set the venue pin on the map (Venue).');

    const cats = await categories();
    const radius = RADII_KM.includes(Number(query.radius_km)) ? Number(query.radius_km) : DEFAULT_RADIUS_KM;
    const sort = SORTS.includes(query.sort) ? query.sort : 'distance';
    const q = clean(query.q, 100);
    const wanted = String(query.categories || '').split(',').map((k) => k.trim())
        .map((k) => cats.find((c) => c.key === k)).filter((c) => c && c.types.length);
    if (!q && !wanted.length) return { suggestions: [], radius_km: radius, sort, venue };

    const key = [venue.lat.toFixed(5), venue.lng.toFixed(5), radius, q || '', wanted.map((c) => c.key).sort().join(',')].join('|');
    const found = await suggestionCache.wrap(key, async () => {
        const circle = { center: { latitude: venue.lat, longitude: venue.lng }, radius: radius * 1000 };
        let raw;
        if (q) {
            const places = await googlePost('places:searchText', {
                textQuery: q, maxResultCount: MAX_SUGGESTIONS, locationBias: { circle },
            }, 'text search');
            raw = places.map((p) => ({ p, fallback: null }));
        } else {
            const lists = await Promise.all(wanted.map((c) => googlePost('places:searchNearby', {
                includedTypes: c.types, maxResultCount: PER_CATEGORY, rankPreference: 'DISTANCE', locationRestriction: { circle },
            }, `nearby ${c.key}`).then((places) => places.map((p) => ({ p, fallback: c.key })))));
            raw = lists.flat();
        }
        const seen = new Set();
        const out = [];
        for (const { p, fallback } of raw) {
            const lat = p.location?.latitude;
            const lng = p.location?.longitude;
            if (!p.id || seen.has(p.id) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            const distance = distanceKm(venue.lat, venue.lng, lat, lng);
            if (distance > radius) continue;
            seen.add(p.id);
            out.push({
                google_place_id: p.id,
                name: p.displayName?.text || 'Place',
                category_key: fallback && !q ? fallback : categoryFor(p.types, cats, fallback),
                address: p.shortFormattedAddress || p.formattedAddress || null,
                lat,
                lng,
                distance_km: distance,
                rating: p.rating ?? null,
                rating_count: p.userRatingCount ?? null,
                map_url: p.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${p.id}`,
                photo_name: p.photos?.[0]?.name || null,
            });
        }
        const top = out.sort((a, b) => a.distance_km - b.distance_km).slice(0, MAX_SUGGESTIONS);
        const photos = await Promise.all(top.map((s) => photoUri(s.photo_name)));
        return top.map(({ photo_name: _drop, ...s }, i) => ({ ...s, photo_uri: photos[i] }));
    });

    const saved = new Set((await EventNearbyPlace.findAll({
        where: { event_id: event.id }, attributes: ['google_place_id'], raw: true,
    })).map((r) => r.google_place_id).filter(Boolean));
    const list = found.map((s) => ({ ...s, already_added: saved.has(s.google_place_id) }));
    if (sort === 'rating') list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.distance_km - b.distance_km);
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => a.distance_km - b.distance_km);
    return { suggestions: list, radius_km: radius, sort, venue };
};

/** Copy a Google photo into our storage (its URL expires). Null when it cannot be copied. */
const copyPhoto = async (uri, event, companyId) => {
    if (!uri) return null;
    let host;
    try { host = new URL(uri).hostname; } catch (_) { return null; }
    if (!PHOTO_HOST.test(host)) return null;
    try {
        const res = await axios.get(uri, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: MAX_PHOTO_BYTES });
        const mimetype = String(res.headers['content-type'] || 'image/jpeg').split(';')[0];
        if (!mimetype.startsWith('image/')) return null;
        const buffer = Buffer.from(res.data);
        const ext = mimetype.includes('png') ? 'png' : mimetype.includes('webp') ? 'webp' : 'jpg';
        const stored = await mediaService.upload(
            { buffer, size: buffer.length, mimetype, originalname: `place.${ext}` },
            { folder: `event-nearby/${event.id}` },
            companyId,
        );
        return stored?.url || null;
    } catch (e) {
        logger.error(`[nearby-places] photo copy failed: ${e.message}`);
        return null;
    }
};

/** POST /events/:id/nearby-places — Save Nearby Places: `places` = the chosen suggestions. */
const add = async (clientId, eventId, body = {}) => {
    const event = await resolveEvent(clientId, eventId);
    const items = Array.isArray(body.places) ? body.places : [];
    if (!items.length) throw ApiError.badRequest('Please choose at least one place.');
    if (items.length > MAX_SAVE) throw ApiError.badRequest(`You can add up to ${MAX_SAVE} places at a time.`);
    const cats = await categories();
    const venue = await locate(event);
    const existing = new Set((await EventNearbyPlace.findAll({
        where: { event_id: event.id }, attributes: ['google_place_id'], raw: true,
    })).map((r) => r.google_place_id).filter(Boolean));

    const clean1 = [];
    for (const it of items) {
        const name = clean(it?.name, 150);
        if (!name) throw ApiError.badRequest('Every place needs a name.');
        const googleId = clean(it.google_place_id, 255);
        if (googleId && (existing.has(googleId) || clean1.some((c) => c.google_place_id === googleId))) continue;
        const category = cats.some((c) => c.key === it.category_key) ? it.category_key : 'other';
        const lat = num(it.lat);
        const lng = num(it.lng);
        const okPoint = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
        const mapUrl = clean(it.map_url, 500);
        clean1.push({
            google_place_id: googleId,
            name,
            description: clean(it.description, 200),
            category_key: category,
            address: clean(it.address, 300),
            lat: okPoint ? lat : null,
            lng: okPoint ? lng : null,
            distance_km: okPoint && venue.has_location ? distanceKm(venue.lat, venue.lng, lat, lng) : null,
            rating: num(it.rating) !== null ? Math.min(5, Math.max(0, Math.round(num(it.rating) * 10) / 10)) : null,
            rating_count: num(it.rating_count) !== null ? Math.max(0, Math.floor(num(it.rating_count))) : null,
            map_url: mapUrl && /^https:\/\//i.test(mapUrl) ? mapUrl : null,
            photo_uri: clean(it.photo_uri, 2000),
        });
    }
    if (!clean1.length) return { added: 0, places: (await rowsFor(event.id)).map(present) };

    const client = await WebsiteClient.findByPk(clientId, { attributes: ['company_id'] });
    const companyId = event.company_id || client?.company_id || 1;
    const photos = await Promise.all(clean1.map((c) => copyPhoto(c.photo_uri, event, companyId)));
    const last = await EventNearbyPlace.max('sort_order', { where: { event_id: event.id } });
    let next = Number.isFinite(Number(last)) ? Number(last) + 1 : 0;
    await EventNearbyPlace.bulkCreate(clean1.map(({ photo_uri: _u, ...c }, i) => ({
        ...c,
        photo_url: photos[i],
        event_id: event.id,
        website_client_id: clientId,
        show_in_app: true,
        sort_order: next++,
        company_id: event.company_id ?? null,
    })), { ignoreDuplicates: true });
    return { added: clean1.length, places: (await rowsFor(event.id)).map(present) };
};

/** PUT /nearby-places/:id — name, short line, category, Show in app. Only the fields SENT change. */
const update = async (clientId, id, body = {}) => {
    const row = await resolveRow(clientId, id);
    if (has(body, 'name')) {
        const name = clean(body.name, 150);
        if (!name) throw ApiError.badRequest('Please fill all mandatory fields.');
        row.name = name;
    }
    if (has(body, 'description')) row.description = clean(body.description, 200);
    if (has(body, 'category_key')) {
        if (!(await categories()).some((c) => c.key === body.category_key)) throw ApiError.badRequest('Please choose a category.');
        row.category_key = body.category_key;
    }
    if (has(body, 'show_in_app')) row.show_in_app = bool(body.show_in_app);
    await row.save();
    return present(row);
};

const remove = async (clientId, id) => {
    const row = await resolveRow(clientId, id);
    const { photo_url: photo, company_id: companyId } = row;
    await row.destroy();
    await dropFile(photo, companyId);
    return { removed: true };
};

/** PUT /events/:id/nearby-places/reorder — `ids` in the new order; the rest keep theirs after. */
const reorder = async (clientId, eventId, body = {}) => {
    const event = await resolveEvent(clientId, eventId);
    if (!Array.isArray(body.ids)) throw ApiError.badRequest('Invalid order.');
    const rows = await EventNearbyPlace.findAll({ where: { event_id: event.id }, order: ORDER, attributes: ['id'] });
    const known = new Set(rows.map((r) => r.id));
    const sent = [...new Set(body.ids.map(Number))].filter((i) => known.has(i));
    const ids = [...sent, ...rows.map((r) => r.id).filter((i) => !sent.includes(i))];
    if (ids.length) {
        await EventNearbyPlace.sequelize.query(
            `UPDATE event_nearby_places SET sort_order = CASE id ${ids.map((i, n) => `WHEN ${Number(i)} THEN ${n}`).join(' ')} END
             WHERE event_id = ? AND id IN (${ids.map(Number).join(',')})`,
            { replacements: [event.id] },
        );
    }
    return { places: (await rowsFor(event.id)).map(present) };
};

/** A deleted event's place photos leave storage, then its rows go. */
const purgeEvent = async (eventId) => {
    const rows = await EventNearbyPlace.findAll({ where: { event_id: eventId }, attributes: ['photo_url', 'company_id'], raw: true });
    for (let i = 0; i < rows.length; i += 5) {
        await Promise.all(rows.slice(i, i + 5).map((r) => dropFile(r.photo_url, r.company_id)));
    }
    await EventNearbyPlace.destroy({ where: { event_id: eventId } });
};

module.exports = {
    list, suggestions, add, update, remove, reorder, purgeEvent,
    // For tests.
    _internal: { locate },
};
