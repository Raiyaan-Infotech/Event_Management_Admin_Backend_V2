/**
 * Gallery → Media (Jamal, 2026-11-07).
 *
 *   1. event_menus: the "Gallery" menu (slug gallery / gallery-N) is named "Media" — the app's tile
 *      and the portal read this name. The slug stays `gallery`, so routes and plan links are untouched.
 *   2. event_gallery_categories: every event's built-in default folder "Gallery" becomes "Media"
 *      (new events get "Media" from clientGallery.service DEFAULT_CATEGORY_NAME).
 *
 * Only rows still called exactly "Gallery" change, so a name a host or admin chose is kept and a
 * re-run is a no-op.
 *
 *   node src/database/tools/apply-media-rename.js                  local, dry run
 *   node src/database/tools/apply-media-rename.js --apply          local
 *   node src/database/tools/apply-media-rename.js --prod --apply   production
 */
require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');

const PROD = process.argv.includes('--prod');
const APPLY = process.argv.includes('--apply');
const target = PROD ? 'production' : 'local';

const parseEnv = (file) => {
    const out = {};
    if (!fs.existsSync(file)) return out;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
};

(async () => {
    const env = PROD
        ? parseEnv('.env.production')
        : {
            DB_HOST: process.env.DB_HOST, DB_PORT: process.env.DB_PORT, DB_USER: process.env.DB_USER,
            DB_PASSWORD: process.env.DB_PASS ?? process.env.DB_PASSWORD, DB_NAME: process.env.DB_NAME, DB_SSL: 'false',
        };
    const conn = await mysql.createConnection({
        host: env.DB_HOST, port: env.DB_PORT || 3306, user: env.DB_USER,
        password: env.DB_PASSWORD, database: env.DB_NAME,
        ssl: env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    });
    const q = async (sql, params) => (await conn.query(sql, params))[0];
    const say = (msg) => console.log(`[${target} ${env.DB_NAME}${APPLY ? '' : ' · dry run'}] ${msg}`);

    const MENU_WHERE = "name = 'Gallery' AND (slug = 'gallery' OR slug LIKE 'gallery-%') AND deleted_at IS NULL";
    const FOLDER_WHERE = "name = 'Gallery' AND is_default = 1 AND deleted_at IS NULL";

    const menus = await q(`SELECT id, slug FROM event_menus WHERE ${MENU_WHERE}`);
    say(`event_menus to rename: ${menus.length} (${menus.map((m) => `#${m.id} ${m.slug}`).join(', ') || 'none'})`);
    const [{ n: folders }] = await q(`SELECT COUNT(*) n FROM event_gallery_categories WHERE ${FOLDER_WHERE}`);
    say(`default folders to rename: ${folders}`);
    // An event that already has its own "Media" folder would end up with two of that name — reported, not blocked.
    const [{ n: clash }] = await q(
        `SELECT COUNT(*) n FROM event_gallery_categories d
           JOIN event_gallery_categories o ON o.event_id = d.event_id AND o.id <> d.id AND o.name = 'Media' AND o.deleted_at IS NULL
          WHERE d.name = 'Gallery' AND d.is_default = 1 AND d.deleted_at IS NULL`);
    if (clash) say(`note: ${clash} event(s) already have a folder called "Media" — they will show two.`);

    if (APPLY) {
        const a = await q(`UPDATE event_menus SET name = 'Media' WHERE ${MENU_WHERE}`);
        const b = await q(`UPDATE event_gallery_categories SET name = 'Media' WHERE ${FOLDER_WHERE}`);
        say(`renamed menus: ${a.affectedRows}, folders: ${b.affectedRows}`);
    } else {
        say('nothing changed — add --apply to rename.');
    }
    await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
