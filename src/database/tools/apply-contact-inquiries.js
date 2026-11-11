#!/usr/bin/env node
/**
 * Contact Messages (2026-11-11): creates event_contact_inquiries and adds the block / remove /
 * reply-time columns to event_contact_chats and photo / size_bytes to event_contact_chat_messages
 * (src/database/migrations/sql/20261111-contact-inquiries.sql). Then back-fills old chats:
 * one inquiry each (resolved ones closed), and awaiting_since for chats whose last word is
 * the participant's. Re-runnable: each step checks first.
 *
 *   node src/database/tools/apply-contact-inquiries.js                 dry run, local
 *   node src/database/tools/apply-contact-inquiries.js --apply         local
 *   node src/database/tools/apply-contact-inquiries.js --prod          dry run, production
 *   node src/database/tools/apply-contact-inquiries.js --prod --apply  production
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

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261111-contact-inquiries.sql');
const sql = fs.readFileSync(SQL_FILE, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const createTable = sql.match(/CREATE TABLE IF NOT EXISTS `event_contact_inquiries`[\s\S]*?;/)[0];
/** [table, column, "ADD COLUMN ..."] read from the ALTER statements of the SQL file. */
const columns = [];
for (const m of sql.matchAll(/ALTER TABLE `([a-z_]+)`([\s\S]*?);/g)) {
    for (const part of m[2].split(/,\s*\n/)) {
        const add = part.trim().match(/^ADD COLUMN `([a-z_]+)`[\s\S]*$/);
        if (add) columns.push([m[1], add[1], add[0]]);
    }
}

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
        const there = await tableThere('event_contact_inquiries');
        console.log(there ? '  = event_contact_inquiries   already there' : `  + event_contact_inquiries   ${APPLY ? 'creating' : 'WOULD CREATE'}`);
        if (!there && APPLY) await conn.query(createTable);
        for (const [table, c, ddl] of columns) {
            const has = await columnThere(table, c);
            console.log(has ? `  = ${table}.${c}   already there` : `  + ${table}.${c}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
            if (!has && APPLY) await conn.query(`ALTER TABLE \`${table}\` ${ddl}`);
        }
        if (!APPLY) {
            console.log('\nRe-run with --apply to write it (old chats are back-filled then).\n');
            return;
        }

        // Back-fill: every chat without an inquiry gets one, opened by its first participant message.
        const [added] = await conn.query(`
            INSERT INTO event_contact_inquiries (chat_id, event_id, first_message, opened_at, resolved_at)
            SELECT c.id, c.event_id,
                   LEFT((SELECT m.body FROM event_contact_chat_messages m
                          WHERE m.chat_id = c.id AND m.sender_side = 'participant' ORDER BY m.id LIMIT 1), 255),
                   COALESCE((SELECT MIN(m.created_at) FROM event_contact_chat_messages m
                              WHERE m.chat_id = c.id AND m.sender_side = 'participant'), c.created_at),
                   IF(c.status = 'resolved', c.updated_at, NULL)
              FROM event_contact_chats c
             WHERE NOT EXISTS (SELECT 1 FROM event_contact_inquiries i WHERE i.chat_id = c.id)`);
        console.log(`  ~ inquiries back-filled   ${added.affectedRows}`);

        // Open chats whose last word is the participant's are waiting for an answer.
        const [waiting] = await conn.query(`
            UPDATE event_contact_chats c
               SET c.awaiting_since = (
                   SELECT MIN(m.created_at) FROM event_contact_chat_messages m
                    WHERE m.chat_id = c.id AND m.sender_side = 'participant'
                      AND m.id > COALESCE((SELECT MAX(t.id) FROM event_contact_chat_messages t
                                            WHERE t.chat_id = c.id AND t.sender_side = 'team' AND t.is_auto = 0), 0))
             WHERE c.awaiting_since IS NULL AND c.status = 'open'`);
        console.log(`  ~ awaiting_since set      ${waiting.changedRows}`);
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
