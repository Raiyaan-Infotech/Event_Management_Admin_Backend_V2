#!/usr/bin/env node
/**
 * Home Screen Templates (2026-10-30): creates `home_screen_templates`
 * (src/database/migrations/sql/20261030-home-screen-templates.sql).
 * Re-runnable: created only when missing.
 *
 *   node src/database/tools/apply-home-screen-templates.js                  dry run, local
 *   node src/database/tools/apply-home-screen-templates.js --apply          local
 *   node src/database/tools/apply-home-screen-templates.js --prod           dry run, production
 *   node src/database/tools/apply-home-screen-templates.js --prod --apply   production
 *
 * ⚠ ORDER on production: run this, then the permission seeder
 * (src/database/seeders/guest-option-permissions.seeder.js --prod), BEFORE pushing the backend.
 */

require('dotenv').config();
const fs = require('fs');
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

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261030-home-screen-templates.sql');

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
        const create = fs.readFileSync(SQL_FILE, 'utf8')
            .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
            .split(';').map((s) => s.trim()).filter(Boolean)[0];

        const [[t]] = await conn.query(
            `SELECT COUNT(*) AS n FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'home_screen_templates'`,
            [process.env.DB_NAME],
        );
        if (t.n > 0) {
            console.log('  = home_screen_templates   already exists');
        } else {
            console.log(`  + home_screen_templates   ${APPLY ? 'creating' : 'WOULD CREATE'}`);
            if (APPLY) await conn.query(create);
        }
        if (!APPLY) console.log('\nDry run — add --apply to write.');
    } catch (e) {
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
