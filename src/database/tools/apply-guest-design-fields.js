#!/usr/bin/env node
/**
 * Guests web design (2026-11-04): adds the guest columns the portal's Add Guest form and
 * action panels save — and the RSVP board's answer for a guest who has not joined (rsvp_*) (src/database/migrations/sql/20261104-guest-design-fields.sql).
 * Re-runnable — only the missing columns are added, in one ALTER.
 *
 *   node src/database/tools/apply-guest-design-fields.js                 dry run, local
 *   node src/database/tools/apply-guest-design-fields.js --apply         local
 *   node src/database/tools/apply-guest-design-fields.js --prod          dry run, production
 *   node src/database/tools/apply-guest-design-fields.js --prod --apply  production
 *
 * ⚠ ORDER on production: run this BEFORE pushing the backend (the Guest model reads every column).
 */

require('dotenv').config();
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

// In table order: each AFTER names the one before it.
const COLUMNS = [
    ['guest_type', "`guest_type` varchar(20) NOT NULL DEFAULT 'individual' AFTER `photo`"],
    ['side', "`side` enum('groom','bride') DEFAULT NULL AFTER `guest_type`"],
    ['invite_count', "`invite_count` smallint unsigned NOT NULL DEFAULT '1' AFTER `side`"],
    ['rsvp_required', "`rsvp_required` tinyint(1) NOT NULL DEFAULT '1' AFTER `invite_count`"],
    ['is_visible', "`is_visible` tinyint(1) NOT NULL DEFAULT '1' AFTER `rsvp_required`"],
    ['hidden_reason', '`hidden_reason` varchar(60) DEFAULT NULL AFTER `is_visible`'],
    ['hidden_note', '`hidden_note` varchar(500) DEFAULT NULL AFTER `hidden_reason`'],
    ['is_vip', "`is_vip` tinyint(1) NOT NULL DEFAULT '0' AFTER `hidden_note`"],
    ['vip_category', '`vip_category` varchar(60) DEFAULT NULL AFTER `is_vip`'],
    ['vip_label', '`vip_label` varchar(60) DEFAULT NULL AFTER `vip_category`'],
    ['vip_highlight', '`vip_highlight` json DEFAULT NULL AFTER `vip_label`'],
    ['invite_channels', '`invite_channels` json DEFAULT NULL AFTER `vip_highlight`'],
    ['invite_message', '`invite_message` varchar(1000) DEFAULT NULL AFTER `invite_channels`'],
    // RSVP board (2026-11-04): the organizer's answer for a guest who has not joined
    // (a joined guest's answer lives on their event_participants row), + hide / decline reason.
    ['rsvp_response', "`rsvp_response` enum('yes','no','maybe') DEFAULT NULL AFTER `invite_message`"],
    ['rsvp_attending', '`rsvp_attending` smallint unsigned DEFAULT NULL AFTER `rsvp_response`'],
    ['rsvp_meal', '`rsvp_meal` varchar(255) DEFAULT NULL AFTER `rsvp_attending`'],
    ['rsvp_note', '`rsvp_note` varchar(500) DEFAULT NULL AFTER `rsvp_meal`'],
    ['rsvp_decline_reason', '`rsvp_decline_reason` varchar(60) DEFAULT NULL AFTER `rsvp_note`'],
    ['rsvp_responded_at', '`rsvp_responded_at` datetime DEFAULT NULL AFTER `rsvp_decline_reason`'],
    ['rsvp_hidden', "`rsvp_hidden` tinyint(1) NOT NULL DEFAULT '0' AFTER `rsvp_responded_at`"],
    ['rsvp_hidden_reason', '`rsvp_hidden_reason` varchar(60) DEFAULT NULL AFTER `rsvp_hidden`'],
];

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
            `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'guests'`,
            [process.env.DB_NAME],
        );
        const have = new Set(rows.map((r) => r.c));
        const missing = COLUMNS.filter(([name]) => !have.has(name));
        for (const [name] of COLUMNS) {
            console.log(have.has(name)
                ? `  = guests.${name}   already there`
                : `  + guests.${name}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
        }
        if (missing.length && APPLY) {
            // One ALTER — prod is ~370 ms a query.
            await conn.query(`ALTER TABLE guests ${missing.map(([, sql]) => `ADD COLUMN ${sql}`).join(', ')}`);
        }
        console.log('\nDone.\n');
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
});
