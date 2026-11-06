const fs = require('fs');
const path = require('path');
const { EventGalleryItem } = require('../models');
const ApiError = require('../utils/apiError');
const galleryService = require('./clientGallery.service');
const { renderEdit, EDIT_FONTS } = require('../utils/videoProcess');

/**
 * EDIT VIDEO / SHORTS — web gallery design 03 (Jamal, 2026-11-06).
 *
 * OFF until the backend runs on a paid server: the route is mounted only when
 * VIDEO_EDITOR_ENABLED=true (clientPortal.routes.js), and the portal shows the
 * editor only when NEXT_PUBLIC_VIDEO_EDITOR_ENABLED=true. See session.md 8g.
 *
 * Export = the host's edit (trim, text layers with animation, music, volumes)
 * rendered by ffmpeg and stored as a NEW gallery file in the same folder,
 * through the normal upload (plan limits, storage, poster, folder type). The
 * original is kept.
 */

const ANIMATIONS = ['fade', 'slide', 'zoom', 'typewriter'];
const DIRECTIONS = ['in', 'out', 'in_out', 'left', 'right', 'up', 'down'];
const num = (v, min, max, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
};

/** The stored file's bytes: the local uploads folder, else its public URL (S3-type drivers). */
const readStored = async (url) => {
    const local = String(url || '').match(/\/uploads\/(.+)$/);
    if (local) {
        const rel = decodeURIComponent(local[1].split('?')[0]);
        const full = path.join(__dirname, '../../uploads', rel);
        if (!rel.includes('..') && fs.existsSync(full)) return fs.readFileSync(full);
    }
    if (/^https?:\/\//i.test(url || '')) {
        const res = await fetch(url);
        if (!res.ok) throw ApiError.badRequest('The original video could not be read.');
        return Buffer.from(await res.arrayBuffer());
    }
    throw ApiError.badRequest('The original video could not be read.');
};

/** The edit the portal sent, cleaned (unknown values -> defaults). */
const cleanSpec = (raw) => {
    let s = raw;
    if (typeof raw === 'string') {
        try { s = JSON.parse(raw); } catch (_) { throw ApiError.badRequest('Invalid edit.'); }
    }
    s = s && typeof s === 'object' ? s : {};
    const texts = (Array.isArray(s.texts) ? s.texts : []).slice(0, 10).map((t) => ({
        text: typeof t?.text === 'string' ? t.text.slice(0, 100) : '',
        animation: ANIMATIONS.includes(t?.animation) ? t.animation : 'fade',
        duration: num(t?.duration, 0.2, 3, 1),
        direction: DIRECTIONS.includes(t?.direction) ? t.direction : 'in',
        font: EDIT_FONTS.includes(t?.font) ? t.font : 'Poppins',
        color: /^#[0-9a-f]{6}$/i.test(t?.color || '') ? t.color : '#FFFFFF',
        bold: !!t?.bold, italic: !!t?.italic, underline: !!t?.underline,
        position: Number.isInteger(t?.position) && t.position >= 0 && t.position <= 8 ? t.position : 4,
        from: num(t?.from, 0, 3600, 0),
        to: num(t?.to, 0, 3600, 0),
    })).filter((t) => t.text.trim());
    return {
        trim: { start: num(s.trim?.start, 0, 36000, 0), end: num(s.trim?.end, 0, 36000, 0) },
        mute: !!s.mute,
        video_volume: num(s.video_volume, 0, 2, 1),
        music_volume: num(s.music_volume, 0, 2, 0.8),
        music_start: num(s.music_start, 0, 3600, 0),
        texts,
    };
};

const exportEdit = async (clientId, itemId, body = {}, musicFile = null) => {
    const item = await EventGalleryItem.findOne({ where: { id: Number(itemId) || 0, website_client_id: clientId } });
    if (!item) throw ApiError.notFound('That gallery item was not found.');
    if (item.type !== 'video') throw ApiError.badRequest('Only a video or a short can be edited.');
    if (musicFile && Number(musicFile.size || 0) > galleryService.MAX_MUSIC_BYTES) {
        throw ApiError.badRequest(`The music must be ${Math.round(galleryService.MAX_MUSIC_BYTES / (1024 * 1024))}MB or smaller.`);
    }

    const spec = cleanSpec(body.spec ?? body);
    const isShort = item.is_short === true || item.is_short === 1;
    if (isShort && spec.trim.end - spec.trim.start > 60.5) throw ApiError.badRequest('A short can be up to 1 minute. Please trim it shorter.');

    const source = await readStored(item.url);
    let out;
    try {
        out = await renderEdit(source, {
            ...spec,
            max_bytes: isShort ? galleryService.MAX_SHORT_BYTES : galleryService.MAX_VIDEO_BYTES,
        }, musicFile?.buffer || null);
    } catch (e) {
        throw ApiError.badRequest(`This video could not be exported. ${e.message}`);
    }

    const base = (item.file_name || item.title || 'video').replace(/\.[^.]+$/, '');
    const file = { buffer: out.buffer, mimetype: out.mimetype, size: out.buffer.length, originalname: `${base}-edited.mp4` };
    // The normal upload: plan counts, storage, folder type, poster — as a short when the original was one.
    return galleryService.uploadItem(clientId, item.event_id, file, {
        category_id: item.category_id || undefined,
        title: (typeof body.title === 'string' && body.title.trim()) || item.title || (isShort ? `${base} (edited)` : ''),
        description: item.description || '',
    }, { music: null, cover: null, asVideo: !isShort });
};

module.exports = { exportEdit, cleanSpec };
