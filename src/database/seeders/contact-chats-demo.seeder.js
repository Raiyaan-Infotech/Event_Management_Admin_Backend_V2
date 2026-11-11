#!/usr/bin/env node
/**
 * Sample Contact Messages (2026-11-11) — participants' questions to the event's contact person, so the
 * portal's Contact page (Jamal's 8 screens) has a real inbox to check: unread, awaiting reply, resolved
 * with two inquiries, never answered (with the offline auto reply) and blocked.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 * Takes the event's participants who use the app (participant_client_id set), sorted by name, and gives
 * the first four one conversation each (back-dated over the last three days). The rest are left alone,
 * so a browser test can still start a NEW conversation with one of them.
 * Re-runnable: those four participants' chats on this event are deleted first and re-made, and so are
 * the event's "removed" chats (left by earlier tests).
 *
 *   node src/database/seeders/contact-chats-demo.seeder.js                          dry run, local, event 37
 *   node src/database/seeders/contact-chats-demo.seeder.js --event 86 --apply       local
 *   node src/database/seeders/contact-chats-demo.seeder.js --prod                   dry run, production
 *   node src/database/seeders/contact-chats-demo.seeder.js --prod --apply           production (QA event 37)
 *
 * Needs tools/apply-contact-inquiries.js applied. Use it on test events only.
 */
require('dotenv').config();
const path = require('path');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod');
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const EVENT_ID = Number(opt('--event', 37));
if (PROD) require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });

const { Sequelize, sequelize, Event, EventParticipant, EventContactChat } = require('../../models');

const { Op } = Sequelize;
const H = 3600 * 1000;
const AUTO_REPLY = 'Thanks for contacting us. We are currently offline and will reply soon.';
const RESOLVED_NOTE = 'Your inquiry has been marked as resolved. Write to us again any time if you need more help.';

/**
 * One conversation per scenario. m = [side, hoursAgo, body, auto?]; inquiries = [openedHoursAgo,
 * resolvedHoursAgo | null, type, note]. `chat` = the chat row's own fields.
 */
const SCENARIOS = [
    {
        label: 'open, awaiting reply, 2 unread',
        m: [
            ['participant', 26, 'Hi, is parking available near the venue for the wedding?'],
            ['team', 25.5, 'Hello! Yes, there is free parking behind the hall for about 80 cars. Our volunteers will guide you.'],
            ['participant', 0.6, 'Thank you! Could you please share the entrance directions?'],
            ['participant', 0.5, 'We are coming from Tirunelveli town by car.'],
        ],
        inquiries: [[26, null]],
        chat: { status: 'open', team_unread: 2, awaiting: 0.6, reply_count: 1, reply_seconds: 1800 },
    },
    {
        label: 'resolved, 2 inquiries',
        m: [
            ['participant', 72, 'Is there a dress code for the reception?'],
            ['team', 71, 'Traditional or semi-formal is perfect. Pastel colours are welcome!'],
            ['participant', 30, 'Will there be vegetarian food at the reception?'],
            ['team', 29, 'Yes, a full vegetarian counter is planned.'],
            ['participant', 28.8, 'Perfect, thank you so much!'],
            ['team', 28.7, RESOLVED_NOTE, true],
        ],
        inquiries: [[72, 70, 'Question answered', 'Dress code shared.'], [30, 28.7, 'Information shared', 'Veg counter confirmed with the caterer.']],
        chat: { status: 'resolved', team_unread: 0, awaiting: null, reply_count: 2, reply_seconds: 7200 },
    },
    {
        label: 'never answered, 3 unread (auto reply sent)',
        m: [
            ['participant', 50, 'Hello, I could not open the location link in the app.'],
            ['team', 50, AUTO_REPLY, true],
            ['participant', 49.9, 'Could you share the venue address here?'],
            ['participant', 2, 'Still waiting for the address, please.'],
        ],
        inquiries: [[50, null]],
        chat: { status: 'open', team_unread: 3, awaiting: 50, reply_count: 0, reply_seconds: 0 },
    },
    {
        label: 'blocked until the event ends',
        m: [
            ['participant', 40, 'Can I bring 6 extra people with me?'],
            ['team', 39, 'Sorry, seats are limited to the people on your invitation.'],
            ['participant', 38.5, 'Please add them, it is important.'],
            ['participant', 38.4, 'Please add them, it is important.'],
            ['participant', 38.3, 'Please add them!!!'],
        ],
        inquiries: [[40, null]],
        chat: {
            status: 'blocked', team_unread: 0, awaiting: null, reply_count: 1, reply_seconds: 3600,
            block_reason: 'Spam or repeated messages', block_note: 'Sent the same request many times.', block_duration: 'event_end', blocked: 37,
        },
    },
];

