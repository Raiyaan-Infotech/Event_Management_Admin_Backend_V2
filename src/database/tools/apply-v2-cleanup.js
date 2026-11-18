#!/usr/bin/env node
/**
 * V2 clean-up (Jamal, 2026-11-17): DROPS the tables of the features V2 no longer has —
 * admin Mail, admin Chat, e-mail campaigns, Plugins, FAQs, Departments, Payments, the vendor's
 * staff / departments / newsletter / subscribers / e-mail templates, the vendor's own website,
 * and three tables no code used (pincodes, sequelizemeta, vendor_website_pricing_*).
 *
 *   node src/database/tools/apply-v2-cleanup.js                 dry run, local
 *   node src/database/tools/apply-v2-cleanup.js --apply         local
 *   node src/database/tools/apply-v2-cleanup.js --prod          dry run, production
 *   node src/database/tools/apply-v2-cleanup.js --prod --apply  production
 *
 * --apply first writes a BACKUP of every table it will drop (its CREATE TABLE + all rows, JSON)
 * to <repo>/../backups/v2-cleanup-<db>-<host>-<time>.json — outside the repo, because the rows
 * hold real names and e-mail addresses. The drop does not start if the backup fails.
 * A foreign key from a table that STAYS into one that goes stops the run (none today).
 *
 * ⚠ ORDER on production: push the backend FIRST this time (the old code still reads these
 * tables; the new code does not), THEN run this with --prod --apply.
 *
 * NOT dropped: vendor_website_ui_blocks — admin → Website Builder → UI Blocks reads and writes it.
 * Re-runnable: a table that is already gone is skipped.
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

const TABLES = [
    // admin Mail
    'mail_notifications', 'mail_recipients', 'mail_folders', 'mails',
    // admin Chat
    'chat_read_states', 'chat_participants', 'chat_messages', 'chat_conversations',
    // e-mail campaigns (email_configs + email_templates STAY: system e-mails use them)
    'email_sent_logs', 'email_queue', 'email_campaigns',
    // Plugins, FAQs, Departments, Payments
    'plugins', 'faqs', 'faq_categories', 'departments', 'payments',
    // vendor: staff, departments, newsletter, subscribers, e-mail templates
    'vendor_staff', 'vendor_departments', 'vendor_newsletter_sent_logs', 'vendor_newsletter_sends', 'vendor_newsletters',
    'vendor_subscribers', 'vendor_email_templates', 'vendor_email_categories',
    // the vendor's own website (vendor_website_ui_blocks stays — see above)
    'vendor_website_basic_information', 'vendor_website_clients', 'vendor_website_contact_categories',
    'vendor_website_contact_messages', 'vendor_website_contact_settings', 'vendor_website_contact_social_links',
    'vendor_website_footer_settings', 'vendor_website_gallery_categories', 'vendor_website_gallery_items',
    'vendor_website_hero_sections', 'vendor_website_menu_items', 'vendor_website_pages',
    'vendor_website_pricing_matrix_features', 'vendor_website_pricing_plans', 'vendor_website_pricing_settings',
    'vendor_website_publish_snapshots', 'vendor_website_seo_settings', 'vendor_website_slider_items',
    'vendor_website_sliders', 'vendor_website_social_links', 'vendor_website_sponsors', 'vendor_website_testimonials',
    'vendor_websites',
    // no code used these
    'pincodes', 'sequelizemeta',
];

/**
 * Permission modules of removed features: their permissions, the role grants of those
 * permissions, and the module rows. No code checks any of these slugs any more.
 */
