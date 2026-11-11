#!/usr/bin/env node
/**
 * Live Streaming upgrade (2026-11-11): creates event_live_stream_views, adds the category /
 * stream columns and widens the platform list (src/database/migrations/sql/20261111-live-stream-upgrade.sql).
 * Re-runnable: each step checks first. Old streams keep working: status starts as "scheduled"
 * and is worked out from the date and time.
 *
 *   node src/database/tools/apply-live-stream-upgrade.js                 dry run, local
 *   node src/database/tools/apply-live-stream-upgrade.js --apply         local
 *   node src/database/tools/apply-live-stream-upgrade.js --prod          dry run, production
 *   node src/database/tools/apply-live-stream-upgrade.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend (the models read the new columns).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod');
if (PROD) require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261111-live-stream-upgrade.sql');
const raw = fs.readFileSync(SQL_FILE, 'utf8');
const sql = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const createTable = sql.match(/CREATE TABLE IF NOT EXISTS `event_live_stream_views`[\s\S]*?;/)[0];
/** [table, column, "ADD COLUMN ..."] read from the ALTER statements of the SQL file. */
const columns = [];
for (const m of sql.matchAll(/ALTER TABLE `([a-z_]+)`([\s\S]*?);/g)) {
    for (const part of m[2].split(/,\s*\n/)) {
        const add = part.trim().match(/^ADD COLUMN `([a-z_]+)`[\s\S]*$/);
        if (add) columns.push([m[1], add[1], add[0]]);
    }
}
/** The commented MODIFY lines: [table, column, statement, "done when the column type has this"]. */
const modifies = [...raw.matchAll(/^-- (ALTER TABLE `([a-z_]+)` MODIFY `([a-z_]+)` [^\n]*;)\s*$/gm)]
    .map((m) => [m[2], m[3], m[1], m[3] === 'platform' ? "'teams'" : 'varchar(300)']);

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
    const columnType = async (t, c) => (await conn.query(
        'SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [db, t, c]))[0][0]?.COLUMN_TYPE ?? null;
    try {
        for (const [table, c, ddl] of columns) {
            const has = (await columnType(table, c)) !== null;
            console.log(has ? `  = ${table}.${c}   already there` : `  + ${table}.${c}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
            if (!has && APPLY) await conn.query(`ALTER TABLE \`${table}\` ${ddl}`);
        }
        for (const [table, c, stmt, mark] of modifies) {
            const done = String(await columnType(table, c)).includes(mark);
            console.log(done ? `  = ${table}.${c}   already widened` : `  ~ ${table}.${c}   ${APPLY ? 'widening' : 'WOULD WIDEN'}`);
            if (!done && APPLY) await conn.query(stmt);
        }
        const there = await tableThere('event_live_stream_views');
        console.log(there ? '  = event_live_stream_views   already there' : `  + event_live_stream_views   ${APPLY ? 'creating' : 'WOULD CREATE'}`);
        if (!there && APPLY) await conn.query(createTable);
        const [nullTypes] = await conn.query('SELECT count(*) AS c FROM event_live_stream_types WHERE is_active IS NULL');
        const nullCount = nullTypes[0]?.c || 0;
        console.log(`  * event_live_stream_types NULL is_active: ${nullCount} ${APPLY && nullCount > 0 ? '(setting to 1)' : ''}`);
        if (APPLY && nullCount > 0) {
            await conn.query('UPDATE event_live_stream_types SET is_active = 1 WHERE is_active IS NULL');
        }
        if (args.includes('--activate-all')) {
            console.log(`  * activating all stream categories ${APPLY ? '(APPLY)' : '(WOULD ACTIVATE)'}`);
            if (APPLY) await conn.query('UPDATE event_live_stream_types SET is_active = 1');
        }
        console.log(APPLY ? '\nDone.\n' : '\nRe-run with --apply to write it.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
