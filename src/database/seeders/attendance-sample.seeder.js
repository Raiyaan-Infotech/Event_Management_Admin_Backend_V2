/**
 * Sample data for the Event Attendance list (client portal → QR Code → Event Attendance, 2026-11-16).
 *
 *   node src/database/seeders/attendance-sample.seeder.js --event 22                 dry run, local
 *   node src/database/seeders/attendance-sample.seeder.js --event 22 --apply         local
 *   node src/database/seeders/attendance-sample.seeder.js --prod --event 37          dry run, production
 *   node src/database/seeders/attendance-sample.seeder.js --prod --event 37 --apply  production
 *   … add --clear to undo (only the rows this seeder marked)
 *
 * ── ONE EVENT, NAMED BY ID ──────────────────────────────────────────────────
 * It only touches the EXISTING participants of the event given with --event (required). It never
 * creates people — on production that would put invented guests on a real account. Use a test
 * event (live: #37, the QA account's).
 *
 * ── WHAT IT WRITES ──────────────────────────────────────────────────────────
 * Participants that have no check-in and no verification yet get a mix the list can show:
 * Event QR + verified (QR), Event QR + verified (manual), manual check-in + pending, self check-in
 * link + verified (QR), and verified-only (not attended). Times are spread over the last hours.
 * The last participant is left alone (Not Attended + Pending → not in the list).
 *
 * ── EVERY ROW IT TOUCHES IS MARKED, SO --clear IS EXACT ─────────────────────
 * check_in_note / verify_note = '[sample]'. --clear resets only rows bearing that mark and never
 * touches a real check-in or verification.
 */
require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const APPLY = args.includes('--apply');
const CLEAR = args.includes('--clear');
const EVENT = Number(args[args.indexOf('--event') + 1]) || 0;
const MARK = '[sample]';

if (PROD) {
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });
}

// [source, verify method] per participant, in order. null = leave that part empty.
const PLAN = [
    ['event_qr', 'qr'],
    ['event_qr', 'manual'],
    ['manual', null],
    ['self_link', 'qr'],
    [null, 'manual'],
    ['event_qr', 'qr'],
    ['event_qr', null],
    ['self_link', null],
];

(async () => {
    if (!EVENT) {
        console.error('\n✗ Please name the event: --event <id>\n');
        process.exit(1);
    }
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}${CLEAR ? '  --clear' : ''}\n`);
    try {
        const [[event]] = await conn.query(
            `SELECT e.id, e.name, e.website_client_id, c.name AS owner, c.email
             FROM events e LEFT JOIN website_clients c ON c.id = e.website_client_id
             WHERE e.id = ? AND e.deleted_at IS NULL`, [EVENT]);
        if (!event) throw new Error(`Event #${EVENT} not found.`);
        console.log(`  Event #${event.id} "${event.name}" — owner ${event.owner} <${event.email}>\n`);

        if (CLEAR) {
            const [[n]] = await conn.query(
                `SELECT COUNT(*) AS n FROM event_participants WHERE event_id = ? AND (check_in_note = ? OR verify_note = ?)`,
                [EVENT, MARK, MARK]);
            console.log(`  ${n.n} sample row(s) ${APPLY ? 'reset' : 'WOULD be reset'}`);
            if (APPLY && n.n) {
                await conn.query(
                    `UPDATE event_participants SET checked_in_at = NULL, checked_in_by_client_id = NULL, checked_in_by_name = NULL,
                       check_in_source = NULL, check_in_note = NULL
                     WHERE event_id = ? AND check_in_note = ?`, [EVENT, MARK]);
                await conn.query(
                    `UPDATE event_participants SET verified_at = NULL, verified_by_client_id = NULL, verified_by_name = NULL,
                       verify_method = NULL, verify_note = NULL
                     WHERE event_id = ? AND verify_note = ?`, [EVENT, MARK]);
            }
            console.log('\nDone.\n');
            return;
        }

        // Only participants with nothing recorded yet — a real check-in / verification is never overwritten.
        const [rows] = await conn.query(
            `SELECT id, name FROM event_participants
             WHERE event_id = ? AND deleted_at IS NULL AND is_hidden = 0 AND is_blocked = 0
               AND checked_in_at IS NULL AND verified_at IS NULL
             ORDER BY id`, [EVENT]);
        if (!rows.length) { console.log('  No participants without attendance — nothing to do.\n'); return; }
        const take = rows.length > 1 ? rows.slice(0, Math.min(rows.length - 1, PLAN.length)) : rows;
        const now = Date.now();
        for (const [i, p] of take.entries()) {
            const [source, method] = PLAN[i];
            const checkedAt = source ? new Date(now - (take.length - i) * 37 * 60 * 1000) : null;
            const verifiedAt = method ? new Date((checkedAt ? checkedAt.getTime() : now - 90 * 60 * 1000) + 3 * 60 * 1000) : null;
            console.log(`  ${APPLY ? '+' : '~'} #${p.id} ${p.name.padEnd(24).slice(0, 24)}  ${source ? `checked in (${source}) ${checkedAt.toISOString().slice(11, 16)} UTC` : 'not attended'.padEnd(30)}   ${method ? `verified (${method})` : 'pending'}`);
            if (APPLY) {
                await conn.query(
                    `UPDATE event_participants SET
                       checked_in_at = ?, checked_in_by_client_id = ?, checked_in_by_name = ?, check_in_source = ?, check_in_note = ?,
                       verified_at = ?, verified_by_client_id = ?, verified_by_name = ?, verify_method = ?, verify_note = ?
                     WHERE id = ? AND checked_in_at IS NULL AND verified_at IS NULL`,
                    [
                        checkedAt, source ? event.website_client_id : null, source ? event.owner : null, source, source ? MARK : null,
                        verifiedAt, method ? event.website_client_id : null, method ? event.owner : null, method, method ? MARK : null,
                        p.id,
                    ]);
            }
        }
        if (rows.length > take.length) console.log(`\n  ${rows.length - take.length} participant(s) left as Not Attended + Pending (not in the list).`);
        console.log(`\n${APPLY ? 'Done.' : 'Dry run — add --apply to write.'}\n`);
    } finally {
        await conn.end();
    }
})().catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
});
