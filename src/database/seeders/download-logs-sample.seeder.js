/**
 * Sample data for the Files Downloaded list (client portal → QR Code → File Downloads, 2026-11-16).
 *
 *   node src/database/seeders/download-logs-sample.seeder.js --event 22                 dry run, local
 *   node src/database/seeders/download-logs-sample.seeder.js --event 22 --apply         local
 *   node src/database/seeders/download-logs-sample.seeder.js --prod --event 37 --apply  production
 *   … add --clear to undo (only the rows this seeder wrote)
 *
 * ONE event (--event, required). Uses that event's EXISTING files (Downloads) and EXISTING
 * participants — it creates neither. Writes event_download_logs rows with source = 'sample', spread
 * over the last few days, mostly completed with a few failed, on mobile / desktop. --clear deletes
 * exactly the source = 'sample' rows of that event; real downloads (source = 'app') are never touched.
 */
require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const APPLY = args.includes('--apply');
const CLEAR = args.includes('--clear');
const EVENT = Number(args[args.indexOf('--event') + 1]) || 0;

if (PROD) {
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });
}

const DEVICES = [['mobile', 'Android'], ['mobile', 'iOS'], ['desktop', 'Windows'], ['mobile', 'Android'], ['desktop', 'macOS'], ['tablet', 'iOS']];
const FAIL_REASONS = ['Network connection lost', 'Download interrupted', 'Storage full on the device'];

(async () => {
    if (!EVENT) { console.error('\n✗ Please name the event: --event <id>\n'); process.exit(1); }
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER,
        password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}${CLEAR ? '  --clear' : ''}\n`);
    try {
        const [[event]] = await conn.query(
            `SELECT e.id, e.name, c.name owner, c.email FROM events e LEFT JOIN website_clients c ON c.id = e.website_client_id
             WHERE e.id = ? AND e.deleted_at IS NULL`, [EVENT]);
        if (!event) throw new Error(`Event #${EVENT} not found.`);
        console.log(`  Event #${event.id} "${event.name}" — owner ${event.owner} <${event.email}>\n`);

        if (CLEAR) {
            const [[n]] = await conn.query(`SELECT COUNT(*) n FROM event_download_logs WHERE event_id = ? AND source = 'sample'`, [EVENT]);
            console.log(`  ${n.n} sample download row(s) ${APPLY ? 'deleted' : 'WOULD be deleted'}`);
            if (APPLY && n.n) await conn.query(`DELETE FROM event_download_logs WHERE event_id = ? AND source = 'sample'`, [EVENT]);
            console.log('\nDone.\n');
            return;
        }

        const [files] = await conn.query(`SELECT id, title, file_name FROM event_downloads WHERE event_id = ? ORDER BY sort_order, id`, [EVENT]);
        const [people] = await conn.query(
            `SELECT id, name, participant_client_id FROM event_participants
             WHERE event_id = ? AND deleted_at IS NULL AND is_hidden = 0 AND is_blocked = 0 ORDER BY id LIMIT 12`, [EVENT]);
        if (!files.length) throw new Error('This event has no files in Downloads — upload one in the portal first.');
        if (!people.length) throw new Error('This event has no participants.');
        console.log(`  ${files.length} file(s): ${files.map((f) => f.title).join(', ')}`);
        console.log(`  ${people.length} participant(s)\n`);

        // Each participant downloads 1–3 files; every 6th download fails. Times over the last 3 days.
        const rows = [];
        let k = 0;
        people.forEach((p, i) => {
            const howMany = 1 + (i % 3);
            for (let j = 0; j < howMany; j += 1) {
                const f = files[(i + j) % files.length];
                const [device, platform] = DEVICES[k % DEVICES.length];
                const failed = k % 6 === 5;
                const at = new Date(Date.now() - (k * 97 + 13) * 60 * 1000);
                rows.push([EVENT, f.id, p.id, p.participant_client_id || null, device, platform, failed ? 'failed' : 'completed',
                    failed ? FAIL_REASONS[k % FAIL_REASONS.length] : null, 'sample', at, at, at]);
                console.log(`  ${APPLY ? '+' : '~'} ${p.name.padEnd(22).slice(0, 22)} ${f.title.padEnd(26).slice(0, 26)} ${device.padEnd(8)} ${failed ? 'FAILED   ' : 'completed'} ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
                k += 1;
            }
        });
        if (APPLY) {
            await conn.query(
                `INSERT INTO event_download_logs (event_id, download_id, participant_id, participant_client_id, device, platform, status,
                   failed_reason, source, downloaded_at, created_at, updated_at) VALUES ?`, [rows]);
        }
        console.log(`\n  ${rows.length} download row(s) ${APPLY ? 'written' : 'would be written'}.`);
        console.log(`\n${APPLY ? 'Done.' : 'Dry run — add --apply to write.'}\n`);
    } finally {
        await conn.end();
    }
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
