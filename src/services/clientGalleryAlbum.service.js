const { Sequelize, Event, EventGalleryAlbum, EventGalleryItem, EventParticipant } = require('../models');
const { Op } = Sequelize;
const ApiError = require('../utils/apiError');
const mediaService = require('./media.service');

/**
 * Gallery ALBUMS — slideshows from the event's gallery photos (Gallery web
 * design "Create Album", 2026-11-04). Host writes; the host and the event's
 * participants read (participants: albums shown in the app only).
 *
 * The album keeps its slides as [{ item_id, seconds }]. On read they are joined
 * to the gallery items, so a photo deleted from the gallery drops out by itself.
 */

const ANIMATIONS = ['fade_slide_up', 'fade', 'zoom', 'typewriter'];
const MEDIA_URL = /^(https?:\/\/|\/uploads\/)/i;
const MAX_SLIDES = 100;
const MUSIC_MIMES = ['audio/mpeg', 'audio/mp3'];
const MAX_MUSIC_BYTES = 10 * 1024 * 1024;

const text = (v, max) => { const t = typeof v === 'string' ? v.trim() : ''; return t ? t.slice(0, max) : null; };
const on = (v) => v === true || v === 1 || v === '1' || v === 'true';
const seconds = (v, fallback) => {
    if (v === undefined || v === null || v === '') return fallback;
    const n = Math.round(Number(v) * 10) / 10;
    if (!Number.isFinite(n) || n < 1 || n > 60) throw ApiError.badRequest('A duration must be between 1 and 60 seconds.');
    return n;
};

const ownEvent = async (clientId, rawId) => {
    const event = await Event.findOne({ where: { id: Number(rawId) || 0, website_client_id: clientId }, attributes: ['id', 'company_id'] });
    if (!event) throw ApiError.notFound('That event is not on your account.');
    return event;
};

/** Host, or a participant (not blocked) of the event. */
const viewer = async (clientId, rawId) => {
    const eventId = Number(rawId) || 0;
    const [event, member] = await Promise.all([
        Event.findByPk(eventId, { attributes: ['id', 'website_client_id'] }),
        EventParticipant.findOne({ where: { event_id: eventId, participant_client_id: clientId, is_blocked: false }, attributes: ['id'] }),
    ]);
    if (!event) throw ApiError.notFound('That event was not found.');
    const isOwner = Number(event.website_client_id) === Number(clientId);
    if (!isOwner && !member) throw ApiError.notFound('That event is not on your account.');
    return { event, isOwner };
};

/** Albums with their slides joined to the gallery photos (gone photos drop out). */
const present = (albums, itemsById) => albums.map((a) => {
    const plain = a.toJSON ? a.toJSON() : a;
    const slideSeconds = Number(plain.slide_seconds) || 5;
    const slides = (Array.isArray(plain.slides) ? plain.slides : [])
        .map((s) => {
            const it = itemsById.get(Number(s.item_id));
            return it ? {
                item_id: it.id, url: it.url, thumbnail_url: it.thumbnail_url, file_name: it.file_name,
                seconds: Number(s.seconds) || slideSeconds,
            } : null;
        })
        .filter(Boolean);
    const intro = plain.intro_enabled ? Number(plain.intro_seconds) || 0 : 0;
    return {
        ...plain,
        intro_seconds: Number(plain.intro_seconds),
        slide_seconds: slideSeconds,
        slides,
        slide_count: slides.length,
        total_seconds: Math.round((intro + slides.reduce((t, s) => t + s.seconds, 0)) * 10) / 10,
        cover_url: plain.cover_image || slides[0]?.thumbnail_url || slides[0]?.url || null,
    };
});

const load = async (eventId, where = {}) => {
    const albums = await EventGalleryAlbum.findAll({ where: { event_id: eventId, ...where }, order: [['sort_order', 'ASC'], ['id', 'ASC']] });
    const ids = [...new Set(albums.flatMap((a) => (Array.isArray(a.slides) ? a.slides : []).map((s) => Number(s.item_id))).filter(Boolean))];
    const items = ids.length
        ? await EventGalleryItem.findAll({ where: { id: { [Op.in]: ids }, event_id: eventId, type: 'image' }, attributes: ['id', 'url', 'thumbnail_url', 'file_name'] })
        : [];
    return present(albums, new Map(items.map((i) => [i.id, i])));
};

const list = async (clientId, eventId) => {
    const { event, isOwner } = await viewer(clientId, eventId);
    return { albums: await load(event.id, isOwner ? {} : { show_in_app: true }), can_edit: isOwner };
};

