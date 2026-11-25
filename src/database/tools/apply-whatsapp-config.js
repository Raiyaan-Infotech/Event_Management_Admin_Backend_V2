#!/usr/bin/env node
/**
 * Meta WhatsApp Cloud API provider configuration (2026-11-25): creates `whatsapp_configs`
 * (src/database/migrations/sql/20261125-whatsapp-config.sql). Re-runnable.
 *
 *   node src/database/tools/apply-whatsapp-config.js                 dry run, local
 *   node src/database/tools/apply-whatsapp-config.js --apply         local
 *   node src/database/tools/apply-whatsapp-config.js --prod          dry run, production
 *   node src/database/tools/apply-whatsapp-config.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend.
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

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261125-whatsapp-config.sql');

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
            `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'whatsapp_configs'`,
            [process.env.DB_NAME],
        );
        if (rows.length) {
            console.log('  = whatsapp_configs already exists');
        } else {
            const sql = fs.readFileSync(SQL_FILE, 'utf8')
                .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
            console.log(`  + whatsapp_configs ${APPLY ? 'create' : 'WOULD create'}`);
            if (APPLY) await conn.query(sql);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
