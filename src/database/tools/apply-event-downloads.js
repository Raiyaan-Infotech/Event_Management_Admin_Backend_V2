#!/usr/bin/env node
/**
 * Downloads (2026-11-10).
 *
 * 1. Creates `download_categories` (seeded) + `event_downloads`
 *    (src/database/migrations/sql/20261110-event-downloads.sql).
 * 2. Adds the "Downloads" menu to Menu Management (slug `downloads`, Add-on, same category / company
 *    as the Agenda menu, placed after Social Links) and grants it to every plan.
 *
 * Re-runnable: existing tables, categories and an existing menu are left alone.
 *
 *   node src/database/tools/apply-event-downloads.js                  dry run, local
 *   node src/database/tools/apply-event-downloads.js --apply          local
 *   node src/database/tools/apply-event-downloads.js --prod           dry run, production
 *   node src/database/tools/apply-event-downloads.js --prod --apply   production
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

const SQL_FILE = path.join(__dirname, '..', 'migrations', 'sql', '20261110-event-downloads.sql');
const TABLES = ['download_categories', 'event_downloads'];
const MENU = {
    name: 'Downloads',
    slug: 'downloads',
    icon: 'mdi:download',
    description: 'Brochures, PDFs, images, maps and other files for guests to download.',
};

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
        // 1. Tables (the file is all IF NOT EXISTS / INSERT IGNORE, so it always runs).
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
                .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
                .replace(/SELECT TABLE_NAME[\s\S]*$/, '');
            await conn.query(sql);
            const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM download_categories');
            console.log(`    tables ready, ${n} categories`);
        }

        // 2. The menu.
        const [[menu]] = await conn.query('SELECT id, name, deleted_at FROM event_menus WHERE slug = ? LIMIT 1', [MENU.slug]);
        if (menu) {
            console.log(`  = menu ${MENU.slug.padEnd(21)} already #${menu.id} "${menu.name}"${menu.deleted_at ? ' (DELETED)' : ''}`);
        } else {
            const [[anchor]] = await conn.query(
                "SELECT event_category_id, company_id FROM event_menus WHERE slug = 'agenda' AND deleted_at IS NULL ORDER BY id LIMIT 1",
            );
            const [[after]] = await conn.query(
                "SELECT sort_order FROM event_menus WHERE slug = 'social-links' AND deleted_at IS NULL ORDER BY id LIMIT 1",
            );
            const [[{ maxSort }]] = await conn.query(
                'SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM event_menus WHERE deleted_at IS NULL',
            );
            const sort = after ? Number(after.sort_order) + 1 : Number(maxSort) + 1;
            const [[{ plans }]] = await conn.query('SELECT COUNT(*) AS plans FROM subscription_plans WHERE deleted_at IS NULL');
            if (!APPLY) {
                console.log(`  + menu ${MENU.slug.padEnd(21)} WOULD ADD "${MENU.name}" (add-on, ${MENU.icon}, order ${sort}) + grant to ${plans} plan(s)`);
            } else {
                await conn.query('UPDATE event_menus SET sort_order = sort_order + 1 WHERE deleted_at IS NULL AND sort_order >= ?', [sort]);
                const [res] = await conn.query(
                    `INSERT INTO event_menus
                        (name, slug, description, menu_group, event_category_id, is_default, icon, color,
                         sort_order, is_active, company_id, created_at, updated_at)
                     VALUES (?, ?, ?, 'addon', ?, 0, ?, NULL, ?, 1, ?, NOW(), NOW())`,
                    [MENU.name, MENU.slug, MENU.description, anchor?.event_category_id ?? null, MENU.icon, sort, anchor?.company_id ?? null],
                );
                const [grant] = await conn.query(
                    `INSERT INTO subscription_plan_menus (plan_id, menu_id, sort_order, created_at, updated_at)
                     SELECT p.id, ?, 999, NOW(), NOW()
                       FROM subscription_plans p
                      WHERE p.deleted_at IS NULL
                        AND NOT EXISTS (SELECT 1 FROM subscription_plan_menus g WHERE g.plan_id = p.id AND g.menu_id = ?)`,
                    [res.insertId, res.insertId],
                );
                console.log(`  + menu ${MENU.slug.padEnd(21)} added #${res.insertId} "${MENU.name}" at order ${sort}, granted to ${grant.affectedRows} plan(s)`);
            }
        }
        if (!APPLY) console.log('\nRe-run with --apply to write it.');
        else console.log('\nDone. The running backend caches plan grants for a while — restart it (or wait) to see the menu.');
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
