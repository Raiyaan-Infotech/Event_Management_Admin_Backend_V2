#!/usr/bin/env node
/**
 * Gallery web design (2026-11-04): folder type + notes on event_gallery_categories
 * (src/database/migrations/sql/20261104-gallery-folders.sql). Re-runnable.
 *
 *   node src/database/tools/apply-gallery-folders.js                 dry run, local
 *   node src/database/tools/apply-gallery-folders.js --apply         local
 *   node src/database/tools/apply-gallery-folders.js --prod          dry run, production
 *   node src/database/tools/apply-gallery-folders.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend (the model reads both columns).
 */

require('dotenv').config();
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

const COLUMNS = [
    ['folder_type', "`folder_type` enum('images','videos','shorts','mixed') NOT NULL DEFAULT 'mixed' AFTER `is_default`"],
    ['notes', '`notes` varchar(500) DEFAULT NULL AFTER `folder_type`'],
];

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
        const [rows] = await conn.query(
            `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_gallery_categories'`,
            [process.env.DB_NAME],
        );
        const have = new Set(rows.map((r) => r.c));
        const missing = COLUMNS.filter(([name]) => !have.has(name));
        for (const [name] of COLUMNS) {
            console.log(have.has(name)
                ? `  = event_gallery_categories.${name}   already there`
                : `  + event_gallery_categories.${name}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
        }
        if (missing.length && APPLY) {
            await conn.query(`ALTER TABLE event_gallery_categories ${missing.map(([, sql]) => `ADD COLUMN ${sql}`).join(', ')}`);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
});
