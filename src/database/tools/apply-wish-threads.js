#!/usr/bin/env node
/**
 * Wed Wishes as conversations (2026-11-09): creates event_wish_reads and adds photo / size_bytes
 * to event_wish_comments (src/database/migrations/sql/20261109-wish-threads.sql); round 2
 * (20261109-wish-chat-hide.sql): Hide Chat columns on event_wish_reads (last_read_at nullable)
 * and event_wishes.allow_comments. Re-runnable: each step checks first.
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

const ROUND2 = [
    ['event_wish_reads', 'is_hidden', "ADD COLUMN `is_hidden` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = conversation hidden from the organizer''s main inbox' AFTER `last_read_at`"],
    ['event_wish_reads', 'hide_note', 'ADD COLUMN `hide_note` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `is_hidden`'],
    ['event_wish_reads', 'hidden_at', 'ADD COLUMN `hidden_at` datetime DEFAULT NULL AFTER `hide_note`'],
    ['event_wishes', 'allow_comments', "ADD COLUMN `allow_comments` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = participants cannot add new comments on this wish' AFTER `is_flagged`"],
];

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
        // Round 2 — Hide Chat + per-wish comments.
        const [[nullable]] = await conn.query(
            "SELECT IS_NULLABLE n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_wish_reads' AND COLUMN_NAME = 'last_read_at'", [db]);
        const canNull = !nullable || nullable.n === 'YES';
        console.log(canNull ? '  = event_wish_reads.last_read_at   already NULL-able' : `  ~ event_wish_reads.last_read_at   ${APPLY ? 'making NULL-able' : 'WOULD MAKE NULL-able'}`);
        if (!canNull && APPLY) await conn.query('ALTER TABLE `event_wish_reads` MODIFY COLUMN `last_read_at` datetime DEFAULT NULL');
        for (const [table, c, ddl] of ROUND2) {
            const has = await columnThere(table, c);
            console.log(has ? `  = ${table}.${c}   already there` : `  + ${table}.${c}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
            if (!has && APPLY) await conn.query(`ALTER TABLE \`${table}\` ${ddl}`);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
