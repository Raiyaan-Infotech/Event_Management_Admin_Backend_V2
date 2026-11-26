/**
 * Organizer Message Templates (Super Admin → Message Templates), one per organizer trigger in
 * src/config/notificationCatalog.json that has suggested Email wording (Jamal, 2026-11-26:
 * "Transactional Template Master" wording). Each row gets the trigger, Email + In-App content.
 *
 *   node src/database/seeders/organizer-message-templates.seeder.js                 dry run, local
 *   node src/database/seeders/organizer-message-templates.seeder.js --apply         local
 *   node src/database/seeders/organizer-message-templates.seeder.js --prod          dry run, production
 *   node src/database/seeders/organizer-message-templates.seeder.js --prod --apply  production
 *   … add --clear to remove only the rows this seeder created (marked in description)
 *
 * Re-runnable: a trigger that already has a template is skipped (never overwritten).
 * Triggers waiting for a missing feature (waiting_for) or sent by hand (send_mode) are created
 * INACTIVE (draft); the rest active. Rows go through notificationTemplate.service create(), so the
 * normal validation and variables_used apply.
 */
const path = require('path');

const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const APPLY = args.includes('--apply');
const CLEAR = args.includes('--clear');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', PROD ? '.env.production' : '.env'), override: true });
if (PROD) process.env.NODE_ENV = 'production';

const { sequelize, NotificationTemplate } = require('../../models');
const service = require('../../services/notificationTemplate.service');
const catalog = require('../../config/notificationCatalog.json');

const MARK = 'Organizer transactional template (Template Master, 2026-11-26).';
const COMPANY_ID = 1;

const nameOf = (t) => t.label.replace(/\s*\([^)]*\)\s*$/, '').trim();

/** Channels = Jamal's ticks in the catalogue (in-app always goes with push). */
const payloadOf = (t) => {
    const e = t.suggested.email;
    const i = t.channels.includes('in_app') ? t.suggested.in_app : null;
    const w = t.channels.includes('whatsapp') ? t.suggested.whatsapp : null;
    const channels = ['email', ...(w ? ['whatsapp'] : []), ...(i ? ['in_app', 'push'] : [])];
    return {
        ...(w ? {
            whatsapp_template_name: w.template_name,
            whatsapp_category: w.category,
            whatsapp_header_type: w.header_type || 'none',
            whatsapp_header_text: w.header_text || null,
            whatsapp_body: w.body,
            whatsapp_footer: w.footer || null,
            whatsapp_buttons: w.buttons || [],
        } : {}),
        name: nameOf(t),
        template_type: 'transactional',
        description: MARK,
        trigger_key: t.key,
        channels,
        is_active: t.waiting_for || t.send_mode ? 0 : 1,
        email_subject: e.subject,
        email_preheader: e.preheader,
        email_heading: e.heading,
        email_body: e.body,
        email_button_label: e.button_label,
        email_button_url: e.button_url,
        email_footer: e.footer,
        title: i ? i.title : null,
        content: i ? i.content : null,
    };
};

(async () => {
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME}  ${APPLY ? '(APPLY)' : '(dry run)'}${CLEAR ? '  CLEAR' : ''}\n`);

    if (CLEAR) {
        const rows = await NotificationTemplate.findAll({ where: { description: MARK }, attributes: ['id', 'name', 'trigger_key'] });
        for (const r of rows) {
            console.log(`  - #${r.id} ${r.name} (${r.trigger_key}) ${APPLY ? 'removed' : 'WOULD remove'}`);
            if (APPLY) await service.updateStatus(r.id, 0).then(() => service.deleteById(r.id));
        }
        console.log(`\n${rows.length} row(s).\n`);
        return;
    }

    const wanted = catalog.triggers.filter((t) => t.section.startsWith('A') && t.suggested && t.suggested.email);
    const existing = await NotificationTemplate.findAll({
        where: { trigger_key: wanted.map((t) => t.key) }, attributes: ['id', 'trigger_key'], paranoid: false,
    });
    const taken = new Map(existing.map((r) => [r.trigger_key, r.id]));

    let created = 0;
    for (const t of wanted) {
        const p = payloadOf(t);
        if (taken.has(t.key)) {
            console.log(`  = ${t.key.padEnd(34)} already has template #${taken.get(t.key)}`);
            continue;
        }
        console.log(`  + ${t.key.padEnd(34)} "${p.name}"  [${p.channels.join(', ')}]  ${p.is_active ? 'active' : 'draft'}`);
        if (APPLY) {
            await service.create(p, null, COMPANY_ID);
            created += 1;
        }
    }
    console.log(`\n${APPLY ? `Created ${created}` : 'Dry run'} - ${wanted.length} organizer triggers with email wording.\n`);
})()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
