#!/usr/bin/env node
/**
 * Home Screen Templates (2026-10-30, extended 2026-10-31).
 *
 *   1. creates `home_screen_templates`
 *      (src/database/migrations/sql/20261030-home-screen-templates.sql)
 *   2. creates `home_screen_categories`, the style master
 *      (src/database/migrations/sql/20261031-home-screen-categories.sql)
 *   3. switches home_screen_templates.template_category_id -> home_screen_category_id
 *      (copies each style in use across by name, then drops the old column + FK)
 *   4. adds `events.home_screen_template_id` + its key and foreign key
 *      (src/database/migrations/sql/20261031-event-home-screen-template.sql)
 *
 * Re-runnable: each step runs only when its table / column is missing.
 *
 *   node src/database/tools/apply-home-screen-templates.js                  dry run, local
 *   node src/database/tools/apply-home-screen-templates.js --apply          local
 *   node src/database/tools/apply-home-screen-templates.js --prod           dry run, production
 *   node src/database/tools/apply-home-screen-templates.js --prod --apply   production
 *
 * ⚠ ORDER on production: run this, then the permission seeder
 * (src/database/seeders/guest-option-permissions.seeder.js --prod), BEFORE pushing the backend
 * (the Event model reads the new column).
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

const SQL_DIR = path.join(__dirname, '..', 'migrations', 'sql');

/** The first statement of a migration file, comments stripped. */
const firstStatement = (file) =>
    fs.readFileSync(path.join(SQL_DIR, file), 'utf8')
        .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
        .split(';').map((s) => s.trim()).filter(Boolean)[0];

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    const db = process.env.DB_NAME;
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${db} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);

    try {
        // 1. the table
        const [[t]] = await conn.query(
            `SELECT COUNT(*) AS n FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'home_screen_templates'`,
            [db],
        );
        if (t.n > 0) {
            console.log('  = home_screen_templates   already exists');
        } else {
            console.log(`  + home_screen_templates   ${APPLY ? 'creating' : 'WOULD CREATE'}`);
            if (APPLY) await conn.query(firstStatement('20261030-home-screen-templates.sql'));
        }

        // 2. home_screen_categories — the style master (2026-10-31)
        const [[hc]] = await conn.query(
            `SELECT COUNT(*) AS n FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'home_screen_categories'`,
            [db],
        );
        if (hc.n > 0) {
            console.log('  = home_screen_categories   already exists');
        } else {
            console.log(`  + home_screen_categories   ${APPLY ? 'creating' : 'WOULD CREATE'}`);
            if (APPLY) await conn.query(firstStatement('20261031-home-screen-categories.sql'));
        }

        // 3. home_screen_templates: template_category_id (-> template_categories)
        //    becomes home_screen_category_id (-> home_screen_categories). Existing
        //    rows keep their style: each style is copied across BY NAME.
        const columnExists = async (table, column) => {
            const [[r]] = await conn.query(
                `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [db, table, column],
            );
            return r.n > 0;
        };
        const hasOld = (t.n > 0 || APPLY) && await columnExists('home_screen_templates', 'template_category_id');
        const hasNew = (t.n > 0 || APPLY) && await columnExists('home_screen_templates', 'home_screen_category_id');

        if (hasNew && !hasOld) {
            console.log('  = home_screen_templates.home_screen_category_id   already switched');
        } else if (hasOld) {
            const [used] = await conn.query(
                `SELECT DISTINCT h.template_category_id AS old_id, c.name, c.slug, c.sort_order
                   FROM home_screen_templates h
                   JOIN template_categories c ON c.id = h.template_category_id
                  WHERE h.template_category_id IS NOT NULL`,
            );
            console.log(`  + home_screen_templates: switch style column to home_screen_categories   ${APPLY ? 'switching' : 'WOULD SWITCH'}`
                + ` (${used.length} style(s) in use: ${used.map((u) => u.name).join(', ') || 'none'})`);

            if (APPLY) {
                if (!hasNew) {
                    await conn.query(
                        `ALTER TABLE home_screen_templates
                           ADD COLUMN home_screen_category_id int unsigned DEFAULT NULL AFTER event_category_id,
                           ADD KEY idx_home_tpl_category (home_screen_category_id, deleted_at)`,
                    );
                }
                for (const u of used) {
                    const [[found]] = await conn.query(
                        `SELECT id FROM home_screen_categories WHERE name = ? AND deleted_at IS NULL LIMIT 1`,
                        [u.name],
                    );
                    let newId = found?.id;
                    if (!newId) {
                        const [res] = await conn.query(
                            `INSERT INTO home_screen_categories (name, slug, sort_order, is_active, company_id, created_at, updated_at)
                             VALUES (?, ?, ?, 1, 1, NOW(), NOW())`,
                            [u.name, u.slug, u.sort_order || 0],
                        );
                        newId = res.insertId;
                        console.log(`      + category ${u.name} (id ${newId})`);
                    }
                    await conn.query(
                        'UPDATE home_screen_templates SET home_screen_category_id = ? WHERE template_category_id = ?',
                        [newId, u.old_id],
                    );
                }
                const [[fk]] = await conn.query(
                    `SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'home_screen_templates' AND CONSTRAINT_NAME = 'fk_home_tpl_style'`,
                    [db],
                );
                if (fk.n > 0) await conn.query('ALTER TABLE home_screen_templates DROP FOREIGN KEY fk_home_tpl_style');
                const [[ix]] = await conn.query(
                    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'home_screen_templates' AND INDEX_NAME = 'idx_home_tpl_style'`,
                    [db],
                );
                if (ix.n > 0) await conn.query('ALTER TABLE home_screen_templates DROP INDEX idx_home_tpl_style');
                await conn.query('ALTER TABLE home_screen_templates DROP COLUMN template_category_id');
                await conn.query(
                    `ALTER TABLE home_screen_templates
                       ADD CONSTRAINT fk_home_tpl_category FOREIGN KEY (home_screen_category_id)
                       REFERENCES home_screen_categories (id) ON DELETE SET NULL ON UPDATE CASCADE`,
                );
            }
        } else if (t.n === 0 && !APPLY) {
            console.log('  + home_screen_templates: style column WOULD be switched after the table is created');
        }

        // 4. events.home_screen_template_id (needs the table above for its FK)
        const [[c]] = await conn.query(
            `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'events' AND COLUMN_NAME = 'home_screen_template_id'`,
            [db],
        );
        if (c.n > 0) {
            console.log('  = events.home_screen_template_id   already there');
        } else {
            console.log(`  + events.home_screen_template_id   ${APPLY ? 'adding' : 'WOULD ADD'}`);
            if (APPLY) await conn.query(firstStatement('20261031-event-home-screen-template.sql'));
        }

        if (!APPLY) console.log('\nDry run — add --apply to write.');
    } catch (e) {
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