/** Validate a create / update body into model fields; `current` = update. */
const normalise = async (eventId, body, current = null) => {
    const has = (f) => Object.prototype.hasOwnProperty.call(body, f);
    const data = {};
    if (!current || has('name')) {
        data.name = text(body.name, 150);
        if (!data.name) throw ApiError.badRequest('Please enter the album name.');
    }
    if (has('description')) data.description = text(body.description, 300);
    if (has('cover_image')) {
        const c = text(body.cover_image, 500);
        if (c && !MEDIA_URL.test(c)) throw ApiError.badRequest('Invalid cover image.');
        data.cover_image = c;
    }
    if (has('intro_enabled')) data.intro_enabled = on(body.intro_enabled);
    if (has('intro_text')) data.intro_text = text(body.intro_text, 120);
    if (has('intro_animation')) {
        const a = String(body.intro_animation || '');
        if (!ANIMATIONS.includes(a)) throw ApiError.badRequest('Please choose a valid text animation.');
        data.intro_animation = a;
    }
    if (has('intro_seconds')) data.intro_seconds = seconds(body.intro_seconds, 5);
    if (has('slide_seconds')) data.slide_seconds = seconds(body.slide_seconds, 5);
    if (has('music_enabled')) data.music_enabled = on(body.music_enabled);
    if (has('music_url')) {
        const m = text(body.music_url, 500);
        if (m && !MEDIA_URL.test(m)) throw ApiError.badRequest('Invalid music file.');
        data.music_url = m;
    }
    if (has('music_name')) data.music_name = text(body.music_name, 200);
    if (has('show_in_app')) data.show_in_app = on(body.show_in_app);

    if (!current || has('slides')) {
        if (!Array.isArray(body.slides)) throw ApiError.badRequest('Please add images to the album.');
        if (body.slides.length > MAX_SLIDES) throw ApiError.badRequest(`An album can have up to ${MAX_SLIDES} slides.`);
        const fallback = data.slide_seconds ?? (current ? Number(current.slide_seconds) : 5);
        const slides = body.slides.map((s) => ({ item_id: Number(s?.item_id) || 0, seconds: seconds(s?.seconds, fallback) }));
        const ids = [...new Set(slides.map((s) => s.item_id).filter(Boolean))];
        const found = ids.length
            ? await EventGalleryItem.count({ where: { id: { [Op.in]: ids }, event_id: eventId, type: 'image' } })
            : 0;
        if (found !== ids.length || slides.some((s) => !s.item_id)) throw ApiError.badRequest('Album slides must be photos from this event\'s gallery.');
        data.slides = slides;
    }
    // The design: an album needs a name, a cover and at least one slide; intro text when the intro is on.
    const merged = { ...(current ? current.toJSON() : {}), ...data };
    if (!merged.slides || merged.slides.length === 0) throw ApiError.badRequest('Please add at least one image to the album.');
    if (merged.intro_enabled !== false && merged.intro_enabled !== 0 && !merged.intro_text) {
        throw ApiError.badRequest('Please enter the intro text, or switch the intro off.');
    }
    if ((merged.music_enabled === true || merged.music_enabled === 1) && !merged.music_url) {
        throw ApiError.badRequest('Please upload the background song, or switch the music off.');
    }
    return data;
};

const getOwned = async (clientId, albumId) => {
    const row = await EventGalleryAlbum.findOne({ where: { id: Number(albumId) || 0, website_client_id: clientId } });
    if (!row) throw ApiError.notFound('That album was not found.');
    return row;
};

const one = async (row) => (await load(row.event_id, { id: row.id }))[0];

const create = async (clientId, eventId, body = {}) => {
    const event = await ownEvent(clientId, eventId);
    const data = await normalise(event.id, body);
    const last = await EventGalleryAlbum.max('sort_order', { where: { event_id: event.id } });
    const row = await EventGalleryAlbum.create({
        intro_enabled: true, intro_animation: 'fade_slide_up', intro_seconds: 5, slide_seconds: 5,
        ...data,
        event_id: event.id, website_client_id: clientId, company_id: event.company_id ?? null,
        sort_order: Number.isFinite(Number(last)) ? Number(last) + 1 : 0,
    });
    return one(row);
};

/** A replaced or removed song / cover is deleted from storage, best effort. */
const drop = (url, companyId) => (url ? mediaService.deleteFile(url, companyId || 1).catch(() => null) : null);

const update = async (clientId, albumId, body = {}) => {
    const row = await getOwned(clientId, albumId);
    const before = { music: row.music_url, cover: row.cover_image };
    const data = await normalise(row.event_id, body, row);
    await row.update(data);
    if (before.music && before.music !== row.music_url) await drop(before.music, row.company_id);
    return one(row);
};

const remove = async (clientId, albumId) => {
    const row = await getOwned(clientId, albumId);
    const music = row.music_url;
    await row.destroy();
    await drop(music, row.company_id);
    return { removed: true };
};

/** Store an album's background song (MP3, ≤ 10 MB) and hand back its URL — saved with the album. */
const uploadMusic = async (clientId, eventId, file) => {
    const event = await ownEvent(clientId, eventId);
    if (!file || !file.buffer) throw ApiError.badRequest('Please choose an MP3 file.');
    if (!MUSIC_MIMES.includes(file.mimetype)) throw ApiError.badRequest('Please choose an MP3 file.');
    if (file.size > MAX_MUSIC_BYTES) throw ApiError.badRequest('The song must be 10 MB or smaller.');
    const stored = await mediaService.upload(file, { folder: `gallery/${event.id}/albums` }, event.company_id || 1);
    if (!stored || !stored.url) throw ApiError.badRequest('That song could not be stored.');
    return { url: stored.url, name: file.originalname || 'song.mp3', size: file.size };
};

module.exports = { list, create, update, remove, uploadMusic, MUSIC_MIMES, MAX_MUSIC_BYTES, ANIMATIONS };
