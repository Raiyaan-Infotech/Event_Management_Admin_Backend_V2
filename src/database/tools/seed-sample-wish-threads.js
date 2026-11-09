#!/usr/bin/env node
/**
 * Sample Wed Wishes conversations for one event (2026-11-09, Jamal's chat design) — so the
 * organizer's chat view has something to show. Uses the five "(Sample)" client accounts
 * (mobiles 9000000001 / 9000000011–14): each becomes a participant of the event (notes = MARKER)
 * and posts wishes; the organizer replies to some; a few likes; one wish hidden, one pending review.
 * Nothing is marked read, so every conversation starts Unread.
 *
 *   node src/database/tools/seed-sample-wish-threads.js --event 36                 dry run, local
 *   node src/database/tools/seed-sample-wish-threads.js --event 36 --apply         local
 *   node src/database/tools/seed-sample-wish-threads.js --event 36 --prod --apply  production
 *   ... --remove                                                                   take the sample out again
 *
 * Re-runnable: a sample person who already has a participant row / wishes on the event is skipped.
 * --remove deletes only the sample accounts' participant rows (with MARKER) and their wishes on
 * this event (comments, likes and reports go with the wish), and the organizer's read marks for them.
 * Text only — no files are stored.
 */
require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod');
const REMOVE = args.includes('--remove');
const EVENT_ID = Number(args[args.indexOf('--event') + 1]) || 0;
if (PROD) require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });

const MARKER = 'Sample data (seed-sample-wish-threads)';
const HOUR = 3600 * 1000;
const ago = (hours) => new Date(Date.now() - hours * HOUR);

/** The sample people, by mobile, and what they say (hours ago). */
const PEOPLE = [
    {
        mobile: '9000000011', name: 'Aditi Sharma', gender: 'female', title: 'Ms.', side: 'bride', relationship: 'Friend',
        city: 'Bengaluru', state: 'Karnataka', rsvp: ['accepted', 'yes'], joined: 70,
        wishes: [
            { at: 50, msg: 'Wishing you both a lifetime of love and joy! ❤️', likes: 4, reply: { at: 49, msg: 'Thank you, Aditi! Your wishes mean a lot to us. 💐' }, back: { at: 48, msg: 'Can’t wait to see you both on the big day! 🥰' } },
            { at: 26, msg: 'Remember our college days? Now look at you getting married! So happy for you 🎉', likes: 2 },
            { at: 2, msg: 'The decorations look beautiful in the photos. Everything is so well planned! 🌸', likes: 1 },
        ],
    },
    {
        mobile: '9000000012', name: 'Rohan Verma', gender: 'male', title: 'Mr.', side: 'groom', relationship: 'Cousin',
        city: 'Chennai', state: 'Tamil Nadu', rsvp: ['accepted', 'yes'], joined: 60,
        wishes: [
            { at: 30, msg: 'May your journey together be filled with laughter, adventure and endless love. 🙏', likes: 3, reply: { at: 28, msg: 'Thanks Rohan! See you at the Nikah. 😊' } },
            { at: 20, msg: 'Bro, save me a seat near the food counter 😂', likes: 1, hidden: true },
        ],
    },
    {
        mobile: '9000000013', name: 'Neha Kapoor', gender: 'female', title: 'Ms.', side: 'bride', relationship: 'Colleague',
        city: 'Hyderabad', state: 'Telangana', rsvp: ['pending', 'maybe'], joined: 40,
        wishes: [
            { at: 12, msg: 'Congratulations to the beautiful couple! Wishing you a home full of happiness. ✨', likes: 2 },
            { at: 6, msg: 'Sorry I may not make it in person, but my heart is with you both. 💖', likes: 0, pending: true },
        ],
    },
    {
        mobile: '9000000014', name: 'Karan Malhotra', gender: 'male', title: 'Mr.', side: 'groom', relationship: 'Friend',
        city: 'Mumbai', state: 'Maharashtra', rsvp: ['accepted', 'yes'], joined: 55,
        wishes: [
            { at: 34, msg: 'Best wishes for a wonderful life together. You two are perfect for each other! 💍', likes: 3 },
            { at: 9, msg: 'The ceremony was wonderful! Everything was so beautifully organized. 👏', likes: 2, reply: { at: 8, msg: 'So glad you could come, Karan! 🤗' } },
        ],
    },
    {
        mobile: '9000000001', name: 'Rahul Sharma', gender: 'male', title: 'Mr.', side: 'groom', relationship: 'Uncle',
        city: 'Delhi', state: 'Delhi', rsvp: ['invited', 'none'], joined: 24,
        wishes: [
            { at: 1, msg: 'Blessings to you both. May Allah bless your union with love, peace and happiness. 🤲', likes: 1 },
        ],
    },
];

