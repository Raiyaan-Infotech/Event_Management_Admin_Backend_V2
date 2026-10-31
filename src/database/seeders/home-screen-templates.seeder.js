#!/usr/bin/env node
/**
 * Sample Home Screen Templates (2026-10-31) — five Wedding designs, one per
 * Template Style (Classic, Royal, Minimal, Traditional, Elegant), so the admin
 * list and the portal's Create Event picker have something real to show.
 *
 * ── THE ARTWORK IS A PLACEHOLDER ─────────────────────────────────────────────
 * Each template gets a generated SVG (gradient, arch, florals) in its own
 * colours, uploaded through the normal media service. It carries NO text: the
 * names, date, countdown and menu tiles are drawn over it by the app / the
 * previews. Replace an image any time from Admin → Template → Home Screen
 * Templates → Edit.
 *
 * ── WHAT IT CREATES ──────────────────────────────────────────────────────────
 * The five default styles in Home Screen Categories (Template → Home Screen
 * Categories) when missing, then the five templates. The event category
 * ("Wedding") must already exist — it is never created. A style or template whose
 * name already exists is left alone, so re-running adds nothing twice.
 *
 *   node src/database/seeders/home-screen-templates.seeder.js                  dry run, local
 *   node src/database/seeders/home-screen-templates.seeder.js --apply          local
 *   node src/database/seeders/home-screen-templates.seeder.js --prod           dry run, production
 *   node src/database/seeders/home-screen-templates.seeder.js --prod --apply   production
 *
 * Needs the `home_screen_templates` table (tools/apply-home-screen-templates.js).
 */

require('dotenv').config();
const path = require('path');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod') || args.includes('prod');

if (PROD) {
    require('dotenv').config({
        path: path.join(__dirname, '..', '..', '..', '.env.production'),
        override: true,
    });
}

const { Sequelize, sequelize, HomeScreenTemplate, EventCategory, HomeScreenCategory } = require('../../models');
const mediaService = require('../../services/media.service');

const { Op } = Sequelize;
const COMPANY_ID = 1;
const EVENT_CATEGORY = 'Wedding';
const ROLES = ['primary', 'secondary', 'accent', 'background', 'text'];
const LABELS = { primary: 'Primary', secondary: 'Secondary', accent: 'Accent', background: 'Background', text: 'Text' };

/** Default styles for the Home Screen Categories master, in display order. */
const DEFAULT_STYLES = ['Classic', 'Royal', 'Minimal', 'Elegant', 'Traditional'];

const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const SAMPLES = [
    {
        name: 'Classic Romance',
        style: 'Classic',
        motif: 'floral',
        description: 'A timeless and elegant design with beautiful florals.',
        colors: ['#E8457C', '#F9C6D3', '#E07B39', '#FFF5F8', '#3B2A30'],
    },
    {
        name: 'Royal Celebration',
        style: 'Royal',
        motif: 'royal',
        description: 'A grand and royal theme, perfect for traditional weddings.',
        colors: ['#7B1E1E', '#F3D9B1', '#D4A04C', '#FFF8EE', '#3A1A12'],
    },
    {
        name: 'Modern Elegance',
        style: 'Minimal',
        motif: 'leaf',
        description: 'A clean and modern design with a minimalist style.',
        colors: ['#5E7D63', '#DCE6D5', '#9DB59E', '#F7F5EF', '#2F3B2F'],
    },
    {
        name: 'Traditional Charm',
        style: 'Traditional',
        motif: 'toran',
        description: 'A cultural and traditional design with a heritage touch.',
        colors: ['#D9541E', '#FBE3D2', '#C0392B', '#FFF4EC', '#4A2414'],
    },
    {
        name: 'Graceful Ivory',
        style: 'Elegant',
        motif: 'frame',
        description: 'Soft ivory and gold for a graceful, refined celebration.',
        colors: ['#8C6D46', '#EFE5D3', '#C9A96E', '#FFFDF8', '#3A2E22'],
    },
];

// ── Placeholder artwork ─────────────────────────────────────────────────────

