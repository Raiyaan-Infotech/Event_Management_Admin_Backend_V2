const { sequelize, Sequelize, Event, EventDownloadLog } = require('../models');
const ApiError = require('../utils/apiError');
const { relationOf } = require('./clientQrScan.service');

const { QueryTypes } = Sequelize;

/**
 * FILES DOWNLOADED — client portal → event → QR Code → File Downloads (Jamal's design, 2026-11-16).
 *
 * A LIST of what happened: the organizer uploads files in Downloads (event_downloads); each time a
 * participant downloads one in the app, clientDownload.hit writes ONE row here (event_download_logs).
 * The portal only reads it, plus Remove Participant (drops that person's rows from this list).
 * Block Participant is the Participants module's own block.
 *
 * Routes are /events/:id/download-logs…, so eventOrganizerAccess has already made an organizer or
 * contact person act as the event's owner (as Event Attendance).
 */

const ownEvent = async (req, eventId) => {
    const event = await Event.findOne({
        where: { id: Number(eventId) || 0, website_client_id: req.websiteClient.id },
        attributes: ['id', 'name'],
    });
    if (!event) throw ApiError.notFound('Event not found.');
    return event;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** WHERE for the list — the event, and the filters asked. Returns [sql, replacements]. */
const filterSql = (eventId, q = {}) => {
    const parts = ['l.event_id = :eventId'];
    const r = { eventId };
    const search = String(q.search || '').trim();
    if (search) {
        parts.push('(p.name LIKE :s OR p.email LIKE :s OR p.mobile LIKE :s OR d.file_name LIKE :s OR d.title LIKE :s)');
        r.s = `%${search}%`;
    }
    if (DAY.test(String(q.from || ''))) { parts.push('l.downloaded_at >= :from'); r.from = `${q.from} 00:00:00`; }
    if (DAY.test(String(q.to || ''))) { parts.push('l.downloaded_at <= :to'); r.to = `${q.to} 23:59:59`; }
    const type = String(q.file_type || '').toLowerCase();
    if (type && type !== 'all') { parts.push('d.file_type = :type'); r.type = type; }
    const status = String(q.status || '');
    if (status === 'completed' || status === 'failed') { parts.push('l.status = :status'); r.status = status; }
    const rel = String(q.relationship || '').trim();
    if (rel && rel !== 'all') { parts.push('p.relationship = :rel'); r.rel = rel; }
    return [parts.join(' AND '), r];
};

const FROM = `FROM event_download_logs l
    JOIN event_downloads d ON d.id = l.download_id
    LEFT JOIN event_participants p ON p.id = l.participant_id AND p.deleted_at IS NULL
    LEFT JOIN website_clients c ON c.id = l.participant_client_id`;

const presentRow = (x) => ({
    id: x.id,
    downloaded_at: x.downloaded_at,
    status: x.status,
    failed_reason: x.failed_reason,
    device: x.device,
    platform: x.platform,
    source: x.source,
    file: { id: x.download_id, title: x.title, file_name: x.file_name, file_type: x.file_type, category_key: x.category_key, file_url: x.file_url },
    participant: x.participant_id ? {
        id: x.participant_id,
        name: [x.p_title, x.p_name].filter((v) => String(v || '').trim()).join(' ') || x.c_name || 'Participant',
        photo: x.p_photo || x.c_avatar || null,
        dial_code: x.p_dial || x.c_dial || '+91',
        mobile: x.p_mobile || x.c_mobile || null,
        email: x.p_email || x.c_email || null,
        relation: relationOf({ relationship: x.p_relationship, rsvp_side: x.p_side }),
        relationship: x.p_relationship || null,
        is_blocked: !!x.p_blocked,
    } : null,
});

const SELECT = `SELECT l.id, l.downloaded_at, l.status, l.failed_reason, l.device, l.platform, l.source, l.download_id, l.participant_id,
    d.title, d.file_name, d.file_type, d.category_key, d.file_url,
    p.title p_title, p.name p_name, p.photo p_photo, p.dial_code p_dial, p.mobile p_mobile, p.email p_email,
    p.relationship p_relationship, p.rsvp_side p_side, p.is_blocked p_blocked,
    c.name c_name, c.avatar_url c_avatar, c.dial_code c_dial, c.mobile c_mobile, c.email c_email`;

/**
 * GET /client/events/:id/download-logs ?search= &from= &to= &file_type= &status= &relationship= &page= &limit=
 * → { stats, file_types, relationships, rows, pagination }. Stats are for the whole event.
 */
const list = async (req, eventId, q = {}) => {
    const event = await ownEvent(req, eventId);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 10));
    const [where, repl] = filterSql(event.id, q);

    const [rows, [{ n: total }], [stats], top, types, rels] = await Promise.all([
        sequelize.query(`${SELECT} ${FROM} WHERE ${where} ORDER BY l.downloaded_at DESC, l.id DESC LIMIT :limit OFFSET :offset`,
            { replacements: { ...repl, limit, offset: (page - 1) * limit }, type: QueryTypes.SELECT }),
        sequelize.query(`SELECT COUNT(*) n ${FROM} WHERE ${where}`, { replacements: repl, type: QueryTypes.SELECT }),
        sequelize.query(`SELECT COUNT(*) total, COUNT(DISTINCT l.participant_id) people, SUM(l.status = 'failed') failed
            FROM event_download_logs l WHERE l.event_id = :eventId`, { replacements: { eventId: event.id }, type: QueryTypes.SELECT }),
        sequelize.query(`SELECT d.id, d.title, d.file_name, COUNT(*) n FROM event_download_logs l JOIN event_downloads d ON d.id = l.download_id
            WHERE l.event_id = :eventId AND l.status = 'completed' GROUP BY d.id, d.title, d.file_name ORDER BY n DESC, d.id ASC LIMIT 1`,
            { replacements: { eventId: event.id }, type: QueryTypes.SELECT }),
        sequelize.query(`SELECT DISTINCT d.file_type t FROM event_download_logs l JOIN event_downloads d ON d.id = l.download_id
            WHERE l.event_id = :eventId ORDER BY t`, { replacements: { eventId: event.id }, type: QueryTypes.SELECT }),
        sequelize.query(`SELECT DISTINCT p.relationship r FROM event_download_logs l JOIN event_participants p ON p.id = l.participant_id
            WHERE l.event_id = :eventId AND p.relationship IS NOT NULL AND p.relationship <> '' ORDER BY r`,
            { replacements: { eventId: event.id }, type: QueryTypes.SELECT }),
    ]);

    return {
        stats: {
            total_downloads: Number(stats.total) || 0,
            unique_downloaders: Number(stats.people) || 0,
            failed_downloads: Number(stats.failed) || 0,
            most_downloaded: top[0] ? { id: top[0].id, title: top[0].title, file_name: top[0].file_name, downloads: Number(top[0].n) } : null,
        },
        file_types: types.map((t) => t.t).filter(Boolean),
        relationships: rels.map((x) => x.r),
        rows: rows.map(presentRow),
        pagination: { page, limit, totalItems: Number(total) || 0, totalPages: Math.max(1, Math.ceil((Number(total) || 0) / limit)) },
    };
};