(async () => {
    const at = (h) => new Date(Date.now() - h * H);
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  event #${EVENT_ID}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);
    try {
        const event = await Event.findByPk(EVENT_ID, { attributes: ['id', 'name', 'organizer'] });
        if (!event) throw new Error(`Event #${EVENT_ID} not found.`);
        const rows = await EventParticipant.findAll({
            where: { event_id: EVENT_ID, participant_client_id: { [Op.ne]: null }, is_blocked: false },
            attributes: ['participant_client_id', 'name'],
            order: [['name', 'ASC'], ['id', 'ASC']],
            raw: true,
        });
        const people = [...new Map(rows.map((r) => [Number(r.participant_client_id), r])).values()];
        console.log(`  "${event.name}" — contact person: ${event.organizer || '(none)'} — ${people.length} app participants`);
        if (people.length < SCENARIOS.length) throw new Error(`Needs at least ${SCENARIOS.length} app participants on the event.`);
        const picked = people.slice(0, SCENARIOS.length);
        picked.forEach((p, i) => console.log(`  ${APPLY ? '+' : '~'} ${p.name.padEnd(22)} ${SCENARIOS[i].label}`));
        people.slice(SCENARIOS.length).forEach((p) => console.log(`  = ${p.name.padEnd(22)} left without a chat (for New Message tests)`));
        if (!APPLY) {
            console.log('\nRe-run with --apply to write it.\n');
            return;
        }

        await sequelize.transaction(async (transaction) => {
            const ids = picked.map((p) => Number(p.participant_client_id));
            const gone = await EventContactChat.destroy({
                where: { event_id: EVENT_ID, [Op.or]: [{ participant_client_id: ids }, { status: 'removed' }] },
                transaction,
            });
            console.log(`\n  - ${gone} old chat(s) removed (messages + inquiries go with them)`);
            const qi = sequelize.getQueryInterface();
            for (let i = 0; i < picked.length; i += 1) {
                const s = SCENARIOS[i];
                const pid = Number(picked[i].participant_client_id);
                const last = s.m[s.m.length - 1];
                const c = s.chat;
                await qi.bulkInsert('event_contact_chats', [{
                    event_id: EVENT_ID,
                    participant_client_id: pid,
                    status: c.status,
                    last_message: last[2].slice(0, 250),
                    last_message_at: at(last[1]),
                    team_unread: c.team_unread,
                    participant_unread: 0,
                    awaiting_since: c.awaiting === null ? null : at(c.awaiting),
                    reply_count: c.reply_count,
                    reply_seconds: c.reply_seconds,
                    block_reason: c.block_reason || null,
                    block_note: c.block_note || null,
                    block_duration: c.block_duration || null,
                    blocked_at: c.blocked ? at(c.blocked) : null,
                    created_at: at(s.m[0][1]),
                    updated_at: new Date(),
                }], { transaction });
                const chat = await EventContactChat.findOne({ where: { event_id: EVENT_ID, participant_client_id: pid }, attributes: ['id'], transaction });
                await qi.bulkInsert('event_contact_chat_messages', s.m.map(([side, h, body, auto]) => ({
                    chat_id: chat.id,
                    sender_side: side,
                    sender_client_id: side === 'participant' ? pid : 0,
                    body,
                    is_auto: auto ? 1 : 0,
                    created_at: at(h),
                })), { transaction });
                await qi.bulkInsert('event_contact_inquiries', s.inquiries.map(([opened, resolved, type, note]) => ({
                    chat_id: chat.id,
                    event_id: EVENT_ID,
                    first_message: (s.m.find(([side, h]) => side === 'participant' && h <= opened)?.[2] || '').slice(0, 250),
                    opened_at: at(opened),
                    resolved_at: resolved === null || resolved === undefined ? null : at(resolved),
                    resolution_type: type || null,
                    resolution_note: note || null,
                    created_at: at(opened),
                    updated_at: new Date(),
                })), { transaction });
                console.log(`  + chat #${chat.id}  ${picked[i].name}  (${s.m.length} messages, ${s.inquiries.length} inquir${s.inquiries.length === 1 ? 'y' : 'ies'})`);
            }
        });
        console.log('\nDone.\n');
    } finally {
        await sequelize.close();
    }
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
