#!/usr/bin/env node
/**
 * Wed Wishes as conversations (2026-11-09): creates event_wish_reads and adds photo / size_bytes
 * to event_wish_comments (src/database/migrations/sql/20261109-wish-threads.sql). Re-runnable:
 * each step checks first.
 *
 *   node src/database/tools/apply-wish-threads.js                 dry run, local
 *   node src/database/tools/apply-wish-threads.js --apply         local
 *   node src/database/tools/apply-wish-threads.js --prod          dry run, production
 *   node src/database/tools/apply-wish-threads.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend (the models read the new table / columns).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod');
if (PROD) require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261109-wish-threads.sql');
const statements = fs.readFileSync(SQL_FILE, 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);
const createOf = (table) => statements.find((s) => s.includes(`CREATE TABLE IF NOT EXISTS \`${table}\``));

const COLUMNS = [
    ['photo', "ADD COLUMN `photo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'an attached image (organizer replies)' AFTER `message`"],
    ['size_bytes', "ADD COLUMN `size_bytes` bigint unsigned NOT NULL DEFAULT '0' COMMENT 'stored bytes of the photo, counted in the plan storage' AFTER `photo`"],
];

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD ?? process.env.DB_PASS,
        database: process.env.DB_NAME,
        ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    const db = process.env.DB_NAME;
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${db} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);
    const tableThere = async (t) => (await conn.query(
        'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [db, t]))[0].length > 0;
    const columnThere = async (t, c) => (await conn.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [db, t, c]))[0].length > 0;
    try {
        const t = 'event_wish_reads';
        const there = await tableThere(t);
        console.log(there ? `  = ${t}   already there` : `  + ${t}   ${APPLY ? 'creating' : 'WOULD CREATE'}`);
        if (!there && APPLY) await conn.query(createOf(t));
        for (const [c, ddl] of COLUMNS) {
            const has = await columnThere('event_wish_comments', c);
            console.log(has ? `  = event_wish_comments.${c}   already there` : `  + event_wish_comments.${c}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
            if (!has && APPLY) await conn.query(`ALTER TABLE \`event_wish_comments\` ${ddl}`);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