(async () => {
    if (!EVENT_ID) throw new Error('Please pass --event <id>.');
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD ?? process.env.DB_PASS,
        database: process.env.DB_NAME,
        charset: 'utf8mb4',
        // Dates go in as UTC, like the app writes them (without this, mysql2 writes the PC's local
        // time — IST put the sample 5½ h in the future and the wishes never stopped being Unread).
        timezone: 'Z',
        ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    const mode = REMOVE ? 'REMOVE' : 'SEED';
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${mode} event ${EVENT_ID}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);
    try {
        const [[event]] = await conn.query('SELECT id, name, website_client_id, company_id, organizer FROM events WHERE id = ? AND deleted_at IS NULL', [EVENT_ID]);
        if (!event) throw new Error(`Event ${EVENT_ID} not found.`);
        console.log(`  event "${event.name}", owner client ${event.website_client_id}`);
        const [clients] = await conn.query('SELECT id, name, mobile FROM website_clients WHERE mobile IN (?)', [PEOPLE.map((p) => p.mobile)]);
        const clientOf = new Map(clients.map((c) => [c.mobile, c]));
        const missing = PEOPLE.filter((p) => !clientOf.has(p.mobile));
        if (missing.length) console.log(`  ! no account for ${missing.map((p) => p.mobile).join(', ')} — skipped`);
        const ids = clients.map((c) => c.id);

        if (REMOVE) {
            if (!ids.length) { console.log('  nothing to remove'); return; }
            const [[w]] = await conn.query('SELECT COUNT(*) n FROM event_wishes WHERE event_id = ? AND author_client_id IN (?)', [EVENT_ID, ids]);
            const [[p]] = await conn.query('SELECT COUNT(*) n FROM event_participants WHERE event_id = ? AND participant_client_id IN (?) AND notes = ?', [EVENT_ID, ids, MARKER]);
            console.log(`  - ${w.n} sample wishes (with their comments / likes / reports), ${p.n} sample participants`);
            if (APPLY) {
                await conn.beginTransaction();
                await conn.query('DELETE FROM event_wishes WHERE event_id = ? AND author_client_id IN (?)', [EVENT_ID, ids]);
                await conn.query('DELETE FROM event_participants WHERE event_id = ? AND participant_client_id IN (?) AND notes = ?', [EVENT_ID, ids, MARKER]);
                await conn.query('DELETE FROM event_wish_reads WHERE event_id = ? AND thread_key IN (?)', [EVENT_ID, ids.map((id) => `c:${id}`)]);
                await conn.commit();
                console.log('  removed');
            }
            return;
        }

        const organizer = (event.organizer || '').trim() || 'Organizer';
        const plan = [];
        for (const person of PEOPLE) {
            const client = clientOf.get(person.mobile);
            if (!client) continue;
            const [[hasPart]] = await conn.query('SELECT id FROM event_participants WHERE event_id = ? AND participant_client_id = ? AND deleted_at IS NULL LIMIT 1', [EVENT_ID, client.id]);
            const [[hasWish]] = await conn.query('SELECT COUNT(*) n FROM event_wishes WHERE event_id = ? AND author_client_id = ?', [EVENT_ID, client.id]);
            plan.push({ person, client, hasPart: hasPart?.id || null, hasWishes: Number(hasWish.n) > 0 });
            console.log(`  ${hasPart ? '=' : '+'} participant ${person.name} (#${client.id})   ${hasWish.n > 0 ? `= already has ${hasWish.n} wishes, skipped` : `+ ${person.wishes.length} wishes`}`);
        }
        if (!APPLY) return;

        await conn.beginTransaction();
        for (const { person, client, hasPart, hasWishes } of plan) {
            if (!hasPart) {
                const [first, ...rest] = person.name.split(' ');
                await conn.query(
                    `INSERT INTO event_participants
                       (event_id, website_client_id, company_id, name, first_name, last_name, gender, title, dial_code, mobile,
                        party_size, rsvp_status, response_type, invite_source, invited_at, responded_at, notes, city, state, country,
                        relationship, rsvp_side, participant_client_id, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '+91', ?, 1, ?, ?, 'qr', ?, ?, ?, ?, ?, 'India', ?, ?, ?, ?, ?)`,
                    [EVENT_ID, event.website_client_id, event.company_id, person.name, first, rest.join(' ') || null, person.gender, person.title,
                        person.mobile, person.rsvp[0], person.rsvp[1], ago(person.joined), person.rsvp[1] === 'none' ? null : ago(person.joined - 1),
                        MARKER, person.city, person.state, person.relationship, person.side, client.id, ago(person.joined), ago(person.joined)],
                );
            }
            if (hasWishes) continue;
            for (const w of person.wishes) {
                const [res] = await conn.query(
                    `INSERT INTO event_wishes (event_id, website_client_id, company_id, author_client_id, post_type, audience, guest_name, mobile,
                       message, size_bytes, is_hidden, is_flagged, created_at, updated_at)
                     VALUES (?, ?, ?, ?, 'text', 'both', ?, ?, ?, 0, ?, ?, ?, ?)`,
                    [EVENT_ID, event.website_client_id, event.company_id, client.id, person.name, person.mobile, w.msg,
                        w.hidden || w.pending ? 1 : 0, w.pending ? 1 : 0, ago(w.at), ago(w.at)],
                );
                const wishId = res.insertId;
                // Likes from the other sample people (and the organizer).
                const likers = [event.website_client_id, ...plan.map((p) => p.client.id).filter((id) => id !== client.id)].slice(0, w.likes);
                for (const liker of likers) {
                    await conn.query('INSERT IGNORE INTO event_wish_likes (wish_id, client_id, created_at) VALUES (?, ?, ?)', [wishId, liker, ago(w.at - 0.5)]);
                }
                const comment = (by, c) => conn.query(
                    `INSERT INTO event_wish_comments (event_id, wish_id, website_client_id, author_client_id, guest_name, message, size_bytes,
                       is_hidden, is_flagged, company_id, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
                    [EVENT_ID, wishId, event.website_client_id, by, by ? person.name : organizer, c.msg, event.company_id, ago(c.at), ago(c.at)],
                );
                if (w.reply) await comment(null, w.reply);
                if (w.back) await comment(client.id, w.back);
            }
        }
        await conn.commit();
        console.log('\n  seeded');
    } catch (e) {
        await conn.rollback().catch(() => null);
        throw e;
    } finally {
        await conn.end();
    }
    console.log('\nDone.\n');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