const DEAD_MODULES = ['staff', 'communication', 'transactions', 'payment'];

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: PROD ? { rejectUnauthorized: false } : undefined,
        dateStrings: true,
    });
    console.log(`${PROD ? 'PRODUCTION' : 'LOCAL'} ${process.env.DB_NAME} @ ${process.env.DB_HOST} — ${APPLY ? 'APPLY' : 'dry run'}\n`);

    const [have] = await conn.query('SELECT TABLE_NAME AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
    // Real (case-preserving) names: on Linux MySQL `SequelizeMeta` ≠ `sequelizemeta`.
    const realName = new Map(have.map((r) => [r.t.toLowerCase(), r.t]));
    const going = TABLES.filter((t) => realName.has(t)).map((t) => realName.get(t));
    const gone = TABLES.filter((t) => !realName.has(t));

    // A table that stays must not point at one that goes.
    const [fks] = await conn.query(
        `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, REFERENCED_TABLE_NAME AS r
           FROM information_schema.key_column_usage
          WHERE table_schema = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    const goingLower = going.map((t) => t.toLowerCase());
    const blockers = fks.filter((k) => goingLower.includes(k.r.toLowerCase()) && !TABLES.includes(k.t.toLowerCase()));
    if (blockers.length) {
        for (const b of blockers) console.log(`  ✗ ${b.t}.${b.c} points at ${b.r} (a table that stays → one that goes)`);
        console.log('\nStopped: nothing changed.');
        await conn.end();
        process.exit(1);
    }

    let totalRows = 0;
    const counts = {};
    for (const t of going) {
        const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
        counts[t] = Number(n);
        totalRows += Number(n);
        console.log(`  ${APPLY ? 'DROP' : 'would drop'}  ${t.padEnd(42)} ${String(n).padStart(6)} rows`);
    }
    for (const t of gone) console.log(`  already gone  ${t}`);
    console.log(`\n${going.length} tables, ${totalRows} rows${gone.length ? `; ${gone.length} already gone` : ''}.`);

    // Rows: permission modules of removed features.
    const ph = DEAD_MODULES.map(() => '?').join(',');
    const [deadMods] = await conn.query(`SELECT * FROM modules WHERE slug IN (${ph})`, DEAD_MODULES);
    const modIds = deadMods.map((m) => m.id);
    const [deadPerms] = modIds.length
        ? await conn.query(`SELECT * FROM permissions WHERE module_id IN (${modIds.map(() => '?').join(',')})`, modIds) : [[]];
    const permIds = deadPerms.map((p) => p.id);
    const [deadGrants] = permIds.length
        ? await conn.query(`SELECT * FROM role_permissions WHERE permission_id IN (${permIds.map(() => '?').join(',')})`, permIds) : [[]];
    console.log(`\nRows: ${deadMods.length} modules (${deadMods.map((m) => m.slug).join(', ') || 'none'}), ${deadPerms.length} permissions, ${deadGrants.length} role grants — ${APPLY ? 'DELETE' : 'would delete'}.`);
    const rowWork = deadMods.length + deadPerms.length + deadGrants.length;

    if (!APPLY || (!going.length && !rowWork)) {
        if (!APPLY) console.log('Dry run — nothing changed. Add --apply to back up and drop.');
        await conn.end();
        return;
    }

    // Backup first.
    const dir = path.join(__dirname, '..', '..', '..', '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(dir, `v2-cleanup-${process.env.DB_NAME}-${PROD ? 'prod' : 'local'}-${stamp}.json`);
    const backup = { database: process.env.DB_NAME, host: process.env.DB_HOST, taken_at: new Date().toISOString(), tables: {} };
    for (const t of going) {
        const [[create]] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
        const [rows] = await conn.query(`SELECT * FROM \`${t}\``);
        if (rows.length !== counts[t]) throw new Error(`Backup of ${t} read ${rows.length} rows, expected ${counts[t]} — stopped, nothing dropped.`);
        backup.tables[t] = { create: create['Create Table'], rows };
    }
    backup.deleted_rows = { modules: deadMods, permissions: deadPerms, role_permissions: deadGrants };
    fs.writeFileSync(file, JSON.stringify(backup));
    const check = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Object.keys(check.tables).length !== going.length) throw new Error('Backup file did not read back — stopped, nothing dropped.');
    console.log(`\nBackup written: ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of going) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    if (rowWork) {
        await conn.beginTransaction();
        if (permIds.length) {
            const pp = permIds.map(() => '?').join(',');
            await conn.query(`DELETE FROM role_permissions WHERE permission_id IN (${pp})`, permIds);
            await conn.query(`DELETE FROM permissions WHERE id IN (${pp})`, permIds);
        }
        if (modIds.length) await conn.query(`DELETE FROM modules WHERE id IN (${modIds.map(() => '?').join(',')})`, modIds);
        await conn.commit();
        console.log(`✓ ${deadMods.length} modules, ${deadPerms.length} permissions, ${deadGrants.length} role grants deleted.`);
    }

    const [after] = await conn.query('SELECT TABLE_NAME AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
    const left = TABLES.filter((t) => after.some((r) => r.t.toLowerCase() === t));
    console.log(left.length ? `✗ still there: ${left.join(', ')}` : `✓ ${going.length} tables dropped. ${after.length} tables remain.`);
    await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
