/**
 * audit-unused.js — READ-ONLY report of what V2 no longer uses.
 *
 *   node src/database/tools/audit-unused.js [--out <folder>] [--no-db]
 *
 * 1. ROUTES  — every route the Express app really mounts (walked from the live router, not
 *              parsed), matched against every API path written in the five V2 clients
 *              (admin portal, client portal, website builder, public site, mobile app).
 * 2. FILES   — backend files nothing reaches once the fully-unreferenced routers are dropped.
 * 3. TABLES  — every table of the LOCAL database with its row count, its model, and whether
 *              any reachable backend file still mentions it.
 *
 * It changes nothing: no table, row or file is written except the report (audit-unused.json /
 * audit-unused.md in --out, default docs/). "No reference" means "no client names this path" —
 * a path called from outside (OAuth / payment callbacks, links in e-mails, QR codes) has no
 * client reference either, so every line is a CANDIDATE to check, not a verdict.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
const SRC = path.join(ROOT, 'src');
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : path.join(ROOT, 'docs');
const useDb = !args.includes('--no-db');

const CLIENTS = [
    { key: 'admin', label: 'Admin portal', dir: '../Event_Management_Admin_Frontend/src', ext: ['.ts', '.tsx', '.js'] },
    { key: 'client', label: 'Client portal', dir: '../event_client_single/src', ext: ['.ts', '.tsx', '.js'] },
    { key: 'builder', label: 'Website Builder', dir: '../Event_Managment_Website_Builder/src', ext: ['.ts', '.tsx', '.js'] },
    { key: 'site', label: 'Public Website', dir: '../Event_Management_Public_Site/src', ext: ['.ts', '.tsx', '.js'] },
    { key: 'app', label: 'Mobile app', dir: '../Event_Invite_Mobile_App/lib', ext: ['.dart'] },
];

const W = '\u0001'; // "one path segment whose value is only known at run time"

function walk(dir, exts, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, exts, out);
        else if (exts.includes(path.extname(e.name))) out.push(p);
    }
    return out;
}

/* ───────────────────────── 1. routes of the live app ───────────────────────── */

function mountPath(layer) {
    if (layer.regexp.fast_slash) return '';
    // express 4: /^\/staff\/portal\/?(?=\/|$)/i   → "/staff/portal";  params show as (?:([^\/]+?))
    return layer.regexp.source
        .replace('\\/?(?=\\/|$)', '')
        .replace(/^\^/, '')
        .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':p')
        .replace(/\\\//g, '/')
        .replace(/\$$/, '');
}

function collectRoutes(stack, prefix, out) {
    for (const layer of stack) {
        if (layer.route) {
            const names = layer.route.stack.map((s) => s.name || 'anonymous');
            for (const method of Object.keys(layer.route.methods)) {
                const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
                for (const p of paths) out.push({ method: method.toUpperCase(), path: (prefix + p).replace(/\/+$/, '') || '/', names });
            }
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            collectRoutes(layer.handle.stack, prefix + mountPath(layer), out);
        }
    }
    return out;
}

/** Which route file a mount belongs to, read from app.js. */
function mountFiles() {
    const text = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
    const map = [];
    const re = /app\.use\(\s*'([^']+)'\s*,\s*require\('\.\/routes\/([^']+)'\)/g;
    let m;
    while ((m = re.exec(text))) map.push({ mount: m[1], file: `routes/${m[2]}.js` });
    return map.sort((a, b) => b.mount.length - a.mount.length);
}

function audienceOf(names) {
    const n = names.join(' ');
    if (/isStaffAuthenticated|hasStaffPermission/.test(n)) return 'staff';
    if (/isVendorOrStaff/i.test(n)) return 'vendor+staff';
    if (/isVendorAuthenticated/.test(n)) return 'vendor';
    if (/isWebsiteClient|isClientAuthenticated|clientAuth|isEventOrganizer|eventOrganizer/i.test(n)) return 'client';
    if (/isAuthenticated|hasPermission/.test(n)) return 'admin';
    return 'open';
}

/* ───────────────────────── 2. API paths written in the clients ───────────────────────── */

