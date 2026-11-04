#!/usr/bin/env node
/**
 * Participants web design (2026-11-04): Block / Hide Participant columns on
 * event_participants (src/database/migrations/sql/20261104-participant-access.sql).
 * Re-runnable — only the missing columns are added, in one ALTER.
 *
 *   node src/database/tools/apply-participant-access.js                 dry run, local
 *   node src/database/tools/apply-participant-access.js --apply         local
 *   node src/database/tools/apply-participant-access.js --prod          dry run, production
 *   node src/database/tools/apply-participant-access.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend — every participant
 * access check reads is_blocked.
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
    ['is_blocked', "`is_blocked` tinyint(1) NOT NULL DEFAULT '0' AFTER `checked_in_by_name`"],
    ['block_reason', '`block_reason` varchar(60) DEFAULT NULL AFTER `is_blocked`'],
    ['block_note', '`block_note` varchar(500) DEFAULT NULL AFTER `block_reason`'],
    ['blocked_at', '`blocked_at` datetime DEFAULT NULL AFTER `block_note`'],
    ['is_hidden', "`is_hidden` tinyint(1) NOT NULL DEFAULT '0' AFTER `blocked_at`"],
    ['hide_reason', '`hide_reason` varchar(60) DEFAULT NULL AFTER `is_hidden`'],
    ['hide_note', '`hide_note` varchar(500) DEFAULT NULL AFTER `hide_reason`'],
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
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_participants'`,
            [process.env.DB_NAME],
        );
        const have = new Set(rows.map((r) => r.c));
        const missing = COLUMNS.filter(([name]) => !have.has(name));
        for (const [name] of COLUMNS) {
            console.log(have.has(name)
                ? `  = event_participants.${name}   already there`
                : `  + event_participants.${name}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
        }
        if (missing.length && APPLY) {
            await conn.query(`ALTER TABLE event_participants ${missing.map(([, sql]) => `ADD COLUMN ${sql}`).join(', ')}`);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
});
