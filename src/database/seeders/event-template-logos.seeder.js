/**
 * Sample Event Logo for every invitation template (Jamal, 2026-11-17).
 *
 *      node src/database/seeders/event-template-logos.seeder.js                 (local)
 *      node src/database/seeders/event-template-logos.seeder.js --force         (also templates that have a logo)
 *      node src/database/seeders/event-template-logos.seeder.js --prod          (dry run)
 *      node src/database/seeders/event-template-logos.seeder.js --prod --apply
 *
 * Gives each template a SAMPLE logo — two interlocking rings with small rays, a
 * monogram like the one in Jamal's splash design — drawn in the template's own
 * accent colour (frame colour, else secondary colour, else gold), and puts it at
 * the TOP of the card at 100%. The admin replaces it per template on Step 2 →
 * Event Logo.
 *
 * Generated SVG with a transparent background (a logo sits OVER the card), one
 * file per colour, uploaded through the real media service so it lands where
 * the admin panel's own uploads land.
 *
 * Needs the columns from src/database/tools/apply-template-logo.js.
 * Idempotent — templates that already have a logo are skipped unless --force.
 */

require('dotenv').config({
    path: process.argv.includes('--prod') ? '.env.production' : '.env',
});

const db = require('../../models');
const mediaService = require('../../services/media.service');

const FORCE = process.argv.includes('--force');
const PROD = process.argv.includes('--prod');
const APPLY = process.argv.includes('--apply');
const TARGET = PROD ? 'PRODUCTION' : 'LOCAL';
const COMPANY_ID = 1;
const DRY = PROD && !APPLY;

const POSITION = 'top';
const SIZE = 100;

const HEX = /^#([0-9a-f]{6})$/i;

/** Two interlocking rings with rays — transparent background. */
const ringsSvg = (colour) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200" width="240" height="200">
  <g fill="none" stroke="${colour}" stroke-linecap="round">
    <circle cx="94" cy="118" r="50" stroke-width="10"/>
    <circle cx="146" cy="118" r="50" stroke-width="10"/>
    <path d="M120 40 V18" stroke-width="5"/>
    <path d="M98 46 L86 28" stroke-width="5"/>
    <path d="M142 46 L154 28" stroke-width="5"/>
    <path d="M78 58 L60 46" stroke-width="4"/>
    <path d="M162 58 L180 46" stroke-width="4"/>
    <path d="M30 118 H10" stroke-width="4"/>
    <path d="M210 118 H230" stroke-width="4"/>
  </g>
  <path d="M120 62 l7 10 l-7 10 l-7 -10 z" fill="${colour}"/>
</svg>`;

const accentOf = (t) => {
    for (const v of [t.frame_color, t.secondary_color]) {
        if (typeof v === 'string' && HEX.test(v)) return v.toUpperCase();
    }
    return '#C9A227';
};

(async () => {
    console.log(`\n  ${TARGET}${DRY ? ' — DRY RUN (re-run with --apply to write)' : ''}\n`);

    // Paranoid model: deleted templates are left out.
    const templates = await db.EventTemplate.findAll({
        attributes: ['id', 'name', 'code', 'frame_color', 'secondary_color', 'logo_image'],
        order: [['id', 'ASC']],
    });

    const urlByColour = new Map();
    let updated = 0;
    let skipped = 0;

    for (const t of templates) {
        if (t.logo_image && !FORCE) {
            console.log(`    skip    #${t.id} ${t.name} (has a logo)`);
            skipped += 1;
            continue;
        }
        const colour = accentOf(t);
        if (DRY) {
            console.log(`    would   #${t.id} ${t.name}  logo ${colour}, ${POSITION}, ${SIZE}%`);
            continue;
        }
        let url = urlByColour.get(colour);
        if (!url) {
            const buffer = Buffer.from(ringsSvg(colour), 'utf8');
            const result = await mediaService.upload(
                {
                    buffer,
                    mimetype: 'image/svg+xml',
                    size: buffer.length,
                    originalname: `sample-logo-rings-${colour.slice(1).toLowerCase()}.svg`,
                },
                { folder: 'template-logos' },
                COMPANY_ID,
            );
            url = result.url;
            urlByColour.set(colour, url);
            console.log(`    upload  ${colour} -> ${url}`);
        }
        await db.EventTemplate.update(
            { logo_image: url, logo_position: POSITION, logo_size: SIZE },
            { where: { id: t.id }, silent: true },
        );
        console.log(`    set     #${t.id} ${t.name}`);
        updated += 1;
    }

    console.log(`\n  templates: ${templates.length} · ${DRY ? 'would set' : 'set'} ${DRY ? templates.length - skipped : updated} · skipped ${skipped}\n`);
    process.exit(0);
})().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
});
