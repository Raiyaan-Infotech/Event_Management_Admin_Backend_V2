/**
 * Sample data for the Event Attendance list (client portal → QR Code → Event Attendance, 2026-11-16).
 *
 *   node src/database/seeders/attendance-sample.seeder.js --event 22                 dry run, local
 *   node src/database/seeders/attendance-sample.seeder.js --event 22 --apply         local
 *   node src/database/seeders/attendance-sample.seeder.js --prod --event 37          dry run, production
 *   node src/database/seeders/attendance-sample.seeder.js --prod --event 37 --apply  production
 *   … add --clear to undo (only the rows this seeder marked)
 *   --add-participants 6   first adds that many SAMPLE participants (for an event that has none yet)
 *
 * ── ONE EVENT, NAMED BY ID ──────────────────────────────────────────────────
 * It only touches the participants of the event given with --event (required). It creates people
 * ONLY with --add-participants N, asked for by the event's owner (Jamal, 2026-11-16, his own event
 * #39): sample names, NO mobile / email (nothing can be sent to a real number), notes '[sample]',
 * within the plan's participant limit. --clear deletes exactly those sample participants.
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
const ADD = args.includes('--add-participants') ? Math.min(20, Number(args[args.indexOf('--add-participants') + 1]) || 0) : 0;
const SAMPLE_PEOPLE = [
    ['Arjun Mehta', 'Friend', 'groom'], ['Sana Sheikh', 'Cousin', 'bride'], ['Vikram Rao', 'Colleague', 'groom'],
    ['Fathima Noor', 'Aunt', 'bride'], ['Rahul Nair', 'Friend', 'groom'], ['Ayesha Khan', 'Sister', 'bride'],
    ['Imran Ali', 'Uncle', 'groom'], ['Meena Pillai', 'Neighbour', 'bride'],
];
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
            `SELECT e.id, e.name, e.website_client_id, e.company_id, c.name AS owner, c.email
             FROM events e LEFT JOIN website_clients c ON c.id = e.website_client_id
             WHERE e.id = ? AND e.deleted_at IS NULL`, [EVENT]);
        if (!event) throw new Error(`Event #${EVENT} not found.`);
        console.log(`  Event #${event.id} "${event.name}" — owner ${event.owner} <${event.email}>\n`);

        if (CLEAR) {
            const [[n]] = await conn.query(
                `SELECT COUNT(*) AS n FROM event_participants WHERE event_id = ? AND (check_in_note = ? OR verify_note = ?)`,
                [EVENT, MARK, MARK]);
            console.log(`  ${n.n} sample row(s) ${APPLY ? 'reset' : 'WOULD be reset'}`);
            const [[sp]] = await conn.query(`SELECT COUNT(*) AS n FROM event_participants WHERE event_id = ? AND notes = ?`, [EVENT, MARK]);
            console.log(`  ${sp.n} sample participant(s) ${APPLY ? 'deleted' : 'WOULD be deleted'}`);
            if (APPLY && sp.n) await conn.query(`DELETE FROM event_participants WHERE event_id = ? AND notes = ?`, [EVENT, MARK]);
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

        if (ADD) {
            const [[plan]] = await conn.query(
                `SELECT sp.max_rsvp_per_event AS lim FROM events e LEFT JOIN subscription_plans sp ON sp.id = e.subscription_plan_id WHERE e.id = ?`, [EVENT]);
            const [[used]] = await conn.query(`SELECT COUNT(*) AS n FROM event_participants WHERE event_id = ?`, [EVENT]);
            const limit = plan && plan.lim != null ? Number(plan.lim) : null;
            const room = limit === null || limit <= 0 ? ADD : Math.max(0, limit - Number(used.n));
            const n = Math.min(ADD, room, SAMPLE_PEOPLE.length);
            console.log(`  Plan participant limit ${limit ?? 'none'}, used ${used.n} → adding ${n} sample participant(s)`);
            for (const [name, relationship, side] of SAMPLE_PEOPLE.slice(0, n)) {
                console.log(`  ${APPLY ? '+' : '~'} participant ${name} (${side === 'groom' ? "Groom's" : "Bride's"} ${relationship})`);
                if (APPLY) {
                    await conn.query(
                        `INSERT INTO event_participants (event_id, website_client_id, company_id, name, dial_code, rsvp_status, response_type,
                           invite_source, party_size, relationship, rsvp_side, notes, is_blocked, is_hidden, created_at, updated_at)
                         VALUES (?, ?, ?, ?, '+91', 'accepted', 'yes', 'manual', 1, ?, ?, ?, 0, 0, NOW(), NOW())`,
                        [EVENT, event.website_client_id, event.company_id, name, relationship, side, MARK]);
                }
            }
            console.log('');
            if (!APPLY && n) console.log('  (dry run: the sample participants are not created, so the attendance below cannot be shown yet)');
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
