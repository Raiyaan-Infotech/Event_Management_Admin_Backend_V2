#!/usr/bin/env node
/**
 * Family Visibility + Key Family Member (2026-11-04): adds event_family_members.is_visible
 * and .is_key (src/database/migrations/sql/20261104-family-visibility.sql). Re-runnable.
 *
 *   node src/database/tools/apply-family-visibility.js                 dry run, local
 *   node src/database/tools/apply-family-visibility.js --apply         local
 *   node src/database/tools/apply-family-visibility.js --prod          dry run, production
 *   node src/database/tools/apply-family-visibility.js --prod --apply  production
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
    ['is_visible', "ADD COLUMN `is_visible` tinyint(1) NOT NULL DEFAULT '1' AFTER `notes`"],
    ['is_key', "ADD COLUMN `is_key` tinyint(1) NOT NULL DEFAULT '0' AFTER `is_visible`"],
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
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_family_members'`,
            [process.env.DB_NAME],
        );
        const have = new Set(rows.map((r) => r.c));
        // In order, so is_key can sit AFTER is_visible.
        const missing = COLUMNS.filter(([name]) => !have.has(name));
        for (const [name] of COLUMNS) {
            console.log(have.has(name)
                ? `  = event_family_members.${name}   already there`
                : `  + event_family_members.${name}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
        }
        if (missing.length && APPLY) {
            // One ALTER — prod is ~370 ms a query.
            await conn.query(`ALTER TABLE event_family_members ${missing.map(([, sql]) => sql).join(', ')}`);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
});
