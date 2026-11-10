#!/usr/bin/env node
/**
 * Near By places (2026-11-10): creates `nearby_categories` (seeded) + `event_nearby_places`
 * (src/database/migrations/sql/20261110-event-nearby-places.sql). The "Near By" menu (slug `near-by`)
 * already exists.
 *
 * Re-runnable: existing tables and categories are left alone.
 *
 *   node src/database/tools/apply-event-nearby-places.js                  dry run, local
 *   node src/database/tools/apply-event-nearby-places.js --apply          local
 *   node src/database/tools/apply-event-nearby-places.js --prod           dry run, production
 *   node src/database/tools/apply-event-nearby-places.js --prod --apply   production
 *
 * ⚠ Run on production BEFORE pushing the backend (the model reads these tables).
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

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261110-event-nearby-places.sql');
const TABLES = ['nearby_categories', 'event_nearby_places'];

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
            console.log(`  ${existing.has(t) ? '=' : '+'} ${t.padEnd(24)} ${existing.has(t) ? 'already exists' : (APPLY ? 'creating' : 'WOULD CREATE')}`);
        }
        const [[menu]] = await conn.query("SELECT id, name FROM event_menus WHERE slug = 'near-by' AND deleted_at IS NULL LIMIT 1");
        console.log(menu ? `  = menu near-by               #${menu.id} "${menu.name}"` : '  ! menu near-by is missing — add it in Menu Management');
        if (!APPLY) {
            console.log('\nRe-run with --apply to write it.');
            return;
        }
        const sql = fs.readFileSync(SQL_FILE, 'utf8')
            .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
            .replace(/SELECT TABLE_NAME[\s\S]*$/, '');
        await conn.query(sql);
        const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM nearby_categories');
        console.log(`    tables ready, ${n} categories\n\nDone.`);
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