function literalsOf(file, dart) {
    const text = fs.readFileSync(file, 'utf8');
    // Same-file string constants (ENDPOINT, BASE, static const String x) so `${ENDPOINT}/${id}` resolves.
    const consts = {};
    const cre = dart
        ? /(?:static\s+)?const\s+(?:String\s+)?(\w+)\s*=\s*'([^'$]*)'/g
        : /(?:const|let|var)\s+(\w+)\s*(?::\s*string\s*)?=\s*(['"`])([^'"`$]*)\2/g;
    let m;
    while ((m = cre.exec(text))) consts[m[1]] = dart ? m[2] : m[3];

    const out = [];
    const re = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
    while ((m = re.exec(text))) {
        let s = m[2];
        if (!s.includes('/') || s.length > 300) continue;
        s = s.replace(/\$\{\s*([A-Za-z_]\w*)\s*\}/g, (all, name) => (consts[name] !== undefined ? consts[name] : all));
        if (dart) s = s.replace(/\$([A-Za-z_]\w*)/g, (all, name) => (consts[name] !== undefined ? consts[name] : W));
        s = s.replace(/\$\{[^}]*\}?/g, W);              // any other ${…} (also one cut short by a nested template)
        s = s.replace(/^https?:\/\/[^/]+/, '');
        const api = s.indexOf('/api/v1');
        if (api >= 0) s = s.slice(api + 7);
        s = s.replace(/[?#].*$/, '');
        s = s.replace(new RegExp(`^${W}+(?=/)`), '');    // leading base-url variable
        s = s.replace(new RegExp(`([^/${W}])${W}+$`), '$1'); // "…/stats${query}" → "…/stats"
        s = s.replace(/\/+$/, '');
        if (!/^\/[A-Za-z]/.test(s)) continue;
        if (/\.(png|jpe?g|svg|webp|gif|css|js|json|ico|mp3|mp4|woff2?|ttf|pdf|html)$/i.test(s)) continue;
        out.push(s);
    }
    return out;
}

function segs(p) {
    return p.split('/').filter(Boolean).map((s) => (s.startsWith(':') || s.includes(W) ? W : s.toLowerCase()));
}
/** lit = a client path, want = a route. Strict: a run-time value in the client path may only stand where the route has a parameter. */
const sameSegs = (lit, want) => lit.length === want.length && lit[0] !== W && lit.every((s, i) => want[i] === W || s === want[i]);
/** Loose: a run-time value in the client path may also stand for a fixed word of the route (e.g. `/vendors/${section}`). */
const looseSegs = (lit, want) => lit.length === want.length && lit[0] !== W && lit.some((s) => s === W) && lit.every((s, i) => s === W || want[i] === W || s === want[i]);

/* ───────────────────────── 3. backend files reachable ───────────────────────── */

function requiresOf(file) {
    const text = fs.readFileSync(file, 'utf8');
    const out = [];
    const re = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(text))) {
        const base = path.resolve(path.dirname(file), m[1]);
        for (const c of [base, `${base}.js`, path.join(base, 'index.js')]) {
            if (fs.existsSync(c) && fs.statSync(c).isFile()) { out.push(c); break; }
        }
    }
    return out;
}

/* ───────────────────────── run ───────────────────────── */

