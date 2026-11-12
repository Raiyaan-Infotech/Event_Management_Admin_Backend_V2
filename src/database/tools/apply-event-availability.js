#!/usr/bin/env node
/**
 * Event Availability (2026-11-12).
 *
 * Creates `availability_configs` + `availability_overrides`
 * (src/database/migrations/sql/20261112-event-availability.sql).
 *
 * Re-runnable: existing tables are left alone.
 *
 *   node src/database/tools/apply-event-availability.js                  dry run, local
 *   node src/database/tools/apply-event-availability.js --apply          local
 *   node src/database/tools/apply-event-availability.js --prod           dry run, production
 *   node src/database/tools/apply-event-availability.js --prod --apply   production
 *
 * ⚠ Run on production BEFORE pushing the backend (the models read these tables).
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

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261112-event-availability.sql');
const TABLES = ['availability_configs', 'availability_overrides'];

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
        const [have] = await conn.query(
            'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)',
            [process.env.DB_NAME, TABLES],
        );
        const existing = new Set(have.map((r) => r.t));
        for (const t of TABLES) {
            console.log(`  ${existing.has(t) ? '=' : '+'} ${t.padEnd(26)} ${existing.has(t) ? 'already exists' : (APPLY ? 'creating' : 'WOULD CREATE')}`);
        }
        if (APPLY) {
            const sql = fs.readFileSync(SQL_FILE, 'utf8')
                .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
            await conn.query(sql);
            console.log('\nDone.');
        } else {
            console.log('\nRe-run with --apply to write it.');
        }
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
