const {
    Event, EventParticipant, EventDownload, DownloadCategory, WebsiteClient,
} = require('../models');
const ApiError = require('../utils/apiError');
const mediaService = require('./media.service');
const { TtlCache } = require('../utils/ttlCache');

/**
 * Downloads (2026-11-10, Jamal's web design) — files the host shares for participants to download in
 * the event app.
 *
 * Writing is host-only (an event's organizer works as the host through eventOrganizerAccess). A
 * participant sees a file when it is switched on (Show in participant app), not past its expiry date,
 * and meant for them (visibility all / bride side / groom side). `download_access = confirmed` lets
 * only participants who answered RSVP Yes open the file — others see it locked, without its URL.
 *
 * Categories come from the `download_categories` table (not hard-coded); the file itself is uploaded
 * first (POST …/downloads/file) and its URL is then saved with the download.
 */

const MENU_SLUG = 'downloads';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Extension → the types the upload accepts (the design: PDF, DOCX, XLSX, JPG, PNG, ZIP, MP4). */
const FILE_TYPES = {
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    xls: ['application/vnd.ms-excel'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ppt: ['application/vnd.ms-powerpoint'],
    pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    zip: ['application/zip', 'application/x-zip-compressed', 'application/x-zip'],
    mp4: ['video/mp4'],
};
const VISIBILITY = ['all', 'bride', 'groom'];
const ACCESS = ['all', 'confirmed'];
const MEDIA_URL = /^(https?:\/\/|\/uploads\/)/i;
const ORDER = [['sort_order', 'ASC'], ['id', 'DESC']];
const EVENT_ATTRS = ['id', 'company_id', 'website_client_id', 'menu_ids'];

const FALLBACK_CATEGORIES = [
    ['invitation', 'Invitation', '#DB2777'], ['travel', 'Travel', '#7C3AED'], ['stay', 'Stay', '#2563EB'],
    ['agenda', 'Agenda', '#EA580C'], ['info', 'Info', '#4F46E5'], ['other', 'Other', '#6B7280'],
].map(([key, name, color]) => ({ key, name, color }));

const clean = (raw, max) => {
    const s = typeof raw === 'string' ? raw.trim() : '';
    return s ? s.slice(0, max) : null;
};
const has = (body, f) => Object.prototype.hasOwnProperty.call(body, f);
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const extOf = (name) => (String(name || '').split('.').pop() || '').toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

const dropFile = (url, companyId) => (url
    ? mediaService.deleteByUrl(url, companyId || 1).catch(() => null)
    : Promise.resolve());

/** Same for every event and changes only when the table is edited — kept a minute. */
const categoryCache = new TtlCache(60 * 1000);
const categories = () => categoryCache.wrap('all', async () => {
    try {
        const rows = await DownloadCategory.findAll({
            where: { is_active: true }, order: [['sort_order', 'ASC'], ['id', 'ASC']], raw: true,
        });
        return rows.map((r) => ({ key: r.category_key, name: r.name, color: r.color || null }));
    } catch (e) {
        const code = e?.original?.code ?? e?.parent?.code;
        if (code === 'ER_NO_SUCH_TABLE') return FALLBACK_CATEGORIES;
        throw e;
    }
});

/** The event, proven to belong to this client (writes). */
const resolveEvent = async (clientId, rawId) => {
    const eventId = Number(rawId);
    if (!eventId) throw ApiError.badRequest('Please choose an event.');
    const event = await Event.findOne({ where: { id: eventId, website_client_id: clientId }, attributes: EVENT_ATTRS });
    if (!event) throw ApiError.notFound('That event is not on your account.');
    return event;
};

/** The event as a VIEWER may see it: the host, or a participant of it (with their side + RSVP). */
const resolveEventForView = async (clientId, rawId) => {
    const eventId = Number(rawId);
    if (!eventId) throw ApiError.badRequest('Please choose an event.');
    const [event, membership] = await Promise.all([
        Event.findByPk(eventId, { attributes: EVENT_ATTRS }),
        EventParticipant.findOne({
            where: { event_id: eventId, participant_client_id: clientId, is_blocked: false },
            attributes: ['id', 'rsvp_side', 'response_type'],
        }),
    ]);
    if (!event) throw ApiError.notFound('That event was not found.');
    if (Number(event.website_client_id) === Number(clientId)) return { event, isOwner: true, member: null };
    if (!membership) throw ApiError.notFound('That event is not on your account.');
    return { event, isOwner: false, member: membership };
};

const resolveRow = async (clientId, id) => {
    const row = await EventDownload.findOne({ where: { id: Number(id) || 0, website_client_id: clientId } });
    if (!row) throw ApiError.notFound('That download was not found.');
    return row;
};

/** Can this participant see the file at all? */
const seenBy = (r, member) => (r.show_in_app === true || r.show_in_app === 1)
    && (!r.expires_at || String(r.expires_at).slice(0, 10) >= today())
    && (r.visibility === 'all' || r.visibility === member?.rsvp_side);

/** May they open it? */
const openBy = (r, member) => r.download_access !== 'confirmed' || member?.response_type === 'yes';

const present = (row, { isOwner = true, member = null } = {}) => {
    const r = row.toJSON ? row.toJSON() : row;
    const canDownload = isOwner || openBy(r, member);
    const expired = !!r.expires_at && String(r.expires_at).slice(0, 10) < today();
    return {
        id: r.id,
        event_id: r.event_id,
        title: r.title,
        category_key: r.category_key,
        /** Null for a participant who may not open it (download_access = confirmed). */
        file_url: canDownload ? r.file_url : null,
        file_name: r.file_name,
        file_type: r.file_type,
        file_size: Number(r.file_size) || 0,
        description: r.description || null,
        visibility: r.visibility,
        download_access: r.download_access,
        expires_at: r.expires_at || null,
        expired,
        show_in_app: r.show_in_app === true || r.show_in_app === 1,
        can_download: canDownload,
        ...(isOwner ? { download_count: Number(r.download_count) || 0 } : {}),
        sort_order: r.sort_order,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
};

/** Host: every file + totals. Participant: the files meant for them. */
const list = async (clientId, eventId) => {
    const { event, isOwner, member } = await resolveEventForView(clientId, eventId);
    const [rows, cats] = await Promise.all([
        EventDownload.findAll({ where: { event_id: event.id }, order: ORDER }),
        categories(),
    ]);
    const mine = isOwner ? rows : rows.filter((r) => seenBy(r, member));
    const downloads = mine.map((r) => present(r, { isOwner, member }));
    const visible = downloads.filter((d) => d.show_in_app && !d.expired).length;
    return {
        downloads,
        categories: cats,
        ...(isOwner ? {
            counts: {
                total: downloads.length,
                visible,
                hidden: downloads.length - visible,
                downloads: downloads.reduce((n, d) => n + (d.download_count || 0), 0),
            },
        } : {}),
        menu_slug: MENU_SLUG,
        max_file_bytes: MAX_FILE_BYTES,
        file_types: Object.keys(FILE_TYPES),
        can_edit: isOwner,
    };
};

const getOne = async (clientId, id) => {
    const row = await EventDownload.findByPk(Number(id) || 0);
    if (!row) throw ApiError.notFound('That download was not found.');
    const { isOwner, member } = await resolveEventForView(clientId, row.event_id);
    if (!isOwner && !seenBy(row, member)) throw ApiError.notFound('That download was not found.');
    return { download: present(row, { isOwner, member }), can_edit: isOwner };
};

/** The uploaded file's fields, checked: the URL must be ours, the type one we accept. */
const fileFields = (body) => {
    const url = clean(body.file_url, 500);
    const name = clean(body.file_name, 255);
    if (!url || !name) throw ApiError.badRequest('Please upload a file.');
    if (!MEDIA_URL.test(url)) throw ApiError.badRequest('Invalid file.');
    const ext = extOf(name);
    if (!FILE_TYPES[ext]) throw ApiError.badRequest('That file type is not supported.');
    const size = Math.max(0, Math.floor(Number(body.file_size) || 0));
    return { file_url: url, file_name: name, file_type: ext === 'jpeg' ? 'JPG' : ext.toUpperCase(), file_size: size };
};

const checkCategory = async (raw) => {
    const key = clean(raw, 30);
    if (!key) throw ApiError.badRequest('Please choose a category.');
    if (!(await categories()).some((c) => c.key === key)) throw ApiError.badRequest('Please choose a category.');
    return key;
};

const checkDate = (raw) => {
    if (raw === null || raw === undefined || raw === '') return null;
    const s = String(raw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw ApiError.badRequest('Please choose a valid expiry date.');
    return s;
};

const pickOne = (raw, allowed, fallback) => {
    const v = clean(raw, 20);
    if (!v) return fallback;
    if (!allowed.includes(v)) throw ApiError.badRequest('Invalid option.');
    return v;
};

const create = async (clientId, eventId, body = {}) => {
    const event = await resolveEvent(clientId, eventId);
    const title = clean(body.title, 150);
    if (!title) throw ApiError.badRequest('Please fill all mandatory fields.');
    const category = await checkCategory(body.category_key);
    const file = fileFields(body);
    const first = await EventDownload.min('sort_order', { where: { event_id: event.id } });
    const row = await EventDownload.create({
        event_id: event.id,
        website_client_id: clientId,
        title,
        category_key: category,
        ...file,
        description: clean(body.description, 500),
        visibility: pickOne(body.visibility, VISIBILITY, 'all'),
        download_access: pickOne(body.download_access, ACCESS, 'all'),
        expires_at: checkDate(body.expires_at),
        show_in_app: has(body, 'show_in_app') ? bool(body.show_in_app) : true,
        // Newest on top.
        sort_order: Number.isFinite(Number(first)) ? Number(first) - 1 : 0,
        company_id: event.company_id ?? null,
    });
    return present(row);
};

/** Only the fields SENT change. A new file replaces the old one (the old one leaves storage). */
const update = async (clientId, id, body = {}) => {
    const row = await resolveRow(clientId, id);
    if (has(body, 'title')) {
        const title = clean(body.title, 150);
        if (!title) throw ApiError.badRequest('Please fill all mandatory fields.');
        row.title = title;
    }
    if (has(body, 'category_key')) row.category_key = await checkCategory(body.category_key);
    let oldFile = null;
    if (has(body, 'file_url')) {
        const file = fileFields(body);
        if (file.file_url !== row.file_url) oldFile = row.file_url;
        Object.assign(row, file);
    }
    if (has(body, 'description')) row.description = clean(body.description, 500);
    if (has(body, 'visibility')) row.visibility = pickOne(body.visibility, VISIBILITY, 'all');
    if (has(body, 'download_access')) row.download_access = pickOne(body.download_access, ACCESS, 'all');
    if (has(body, 'expires_at')) row.expires_at = checkDate(body.expires_at);
    if (has(body, 'show_in_app')) row.show_in_app = bool(body.show_in_app);
    await row.save();
    if (oldFile) await dropFile(oldFile, row.company_id);
    return present(row);
};

const remove = async (clientId, id) => {
    const row = await resolveRow(clientId, id);
    const { file_url: url, company_id: companyId } = row;
    await row.destroy();
    await dropFile(url, companyId);
    return { removed: true };
};

/**
 * A participant downloads the file: +1 on its count, and the URL back. The host's own opens are not
 * counted. Refused when the file is not meant for them or they may not open it.
 */
const hit = async (clientId, id) => {
    const row = await EventDownload.findByPk(Number(id) || 0);
    if (!row) throw ApiError.notFound('That download was not found.');
    const { isOwner, member } = await resolveEventForView(clientId, row.event_id);
    if (!isOwner) {
        if (!seenBy(row, member)) throw ApiError.notFound('That download was not found.');
        if (!openBy(row, member)) throw ApiError.forbidden('Only guests who confirmed their RSVP can download this file.');
        await EventDownload.increment('download_count', { by: 1, where: { id: row.id } });
    }
    return { url: row.file_url, file_name: row.file_name, counted: !isOwner };
};

/** Store an uploaded file (25 MB, the FILE_TYPES list). Returns what the download row needs. */
const uploadFile = async (clientId, eventId, file) => {
    if (!file || !file.buffer) throw ApiError.badRequest('Please choose a file to upload.');
    const event = await resolveEvent(clientId, eventId);
    const ext = extOf(file.originalname);
    if (!FILE_TYPES[ext]) throw ApiError.badRequest('That file type is not supported.');
    const client = await WebsiteClient.findByPk(clientId, { attributes: ['company_id'] });
    const stored = await mediaService.upload(file, { folder: `event-downloads/${event.id}` }, event.company_id || client?.company_id || 1);
    if (!stored || !stored.url) throw ApiError.badRequest('That file could not be stored.');
    return {
        url: stored.url,
        file_name: String(file.originalname).slice(0, 255),
        file_type: ext === 'jpeg' ? 'JPG' : ext.toUpperCase(),
        file_size: file.size || file.buffer.length,
    };
};

/** A deleted event's files leave storage, then its rows go. */
const purgeEvent = async (eventId) => {
    const rows = await EventDownload.findAll({ where: { event_id: eventId }, attributes: ['file_url', 'company_id'], raw: true });
    for (let i = 0; i < rows.length; i += 5) {
        await Promise.all(rows.slice(i, i + 5).map((r) => dropFile(r.file_url, r.company_id)));
    }
    await EventDownload.destroy({ where: { event_id: eventId } });
};

/** multer's filter: the extension decides (browsers send odd MIME types for Office files). */
const acceptsFile = (originalname) => !!FILE_TYPES[extOf(originalname)];

module.exports = {
    MAX_FILE_BYTES,
    acceptsFile,
    list,
    getOne,
    create,
    update,
    remove,
    hit,
    uploadFile,
    purgeEvent,
};