(async () => {
    require('dotenv').config({ path: path.join(ROOT, '.env') });
    const app = require(path.join(SRC, 'app.js'));
    const mounts = mountFiles();
    const routes = collectRoutes((app._router || app.router).stack, '', [])
        .filter((r) => r.path.startsWith('/api/'))
        .map((r) => {
            const mount = mounts.find((x) => r.path === x.mount || r.path.startsWith(`${x.mount}/`));
            return { ...r, file: mount ? mount.file : '(app.js)', audience: audienceOf(r.names) };
        });

    // Client literals, per client.
    const lits = {};
    for (const c of CLIENTS) {
        const dir = path.resolve(ROOT, c.dir);
        const set = new Set();
        for (const f of walk(dir, c.ext)) for (const l of literalsOf(f, c.ext.includes('.dart'))) set.add(l);
        lits[c.key] = [...set].map((l) => ({ raw: l, segs: segs(l) }));
        c.found = fs.existsSync(dir);
        c.count = set.size;
    }

    for (const r of routes) {
        const want = segs(r.path.replace(/^\/api\/v1/, ''));
        const statics = want.filter((s) => s !== W);
        r.exact = [];
        r.loose = [];
        for (const c of CLIENTS) {
            if (lits[c.key].some((l) => sameSegs(l.segs, want))) { r.exact.push(c.key); continue; }
            // Loose: every fixed word of the route appears, in order, in one client path (built from parts we could not resolve).
            const hit = lits[c.key].some((l) => looseSegs(l.segs, want)) || (statics.length >= 2 && lits[c.key].some((l) => {
                let i = 0;
                for (const s of l.segs) if (s === statics[i]) i += 1;
                return i === statics.length && l.segs.length <= want.length + 1;
            }));
            if (hit) r.loose.push(c.key);
        }
        r.verdict = r.exact.length ? 'used' : r.loose.length ? 'likely' : 'none';
    }

    // Route files where no route has any reference → the router can go as a whole.
    const byFile = {};
    for (const r of routes) (byFile[r.file] = byFile[r.file] || []).push(r);
    const deadRouters = Object.keys(byFile).filter((f) => byFile[f].every((r) => r.verdict === 'none'));

    // Reachability from server.js / app.js without the dead routers.
    const deadAbs = new Set(deadRouters.map((f) => path.join(SRC, f)));
    const seen = new Set();
    const queue = [path.join(SRC, 'server.js'), path.join(SRC, 'app.js')].filter((f) => fs.existsSync(f));
    while (queue.length) {
        const f = queue.pop();
        if (seen.has(f) || deadAbs.has(f)) continue;
        seen.add(f);
        for (const d of requiresOf(f)) queue.push(d);
    }
    const codeDirs = ['controllers', 'services', 'middleware', 'utils', 'routes', 'sockets', 'config'];
    const allCode = codeDirs.flatMap((d) => walk(path.join(SRC, d), ['.js']));
    const unreachable = allCode.filter((f) => !seen.has(f)).map((f) => path.relative(SRC, f).replace(/\\/g, '/'));

    // Tables.
    let tables = [];
    let dbName = null;
    if (useDb) {
        const db = require(path.join(SRC, 'models'));
        const sequelize = db.sequelize;
        dbName = sequelize.config.database;
        const [rows] = await sequelize.query('SELECT TABLE_NAME AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = \'BASE TABLE\' ORDER BY 1');
        const modelByTable = {};
        for (const [name, model] of Object.entries(sequelize.models)) {
            const t = typeof model.getTableName() === 'string' ? model.getTableName() : model.getTableName().tableName;
            (modelByTable[t] = modelByTable[t] || []).push(name);
        }
        const texts = allCode.filter((f) => seen.has(f)).map((f) => ({ f: path.relative(SRC, f).replace(/\\/g, '/'), text: fs.readFileSync(f, 'utf8') }));
        const deadTexts = allCode.filter((f) => !seen.has(f)).map((f) => ({ f: path.relative(SRC, f).replace(/\\/g, '/'), text: fs.readFileSync(f, 'utf8') }));
        const [fks] = await sequelize.query('SELECT TABLE_NAME AS t, REFERENCED_TABLE_NAME AS r FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');
        for (const { t } of rows) {
            const [[{ n }]] = await sequelize.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
            const models = modelByTable[t] || [];
            const words = [...models.map((x) => new RegExp(`\\b${x}\\b`)), new RegExp(`\\b${t}\\b`)];
            const live = texts.filter((x) => words.some((w) => w.test(x.text))).map((x) => x.f);
            const dead = deadTexts.filter((x) => words.some((w) => w.test(x.text))).map((x) => x.f);
            const referencedBy = [...new Set(fks.filter((k) => k.r === t && k.t !== t).map((k) => k.t))];
            tables.push({
                table: t, rows: Number(n), models, live_files: live, dead_files: dead, referenced_by: referencedBy,
                verdict: !models.length && !live.length ? 'no model, no code' : !live.length ? 'no reachable code' : 'used',
            });
        }
        await sequelize.close();
        // Models whose table does not exist locally.
        const have = new Set(rows.map((r) => r.t));
        for (const [t, names] of Object.entries(modelByTable)) if (!have.has(t)) tables.push({ table: t, rows: null, models: names, live_files: [], dead_files: [], referenced_by: [], verdict: 'model without table' });
    }

    /* ── write ── */
    fs.mkdirSync(outDir, { recursive: true });
    const summary = {
        generated_at: new Date().toISOString(),
        database: dbName,
        clients: CLIENTS.map((c) => ({ key: c.key, label: c.label, found: c.found, paths: c.count })),
        routes: { total: routes.length, used: routes.filter((r) => r.verdict === 'used').length, likely: routes.filter((r) => r.verdict === 'likely').length, none: routes.filter((r) => r.verdict === 'none').length },
        dead_routers: deadRouters,
        unreachable_files: unreachable,
        tables: { total: tables.length, used: tables.filter((t) => t.verdict === 'used').length, unused: tables.filter((t) => t.verdict !== 'used').length },
    };
    fs.writeFileSync(path.join(outDir, 'audit-unused.json'), JSON.stringify({ summary, routes, tables }, null, 1));

    const md = [];
    md.push('# V2 unused audit (candidates, nothing removed)', '', `Generated ${summary.generated_at} by \`src/database/tools/audit-unused.js\`. Database: \`${dbName || 'not read'}\` (local).`, '');
    md.push('## Summary', '', `- Routes: **${summary.routes.total}** — referenced by a client: ${summary.routes.used}, probably referenced: ${summary.routes.likely}, **no reference: ${summary.routes.none}**`);
    md.push(`- Route files with no referenced route at all: **${deadRouters.length}**`, `- Backend files nothing reaches without those: **${unreachable.length}**`, `- Tables: **${summary.tables.total}** — used: ${summary.tables.used}, **no reachable code: ${summary.tables.unused}**`, '');
    md.push('Clients read: ' + summary.clients.map((c) => `${c.label} (${c.found ? `${c.paths} paths` : 'FOLDER NOT FOUND'})`).join(', '), '');

    md.push('## Routes by file', '', '| Route file | Routes | Used | Likely | No reference | Audience of the unreferenced |', '|---|---|---|---|---|---|');
    for (const f of Object.keys(byFile).sort()) {
        const rs = byFile[f];
        const none = rs.filter((r) => r.verdict === 'none');
        const aud = {};
        for (const r of none) aud[r.audience] = (aud[r.audience] || 0) + 1;
        md.push(`| ${f} | ${rs.length} | ${rs.filter((r) => r.verdict === 'used').length} | ${rs.filter((r) => r.verdict === 'likely').length} | ${none.length} | ${Object.entries(aud).map(([k, v]) => `${k} ${v}`).join(', ')} |`);
    }
    md.push('', '## Routes with no client reference', '');
    for (const f of Object.keys(byFile).sort()) {
        const none = byFile[f].filter((r) => r.verdict === 'none');
        if (!none.length) continue;
        md.push(`### ${f} (${none.length} of ${byFile[f].length})`, '');
        for (const r of none) md.push(`- \`${r.method} ${r.path}\` — ${r.audience}`);
        md.push('');
    }
    md.push('## Backend files nothing reaches (after dropping the fully-unreferenced route files)', '', ...unreachable.map((f) => `- ${f}`), '');
    if (tables.length) {
        md.push('## Tables with no reachable code', '', '| Table | Rows | Model | Only mentioned in | Other tables point at it |', '|---|---|---|---|---|');
        for (const t of tables.filter((x) => x.verdict !== 'used').sort((a, b) => a.table.localeCompare(b.table))) {
            md.push(`| ${t.table} | ${t.rows ?? '—'} | ${t.models.join(', ') || '—'} | ${t.dead_files.slice(0, 4).join(', ') || (t.verdict === 'model without table' ? '(table missing locally)' : '—')} | ${t.referenced_by.join(', ') || '—'} |`);
        }
        md.push('');
    }
    fs.writeFileSync(path.join(outDir, 'audit-unused.md'), md.join('\n'));
    console.log(JSON.stringify(summary, null, 1));
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
