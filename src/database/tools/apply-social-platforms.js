#!/usr/bin/env node
/**
 * Social platforms (2026-11-10): creates `social_platforms` and seeds the nine platforms of
 * "Add Social Link" (src/database/migrations/sql/20261110-social-platforms.sql).
 *
 * Re-runnable: an existing table and existing platforms are left alone.
 *
 *   node src/database/tools/apply-social-platforms.js                  dry run, local
 *   node src/database/tools/apply-social-platforms.js --apply          local
 *   node src/database/tools/apply-social-platforms.js --prod           dry run, production
 *   node src/database/tools/apply-social-platforms.js --prod --apply   production
 *
 * ⚠ Run on production BEFORE pushing the backend (the social links list reads this table).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod') || args.includes('prod');

if (PROD) {
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });
}

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261110-social-platforms.sql');

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
        ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);
    try {
        const [[exists]] = await conn.query(
            "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'social_platforms'",
            [process.env.DB_NAME],
        );
        console.log(`  ${exists.n ? '=' : '+'} social_platforms  ${exists.n ? 'already exists' : (APPLY ? 'creating' : 'WOULD CREATE')}`);
        if (!APPLY) {
            console.log('\nRe-run with --apply to write it (missing platforms are added, existing ones kept).');
            return;
        }
        const sql = fs.readFileSync(SQL_FILE, 'utf8')
            .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
            .replace(/SELECT platform_key[\s\S]*$/, '');
        await conn.query(sql);
        const [rows] = await conn.query('SELECT platform_key, name, icon FROM social_platforms ORDER BY sort_order');
        rows.forEach((r) => console.log(`    ${r.platform_key.padEnd(10)} ${r.name.padEnd(12)} ${r.icon}`));
        console.log('\nDone.');
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
