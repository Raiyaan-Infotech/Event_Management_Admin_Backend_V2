/**
 * CRUD contract test — proves a refactor did not change what an API answers (Jamal, 2026-11-19).
 *
 *   node tests/crud-contract.test.js --save    record the answers (before a refactor)
 *   node tests/crud-contract.test.js           compare against the recorded answers (after)
 *   [--email developer@admin.com] [--password 123456]
 *
 * Starts the app IN-PROCESS on a free port against the LOCAL database (.env) — no dev server.
 * For each module: list (default, search, sort), get by id, create, duplicate name, missing name,
 * update, status on / off, get missing id, delete, get after delete. Every row it creates is
 * deleted again (soft delete, then removed for good at the end).
 *
 * Ids, timestamps and the run's unique stamp are replaced before saving / comparing, so two runs
 * of unchanged code give the same snapshot.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SAVE = args.includes('--save');
const EMAIL = opt('--email', 'developer@admin.com');
const PASSWORD = opt('--password', '123456');
const SNAP = path.join(__dirname, 'snapshots', 'crud-contract.json');
const STAMP = `ct${Date.now().toString(36)}`;
const RUN_START = new Date(Date.now() - 2000);

const MODULES = [
    { path: '/notification-categories', key: 'notificationCategory', table: 'notification_categories', body: { name: 'Notif', description: 'd', sort_order: 5 }, status: true },
    { path: '/event-categories', key: 'eventCategory', table: 'event_categories', body: { name: 'Cat', description: 'd', sort_order: 5 }, status: true },
    { path: '/guest-relationship-options', key: 'relationshipOption', table: 'guest_relationship_options', body: { name: 'Rel', event_category_id: null, sort_order: 5 }, status: true },
    { path: '/guest-food-preference-options', key: 'foodPreferenceOption', table: 'guest_food_preference_options', body: { name: 'Food', event_category_id: null, sort_order: 5 }, status: true },
    { path: '/event-responsibilities', key: 'responsibility', table: 'event_responsibilities', body: { name: 'Resp', event_category_id: null, sort_order: 5 }, status: true },
    { path: '/plan-types', key: 'planType', table: 'plan_types', body: { name: 'Plan', price: 10, sort_order: 5, description: 'd' }, status: true },
    { path: '/color-palettes', key: 'palette', table: 'color_palettes', body: { name: 'Pal', primary_bg_color: '#111111', primary_text_color: '#222222' }, status: false },
    { path: '/template-categories', key: 'category', table: 'template_categories', body: { name: 'Tpl', sort_order: 5 }, status: true, reorder: true },
    { path: '/home-screen-categories', key: 'category', table: 'home_screen_categories', body: { name: 'Home', sort_order: 5 }, status: true, reorder: true },
    { path: '/currencies', key: 'currency', table: 'currencies', body: { name: 'Cur', code: '@C3', symbol: '¤', exchange_rate: 1.5, decimal_places: 2 }, status: false, publicGet: '/active' },
    { path: '/languages', key: 'language', table: 'languages', body: { name: 'Lang', code: '@L8', native_name: 'N', direction: 'ltr' }, status: false, publicGet: '/active' },
];

// Unique short codes for tables with a `code` column ('@C3' = 3 letters, '@L8' = 8 letters).
const CODES = {};
const codeFor = (tag) => {
    if (!CODES[tag]) {
        const len = Number(tag.slice(2));
        let c = '';
        while (c.length < len) c += 'QXZJKV'[Math.floor(Math.random() * 6)];
        CODES[tag] = tag[1] === 'C' ? c : c.toLowerCase();
    }
    return CODES[tag];
};

const VOLATILE = new Set(['id', 'created_at', 'updated_at', 'deleted_at', 'createdAt', 'updatedAt', 'deletedAt', 'created_by', 'updated_by', 'timestamp']);
function norm(v) {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v).sort()) o[k] = VOLATILE.has(k) && v[k] !== null ? '<x>' : norm(v[k]);
        return o;
    }
    if (typeof v === 'string') for (const c of Object.values(CODES)) if (v === c || v.startsWith(`${c}-d`) || v.startsWith(`${c}d`)) return '<code>';
    if (typeof v === 'string') return v.split(STAMP).join('<stamp>').split(STAMP.toLowerCase()).join('<stamp>').replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z\b/g, '<time>').replace(/(slug|-d)\d{6,}/g, '$1<n>');
    return v;
}

(async () => {
    const app = require('../src/app');
    const { sequelize } = require('../src/models');
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    let cookie = '';
    const call = async (method, p, body) => {
        const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
        const set = res.headers.getSetCookie?.() || [];
        if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
        let json = null;
        try { json = await res.json(); } catch { /* empty */ }
        return { status: res.status, json };
    };

    const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
    if (login.status !== 200) { console.error('Login failed:', login.status, login.json?.message); server.close(); process.exit(1); }

    const out = {};
    const created = [];
    for (const m of MODULES) {
        const r = {};
        const name = `${m.body.name} ${STAMP}`;
        for (const [k, v] of Object.entries(m.body)) if (typeof v === 'string' && v.startsWith('@')) m.body[k] = codeFor(v);
        const add = await call('POST', m.path, { ...m.body, name });
        r.create = add;
        const row = add.json?.data?.[m.key];
        if (row?.id) created.push([m.table, row.id]);
        const id = row?.id;
        r.create_duplicate = await call('POST', m.path, { ...m.body, name });
        r.create_no_name = await call('POST', m.path, { ...m.body, name: '   ' });
        r.get = await call('GET', `${m.path}/${id}`);
        r.get_missing = await call('GET', `${m.path}/99999999`);
        const list = await call('GET', `${m.path}?search=${STAMP}`);
        r.list_search = list;
        const def = await call('GET', `${m.path}?limit=3`);
        r.list_default_shape = { status: def.status, keys: Object.keys(def.json || {}).sort(), dataKeys: def.json?.data?.[0] ? Object.keys(def.json.data[0]).sort() : [], pagination: def.json?.pagination ? Object.keys(def.json.pagination).sort() : null };
        r.update = await call('PUT', `${m.path}/${id}`, { name: `${name} 2`, sort_order: 6 });
        r.update_missing = await call('PUT', `${m.path}/99999999`, { name: `x ${STAMP}` });
        if (m.status) {
            r.status_off = await call('PATCH', `${m.path}/${id}/status`, { is_active: false });
            r.status_on = await call('PATCH', `${m.path}/${id}/status`, { is_active: true });
        }
        if (m.reorder) {
            const second = await call('POST', m.path, { ...m.body, name: `${name} b` });
            const id2 = second.json?.data?.[m.key]?.id;
            if (id2) created.push([m.table, id2]);
            r.reorder = await call('PATCH', `${m.path}/reorder`, { items: [{ id, sort_order: 71 }, { id: id2, sort_order: 72 }, { id: 99999999, sort_order: 1 }] });
            r.reorder_empty = await call('PATCH', `${m.path}/reorder`, { items: [] });
            const after = await call('GET', `${m.path}?search=${STAMP}&sort_by=sort_order&sort_order=ASC`);
            r.reorder_result = (after.json?.data || []).map((x) => [x.name, x.sort_order]);
            r.update_slug = await call('PUT', `${m.path}/${id2}`, { slug: '' });
            r.list_all = (await call('GET', `${m.path}?search=${STAMP}&is_active=all`)).status;
            await call('DELETE', `${m.path}/${id2}`);
        }
        if (m.publicGet) {
            const saved = cookie;
            cookie = '';
            const pub = await call('GET', `${m.path}${m.publicGet}`);
            cookie = saved;
            const rows = Object.values(pub.json?.data || {})[0] || [];
            r.public_get = { status: pub.status, keys: Object.keys(pub.json?.data || {}), rowKeys: rows[0] ? Object.keys(rows[0]).sort() : [], hasMine: rows.some((x) => x.id === id) };
        }
        r.delete = await call('DELETE', `${m.path}/${id}`);
        r.get_after_delete = await call('GET', `${m.path}/${id}`);
        r.delete_missing = await call('DELETE', `${m.path}/99999999`);
        out[m.path] = norm(r);
    }

    // Clean up for good (the API only soft-deletes). Also rows a buggy create saved without
    // answering with an id: this run's stamp, or a blank name written during the run.
    for (const [table, id] of created) await sequelize.query(`DELETE FROM \`${table}\` WHERE id = ?`, { replacements: [id] });
    for (const m of MODULES) {
        await sequelize.query(`DELETE FROM \`${m.table}\` WHERE name LIKE ? OR (TRIM(name) = '' AND created_at >= ?)`, { replacements: [`%${STAMP}%`, RUN_START] });
        if (m.table === 'languages') await sequelize.query('DELETE FROM translations WHERE language_id NOT IN (SELECT id FROM languages)').catch(() => {});
    }
    await sequelize.query(`DELETE FROM activity_logs WHERE description LIKE ? OR metadata LIKE ?`, { replacements: [`%${STAMP}%`, `%${STAMP}%`] }).catch(() => {});
    server.close();

    if (SAVE) {
        fs.mkdirSync(path.dirname(SNAP), { recursive: true });
        fs.writeFileSync(SNAP, JSON.stringify(out, null, 1));
        console.log(`Saved ${Object.keys(out).length} modules to ${path.relative(process.cwd(), SNAP)}`);
        await sequelize.close();
        return;
    }
    const before = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
    let diffs = 0;
    for (const [p, steps] of Object.entries(before)) {
        for (const [step, val] of Object.entries(steps)) {
            const now = out[p]?.[step];
            if (JSON.stringify(now) !== JSON.stringify(val)) {
                diffs += 1;
                console.log(`✗ ${p} ${step}\n   before: ${JSON.stringify(val).slice(0, 400)}\n   after:  ${JSON.stringify(now).slice(0, 400)}`);
            }
        }
        for (const step of Object.keys(out[p] || {})) if (!(step in steps)) { diffs += 1; console.log(`✗ ${p} ${step} is new`); }
    }
    console.log(diffs ? `\n${diffs} differences` : `\n✓ ${Object.keys(before).length} modules answer exactly as before`);
    await sequelize.close();
    process.exit(diffs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