/**
 * GET /client/events/:id/download-logs/participants/:participantId → that person's downloads in
 * this event, newest first + a summary (View Details / View Scan History).
 */
const participantHistory = async (req, eventId, participantId) => {
    const event = await ownEvent(req, eventId);
    const rows = await sequelize.query(`${SELECT} ${FROM} WHERE l.event_id = :eventId AND l.participant_id = :pid ORDER BY l.downloaded_at DESC, l.id DESC LIMIT 200`,
        { replacements: { eventId: event.id, pid: Number(participantId) || 0 }, type: QueryTypes.SELECT });
    if (!rows.length) throw ApiError.notFound('No downloads found for this participant.');
    const items = rows.map(presentRow);
    return {
        participant: items[0].participant,
        summary: {
            total: items.length,
            completed: items.filter((i) => i.status === 'completed').length,
            failed: items.filter((i) => i.status === 'failed').length,
            files: new Set(items.map((i) => i.file.id)).size,
            first_at: items[items.length - 1].downloaded_at,
            last_at: items[0].downloaded_at,
        },
        downloads: items,
    };
};

/** DELETE /client/events/:id/download-logs/participants/:participantId — off this list (the person stays a participant). */
const removeParticipant = async (req, eventId, participantId) => {
    const event = await ownEvent(req, eventId);
    const removed = await EventDownloadLog.destroy({ where: { event_id: event.id, participant_id: Number(participantId) || 0 } });
    if (!removed) throw ApiError.notFound('No downloads found for this participant.');
    return { removed };
};

/** "Mobile / Android" from a User-Agent, for the hit. */
const deviceOf = (ua = '') => {
    const s = String(ua);
    const platform = /android/i.test(s) ? 'Android' : /iphone|ipad|ipod/i.test(s) ? 'iOS' : /windows/i.test(s) ? 'Windows'
        : /mac os/i.test(s) ? 'macOS' : /linux/i.test(s) ? 'Linux' : null;
    const device = /ipad|tablet/i.test(s) ? 'tablet' : /mobi|android|iphone|ipod|dart/i.test(s) ? 'mobile' : s ? 'desktop' : null;
    return { device, platform };
};

/**
 * Called by clientDownload.hit when a PARTICIPANT downloads (the host's own opens are not logged).
 * `body.status` = 'failed' (+ `failed_reason`) lets the app report a download that did not finish.
 */
const record = async ({ row, member, clientId, userAgent, body = {} }) => {
    const { device, platform } = deviceOf(userAgent);
    const failed = body.status === 'failed';
    await EventDownloadLog.create({
        event_id: row.event_id,
        download_id: row.id,
        participant_id: member?.id || null,
        participant_client_id: Number(clientId) || null,
        device: ['mobile', 'tablet', 'desktop'].includes(body.device) ? body.device : device,
        platform: String(body.platform || '').trim().slice(0, 40) || platform,
        status: failed ? 'failed' : 'completed',
        failed_reason: failed ? String(body.failed_reason || '').trim().slice(0, 200) || null : null,
        source: 'app',
        downloaded_at: new Date(),
    });
};

module.exports = { list, participantHistory, removeParticipant, record, deviceOf };