const flower = (cx, cy, r, petal, centre, opacity = 0.9) => {
    const petals = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 6;
        return `<circle cx="${(cx + Math.cos(a) * r * 0.9).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.9).toFixed(1)}" r="${(r * 0.62).toFixed(1)}" fill="${petal}" opacity="${opacity}"/>`;
    }).join('');
    return `${petals}<circle cx="${cx}" cy="${cy}" r="${(r * 0.45).toFixed(1)}" fill="${centre}"/>`;
};

const leaf = (x, y, angle, len, color) =>
    `<path d="M0 0 C ${len * 0.35} ${-len * 0.22}, ${len * 0.75} ${-len * 0.18}, ${len} 0 C ${len * 0.75} ${len * 0.18}, ${len * 0.35} ${len * 0.22}, 0 0 Z" fill="${color}" transform="translate(${x} ${y}) rotate(${angle})" opacity="0.85"/>`;

function motifLayer(motif, [primary, secondary, accent, background]) {
    switch (motif) {
        case 'royal':
            return `
  <path d="M190 1540 V780 Q190 430 540 380 Q890 430 890 780 V1540 Z" fill="none" stroke="${accent}" stroke-width="22"/>
  <path d="M240 1540 V800 Q240 490 540 445 Q840 490 840 800 V1540 Z" fill="${primary}" opacity="0.92"/>
  ${Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 12;
      return `<ellipse cx="${(540 + Math.cos(a) * 120).toFixed(1)}" cy="${(900 + Math.sin(a) * 120).toFixed(1)}" rx="46" ry="18" fill="${accent}" transform="rotate(${(a * 180) / Math.PI} ${(540 + Math.cos(a) * 120).toFixed(1)} ${(900 + Math.sin(a) * 120).toFixed(1)})"/>`;
  }).join('')}
  <circle cx="540" cy="900" r="70" fill="${accent}"/>
  <circle cx="540" cy="900" r="38" fill="${primary}"/>
  ${[300, 780].map((x) => `<circle cx="${x}" cy="1250" r="26" fill="${accent}"/><rect x="${x - 6}" y="1270" width="12" height="230" fill="${accent}"/>`).join('')}`;
        case 'leaf':
            return `
  <circle cx="540" cy="900" r="330" fill="none" stroke="${primary}" stroke-width="10" opacity="0.7"/>
  <circle cx="540" cy="900" r="300" fill="${secondary}"/>
  ${leaf(260, 700, -40, 220, primary)}${leaf(250, 760, 10, 200, accent)}${leaf(820, 1100, 140, 220, primary)}${leaf(830, 1040, 190, 200, accent)}
  <circle cx="540" cy="900" r="12" fill="${primary}"/>`;
        case 'toran':
            return `
  <rect x="0" y="380" width="1080" height="40" fill="${primary}"/>
  ${Array.from({ length: 13 }, (_, i) => {
      const x = 40 + i * 83;
      const c = i % 2 ? accent : primary;
      return `<path d="M${x - 30} 420 L${x + 30} 420 L${x} 520 Z" fill="${c}"/><circle cx="${x}" cy="545" r="14" fill="${c}"/>`;
  }).join('')}
  <path d="M260 1540 V860 Q260 640 540 600 Q820 640 820 860 V1540 Z" fill="${secondary}" stroke="${primary}" stroke-width="16"/>
  ${flower(540, 1000, 110, primary, accent)}
  ${flower(330, 1420, 60, accent, primary)}${flower(750, 1420, 60, accent, primary)}`;
        case 'frame':
            return `
  <rect x="170" y="520" width="740" height="880" rx="40" fill="none" stroke="${accent}" stroke-width="14"/>
  <rect x="210" y="560" width="660" height="800" rx="28" fill="${secondary}"/>
  ${[[170, 520], [910, 520], [170, 1400], [910, 1400]].map(([x, y]) => flower(x, y, 54, accent, primary, 1)).join('')}
  <path d="M410 960 a70 70 0 1 1 130 0 a70 70 0 1 1 130 0 l-130 150 z" fill="${primary}" opacity="0.85"/>`;
        case 'floral':
        default:
            return `
  <path d="M220 1540 V820 Q220 520 540 470 Q860 520 860 820 V1540 Z" fill="${background}" stroke="${primary}" stroke-width="12" opacity="0.95"/>
  ${flower(240, 520, 95, primary, accent)}${flower(380, 420, 70, secondary, primary)}${flower(840, 520, 95, primary, accent)}${flower(700, 420, 70, secondary, primary)}
  ${flower(200, 1420, 80, secondary, primary)}${flower(880, 1420, 80, secondary, primary)}
  ${leaf(150, 640, 60, 150, accent)}${leaf(930, 640, 120, 150, accent)}
  <circle cx="500" cy="1000" r="70" fill="none" stroke="${accent}" stroke-width="16"/>
  <circle cx="580" cy="1000" r="70" fill="none" stroke="${primary}" stroke-width="16"/>`;
    }
}

