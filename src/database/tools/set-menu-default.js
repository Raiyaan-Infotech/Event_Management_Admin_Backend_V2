#!/usr/bin/env node
/**
 * Make an event menu DEFAULT (always on, every plan) or ADD-ON — the same as the admin's
 * Menu Management switch (eventMenu.service.updateToggle): Default also grants the menu to
 * every live plan that lacks it (additive; turning Default off leaves plan grants alone).
 * Events need nothing: a Default menu is on for every event of its category automatically.
 * The portal's plan-grant cache clears itself within a minute.
 *
 *   node src/database/tools/set-menu-default.js --slug family --default 1                 dry run, local
 *   node src/database/tools/set-menu-default.js --slug family --default 1 --apply         local
 *   node src/database/tools/set-menu-default.js --slug family --default 1 --prod --apply  production
 *   --default 0 = Add-on.
 */

require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod');
const SLUG = flag('slug');
const DEFAULT = flag('default') === '0' ? 0 : 1;

if (PROD) {
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });
}

(async () => {
    if (!SLUG) throw new Error('--slug is required (e.g. --slug family).');
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
        const [menus] = await conn.query(
            'SELECT id, name, slug, is_default, menu_group, event_category_id FROM event_menus WHERE slug = ? AND deleted_at IS NULL', [SLUG]);
        if (!menus.length) throw new Error(`No live menu with slug "${SLUG}".`);
        const ids = menus.map((m) => m.id);
        const [[plans]] = await conn.query('SELECT COUNT(*) AS n FROM subscription_plans WHERE deleted_at IS NULL');
        const [missing] = await conn.query(
            `SELECT g.menu_id, COUNT(*) AS n FROM subscription_plans p
               JOIN (SELECT ? AS menu_id) g
              WHERE p.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM subscription_plan_menus s WHERE s.plan_id = p.id AND s.menu_id = g.menu_id)
              GROUP BY g.menu_id`, [ids[0]]);
        for (const m of menus) {
            console.log(`  #${m.id} ${m.name} (${m.slug})  is_default ${m.is_default} -> ${DEFAULT}   menu_group ${m.menu_group}   category ${m.event_category_id ?? 'all'}`);
        }
        if (DEFAULT === 1) console.log(`  plans: ${plans.n} live, ${missing[0]?.n ?? 0} do not grant it yet -> ${APPLY ? 'granting' : 'WOULD GRANT'}`);
        if (APPLY) {
            await conn.query('UPDATE event_menus SET is_default = ?, updated_at = NOW() WHERE id IN (?)', [DEFAULT, ids]);
            if (DEFAULT === 1) {
                for (const id of ids) {
                    // Same statement as eventMenu.service.grantToEveryPlan — one per menu.
                    await conn.query(
                        `INSERT INTO subscription_plan_menus (plan_id, menu_id, sort_order, created_at, updated_at)
                         SELECT p.id, ?, 999, NOW(), NOW() FROM subscription_plans p
                          WHERE p.deleted_at IS NULL
                            AND NOT EXISTS (SELECT 1 FROM subscription_plan_menus g WHERE g.plan_id = p.id AND g.menu_id = ?)`, [id, id]);
                }
            }
            const [after] = await conn.query('SELECT id, is_default FROM event_menus WHERE id IN (?)', [ids]);
            console.log(`  saved: ${after.map((r) => `#${r.id} is_default=${r.is_default}`).join(', ')}`);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
});
