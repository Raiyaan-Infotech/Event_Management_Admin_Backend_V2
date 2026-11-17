/**
 * Adds the Event Logo columns (Jamal, 2026-11-17):
 *   event_templates.logo_image / logo_position / logo_size — the admin's sample logo
 *     on Step 2 of the template wizard and where it sits on the card;
 *   events.logo_image — the host's own logo, drawn in that place instead of the sample
 *     (and on the splash screen).
 *
 *   node src/database/tools/apply-template-logo.js            (dry run, local)
 *   node src/database/tools/apply-template-logo.js --apply
 *   node src/database/tools/apply-template-logo.js --prod --apply
 *
 * ⚠ Run on production BEFORE deploying the backend that reads the columns: the
 * EventTemplate and Event models select them, so every template and event query
 * fails until they exist.
 */
require('dotenv').config();
const localEnv = { ...process.env };

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');
const PROD = process.argv.includes('--prod');

/** table -> column -> the clause that adds it. Each is added only if missing. */
const TABLES = {
    event_templates: {
        logo_image:
            "ADD COLUMN `logo_image` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sample event logo / monogram; null = no logo slot' AFTER `decoration_ids`",
        logo_position:
            "ADD COLUMN `logo_position` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'top' COMMENT 'Where the logo sits: top-left … bottom-right' AFTER `logo_image`",
        logo_size:
            "ADD COLUMN `logo_size` smallint unsigned NOT NULL DEFAULT '100' COMMENT 'Logo size, percentage of the standard size' AFTER `logo_position`",
    },
    events: {
        logo_image:
            "ADD COLUMN `logo_image` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Host''s own logo; null = the template''s sample' AFTER `invitation_image`",
    },
};

const parseEnv = (file) => {
    const out = {};
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', '..', file), 'utf8');
    for (const l of raw.split(/\r?\n/)) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
};

(async () => {
    const env = PROD ? parseEnv('.env.production') : localEnv;
    const conn = await mysql.createConnection({
        host: env.DB_HOST,
        port: env.DB_PORT || 3306,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        charset: 'utf8mb4',
        ssl: PROD && env.DB_SSL !== 'false' ? { rejectUnauthorized: false } : undefined,
    });

    console.log(`${PROD ? 'PRODUCTION' : 'LOCAL'}  ${env.DB_HOST}  ${env.DB_NAME}`);

    const todo = [];
    for (const [table, columns] of Object.entries(TABLES)) {
        const [present] = await conn.query(
            `SELECT COLUMN_NAME c FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (?)`,
            [table, Object.keys(columns)]
        );
        const have = new Set(present.map((r) => r.c));
        const missing = Object.keys(columns).filter((c) => !have.has(c));
        for (const c of Object.keys(columns)) console.log(`${table}.${c}: ${have.has(c) ? 'present' : 'TO ADD'}`);
        if (missing.length) todo.push({ table, sql: missing.map((c) => columns[c]).join(', '), missing });
    }

    if (!todo.length) {
        console.log('Nothing to do.');
        await conn.end();
        return;
    }
    if (!APPLY) {
        console.log('\nDry run — nothing changed. Re-run with --apply.');
        await conn.end();
        return;
    }

    // One ALTER per table, in the order above, so each `AFTER` finds its column.
    for (const t of todo) {
        await conn.query(`ALTER TABLE \`${t.table}\` ${t.sql}`);
        console.log(`Added to ${t.table}: ${t.missing.join(', ')}.`);
    }
    await conn.end();
})().catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
});
