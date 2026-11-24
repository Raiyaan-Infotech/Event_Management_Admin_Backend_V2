#!/usr/bin/env node
/**
 * Message templates (2026-11-24): Email + WhatsApp columns on notification_templates
 * (src/database/migrations/sql/20261124-notification-template-channels.sql). Re-runnable.
 *
 *   node src/database/tools/apply-notification-template-channels.js                 dry run, local
 *   node src/database/tools/apply-notification-template-channels.js --apply         local
 *   node src/database/tools/apply-notification-template-channels.js --prod          dry run, production
 *   node src/database/tools/apply-notification-template-channels.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend (the model reads the new columns).
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

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261124-notification-template-channels.sql');

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
        const [cols] = await conn.query(
            `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'notification_templates'`,
            [process.env.DB_NAME],
        );
        const have = new Map(cols.map((c) => [c.COLUMN_NAME, c.IS_NULLABLE]));

        const statements = fs.readFileSync(SQL_FILE, 'utf8')
            .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
            .split(';').map((s) => s.trim()).filter(Boolean);

        for (const sql of statements) {
            const add = sql.match(/ADD COLUMN `(\w+)`/);
            const mod = sql.match(/MODIFY COLUMN `(\w+)`/);
            const col = (add || mod)[1];
            const done = add ? have.has(col) : have.get(col) === 'YES';
            const verb = add ? 'add' : 'make nullable';
            if (done) {
                console.log(`  = ${col.padEnd(24)} already done`);
                continue;
            }
            console.log(`  + ${col.padEnd(24)} ${APPLY ? verb : `WOULD ${verb}`}`);
            if (APPLY) await conn.query(sql);
        }

        // Back-fill the new audience column on existing rows: a mapped template takes its
        // trigger's audience from the catalogue; the rest (invitation / RSVP / reminder
        // blueprints) are messages to guests.
        if (APPLY || have.has('audience')) {
            const catalog = require('../../config/notificationCatalog.json');
            const [rows] = await conn.query(
                'SELECT id, trigger_key FROM notification_templates WHERE audience IS NULL AND deleted_at IS NULL',
            );
            for (const r of rows) {
                const t = catalog.triggers.find((x) => x.key === r.trigger_key);
                const audience = t ? t.audience : 'guest';
                console.log(`  ~ template #${r.id} audience -> ${audience}${APPLY ? '' : ' (dry run)'}`);
                if (APPLY) await conn.query('UPDATE notification_templates SET audience = ?, updated_at = updated_at WHERE id = ?', [audience, r.id]);
            }
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
