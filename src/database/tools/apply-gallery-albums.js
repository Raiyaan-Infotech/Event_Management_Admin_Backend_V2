#!/usr/bin/env node
/**
 * Gallery albums (2026-11-04): creates event_gallery_albums
 * (src/database/migrations/sql/20261104-gallery-albums.sql). Re-runnable.
 *
 *   node src/database/tools/apply-gallery-albums.js                 dry run, local
 *   node src/database/tools/apply-gallery-albums.js --apply         local
 *   node src/database/tools/apply-gallery-albums.js --prod          dry run, production
 *   node src/database/tools/apply-gallery-albums.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend (the albums routes read the table).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod') || args.includes('prod');

if (PROD) {
    require('dotenv').config({
        path: path.join(__dirname, '..', '..', '..', '.env.production'),
        override: true,
    });
}

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261104-gallery-albums.sql');

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);
    try {
        const [[c]] = await conn.query(
            `SELECT COUNT(*) AS n FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_gallery_albums'`,
            [process.env.DB_NAME],
        );
        console.log(c.n
            ? '  = event_gallery_albums   already there'
            : `  + event_gallery_albums   ${APPLY ? 'creating' : 'WOULD CREATE'}`);
        if (!c.n && APPLY) {
            const sql = fs.readFileSync(SQL_FILE, 'utf8')
                .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
                .split(';').map((s) => s.trim()).filter(Boolean)[0];
            await conn.query(sql);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
});
