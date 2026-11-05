#!/usr/bin/env node
/**
 * Album intro text style (2026-11-05): adds event_gallery_albums.intro_style
 * (src/database/migrations/sql/20261105-album-intro-style.sql). Re-runnable.
 *
 *   node src/database/tools/apply-album-intro-style.js                 dry run, local
 *   node src/database/tools/apply-album-intro-style.js --apply         local
 *   node src/database/tools/apply-album-intro-style.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend (the album model reads the column).
 */
require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod');
if (PROD) require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
        ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);
    try {
        const [[c]] = await conn.query(
            `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_gallery_albums' AND COLUMN_NAME = 'intro_style'`,
            [process.env.DB_NAME],
        );
        console.log(c.n ? '  = intro_style   already there' : `  + intro_style   ${APPLY ? 'adding' : 'WOULD ADD'}`);
        if (!c.n && APPLY) {
            await conn.query('ALTER TABLE `event_gallery_albums` ADD COLUMN `intro_style` json DEFAULT NULL AFTER `intro_seconds`');
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