function artworkSvg(sample) {
    const [primary, secondary, accent, background] = sample.colors;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${secondary}"/>
      <stop offset="0.75" stop-color="${background}"/>
      <stop offset="1" stop-color="${background}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  ${[[150, 260, 70], [930, 300, 90], [820, 1650, 110], [120, 1700, 80]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" opacity="0.12"/>`).join('')}
  ${motifLayer(sample.motif, sample.colors)}
</svg>`;
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ── Run ─────────────────────────────────────────────────────────────────────

(async () => {
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);
    let added = 0;
    try {
        const category = await EventCategory.findOne({
            where: { name: { [Op.like]: EVENT_CATEGORY } },
            attributes: ['id', 'name'],
        });
        if (!category) {
            console.log(`  ! No "${EVENT_CATEGORY}" event category — nothing to seed.`);
            return;
        }
        console.log(`  Event category: ${category.name} (id ${category.id})\n`);

        // Default styles in the Home Screen Categories master (created when missing).
        for (const [i, name] of DEFAULT_STYLES.entries()) {
            const found = await HomeScreenCategory.findOne({ where: { name }, attributes: ['id'] });
            if (found) {
                console.log(`  = style ${name}   already exists (id ${found.id})`);
                continue;
            }
            console.log(`  + style ${name}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
            if (APPLY) {
                await HomeScreenCategory.create({
                    name, slug: slugOf(name), sort_order: i + 1, is_active: 1, company_id: COMPANY_ID,
                });
            }
        }
        console.log('');

        for (const [index, sample] of SAMPLES.entries()) {
            const style = await HomeScreenCategory.findOne({
                where: { name: { [Op.like]: sample.style } },
                attributes: ['id', 'name'],
            });
            if (!style && APPLY) {
                console.log(`  ! skip ${sample.name}: style "${sample.style}" does not exist`);
                continue;
            }
            const existing = await HomeScreenTemplate.findOne({ where: { name: sample.name }, attributes: ['id'] });
            if (existing) {
                console.log(`  = ${sample.name}   already exists (id ${existing.id})`);
                continue;
            }
            console.log(`  + ${sample.name}   style ${style ? style.name : sample.style}   ${APPLY ? 'adding' : 'WOULD ADD'}`);
            if (!APPLY) continue;

            const svg = artworkSvg(sample);
            const buffer = Buffer.from(svg, 'utf8');
            const fileName = `${slugify(sample.name)}.svg`;
            const uploaded = await mediaService.upload(
                { buffer, mimetype: 'image/svg+xml', size: buffer.length, originalname: fileName },
                { folder: 'home-screen-templates' },
                COMPANY_ID,
            );
            if (!uploaded?.url) throw new Error(`Upload failed for ${sample.name}`);

            await HomeScreenTemplate.create({
                name: sample.name,
                description: sample.description,
                event_category_id: category.id,
                home_screen_category_id: style.id,
                image_url: uploaded.url,
                image_name: fileName,
                image_size: buffer.length,
                color_count: sample.colors.length,
                colors: sample.colors.map((hex, i) => ({ key: ROLES[i], label: LABELS[ROLES[i]], hex })),
                notes: 'Sample template with placeholder artwork — replace the image with real artwork.',
                is_active: 1,
                sort_order: index,
                company_id: COMPANY_ID,
            });
            added += 1;
        }
        console.log(`\n  ${added} template(s) added.${APPLY ? '' : ' Dry run — add --apply to write.'}`);
    } catch (e) {
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
})();
