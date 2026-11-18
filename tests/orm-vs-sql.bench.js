/**
 * Sequelize vs direct SQL — same work, same connection pool, timed side by side (Jamal, 2026-11-19).
 *
 *   node tests/orm-vs-sql.bench.js [--runs 200] [--latency 0]
 *
 * READ-ONLY on the data: the write cases run inside a transaction that is rolled back.
 * Runs against the LOCAL database (.env). `--latency N` adds N ms to every query round trip
 * to show what the same work costs against a far database (live Aiven is ~374 ms per query).
 *
 * Cases (each checked to return the same answer both ways):
 *   A  list page       10 categories + total count              (2 queries both ways)
 *   B  detail + joins  one event with client, plan, category    (1 query both ways)
 *   C  aggregate       participants of one event grouped by RSVP (1 query both ways)
 *   D  write           insert + update + soft delete one row    (3 statements)
 *   E  bulk insert     100 rows                                  (1 statement both ways)
 */
require('dotenv').config();
const db = require('../src/models');

const { sequelize, Sequelize, EventCategory, Event, EventParticipant, WebsiteClient, SubscriptionPlan } = db;
const { QueryTypes, fn, col } = Sequelize;
const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf('--runs') + 1]) || (args.includes('--runs') ? 200 : 200);
const LATENCY = args.includes('--latency') ? Number(args[args.indexOf('--latency') + 1]) || 0 : 0;

// Simulated network distance: delay every query the pool sends (both sides pay it equally).
if (LATENCY) {
    const orig = sequelize.dialect.connectionManager.getConnection.bind(sequelize.dialect.connectionManager);
    sequelize.dialect.connectionManager.getConnection = async (...a) => {
        const conn = await orig(...a);
        if (!conn.__slowed) {
            // Sequelize sends plain queries through query() and bound ones (model create / update) through execute().
            for (const m of ['query', 'execute']) {
                const orig2 = conn[m].bind(conn);
                conn[m] = (...qa) => { const cb = qa[qa.length - 1]; if (typeof cb === 'function') { qa[qa.length - 1] = (...r) => setTimeout(() => cb(...r), LATENCY); } return orig2(...qa); };
            }
            conn.__slowed = true;
        }
        return conn;
    };
}

let queries = 0;
sequelize.options.logging = () => { queries += 1; };

async function time(label, fnc, runs) {
    for (let i = 0; i < Math.min(20, runs); i += 1) await fnc();      // warm-up
    queries = 0;
    const t = process.hrtime.bigint();
    for (let i = 0; i < runs; i += 1) await fnc();
    const ms = Number(process.hrtime.bigint() - t) / 1e6 / runs;
    return { label, ms, queriesPerCall: queries / runs };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
    const [[pick]] = await sequelize.query(
        `SELECT e.id, e.company_id FROM events e
           LEFT JOIN event_participants p ON p.event_id = e.id AND p.deleted_at IS NULL
          WHERE e.deleted_at IS NULL GROUP BY e.id ORDER BY COUNT(p.id) DESC LIMIT 1`,
    );
    const eventId = pick.id;
    const runs = LATENCY ? Math.max(5, Math.round(RUNS / 20)) : RUNS;
    const out = [];

    /* A — list page */
    const aOrm = async () => {
        const r = await EventCategory.findAndCountAll({ where: { is_active: 1 }, order: [['sort_order', 'ASC'], ['id', 'ASC']], limit: 10, offset: 0, raw: true });
        return { count: r.count, ids: r.rows.map((x) => x.id) };
    };
    // Count and rows sent together, as Sequelize's findAndCountAll does.
    const aSql = async () => {
        const [[[{ n }]], rows] = await Promise.all([
            sequelize.query('SELECT COUNT(*) AS n FROM event_categories WHERE is_active = 1 AND deleted_at IS NULL'),
            sequelize.query('SELECT * FROM event_categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC LIMIT 10 OFFSET 0', { type: QueryTypes.SELECT }),
        ]);
        return { count: Number(n), ids: rows.map((x) => x.id) };
    };

    /* B — detail with three joins */
    const bOrm = async () => {
        const e = await Event.findOne({
            where: { id: eventId },
            include: [
                { model: WebsiteClient, as: 'client', attributes: ['id', 'name'] },
                { model: SubscriptionPlan, as: 'plan', attributes: ['id', 'name'] },
                { model: EventCategory, as: 'category', attributes: ['id', 'name'] },
            ],
        });
        const j = e.toJSON();
        return { id: j.id, name: j.name, client: j.client && j.client.id, plan: j.plan && j.plan.id, category: j.category && j.category.id };
    };
    const bSql = async () => {
        const [r] = await sequelize.query(
            `SELECT e.*, c.id AS client_id_, c.name AS client_name, p.id AS plan_id_, p.name AS plan_name, k.id AS cat_id, k.name AS cat_name
               FROM events e
               LEFT JOIN website_clients c ON c.id = e.website_client_id AND c.deleted_at IS NULL
               LEFT JOIN subscription_plans p ON p.id = e.subscription_plan_id AND p.deleted_at IS NULL
               LEFT JOIN event_categories k ON k.id = e.event_category_id AND k.deleted_at IS NULL
              WHERE e.id = ? AND e.deleted_at IS NULL LIMIT 1`,
            { replacements: [eventId], type: QueryTypes.SELECT },
        );
        return { id: r.id, name: r.name, client: r.client_id_, plan: r.plan_id_, category: r.cat_id };
    };

    /* C — aggregate */
    const cOrm = async () => {
        const rows = await EventParticipant.findAll({
            where: { event_id: eventId }, attributes: ['rsvp_status', [fn('COUNT', col('id')), 'n']], group: ['rsvp_status'], order: [['rsvp_status', 'ASC']], raw: true,
        });
        return rows.map((r) => [r.rsvp_status, Number(r.n)]);
    };
    const cSql = async () => {
        const rows = await sequelize.query(
            'SELECT rsvp_status, COUNT(id) AS n FROM event_participants WHERE event_id = ? AND deleted_at IS NULL GROUP BY rsvp_status ORDER BY rsvp_status ASC',
            { replacements: [eventId], type: QueryTypes.SELECT },
        );
        return rows.map((r) => [r.rsvp_status, Number(r.n)]);
    };

    /* D — write: insert, update, soft delete (rolled back) */
    const dOrm = async () => {
        const t = await sequelize.transaction();
        try {
            const row = await EventCategory.create({ name: 'bench', sort_order: 999, is_active: 1, company_id: pick.company_id }, { transaction: t });
            await row.update({ name: 'bench 2' }, { transaction: t });
            await row.destroy({ transaction: t });
        } finally { await t.rollback(); }
    };
    const dSql = async () => {
        const t = await sequelize.transaction();
        try {
            const [id] = await sequelize.query(
                'INSERT INTO event_categories (name, sort_order, is_active, company_id, created_at, updated_at) VALUES (?, 999, 1, ?, NOW(), NOW())',
                { replacements: ['bench', pick.company_id], type: QueryTypes.INSERT, transaction: t },
            );
            await sequelize.query('UPDATE event_categories SET name = ?, updated_at = NOW() WHERE id = ?', { replacements: ['bench 2', id], transaction: t });
            await sequelize.query('UPDATE event_categories SET deleted_at = NOW() WHERE id = ?', { replacements: [id], transaction: t });
        } finally { await t.rollback(); }
    };

    /* E — bulk insert 100 rows (rolled back) */
    const bulk = Array.from({ length: 100 }, (_, i) => ({ name: `bench ${i}`, sort_order: 900 + i, is_active: 1, company_id: pick.company_id }));
    const eOrm = async () => {
        const t = await sequelize.transaction();
        try { await EventCategory.bulkCreate(bulk, { transaction: t }); } finally { await t.rollback(); }
    };
    const eSql = async () => {
        const t = await sequelize.transaction();
        try {
            const values = bulk.map(() => '(?, ?, ?, ?, NOW(), NOW())').join(',');
            await sequelize.query(`INSERT INTO event_categories (name, sort_order, is_active, company_id, created_at, updated_at) VALUES ${values}`,
                { replacements: bulk.flatMap((b) => [b.name, b.sort_order, b.is_active, b.company_id]), transaction: t });
        } finally { await t.rollback(); }
    };

    const cases = [
        ['A list page (10 + count)', aOrm, aSql, true],
        ['B detail + 3 joins', bOrm, bSql, true],
        ['C aggregate (group by)', cOrm, cSql, true],
        ['D write: insert+update+delete', dOrm, dSql, false],
        ['E bulk insert 100 rows', eOrm, eSql, false],
    ];
    for (const [label, o, s, compare] of cases) {
        let match = '—';
        if (compare) match = same(await o(), await s()) ? 'same' : `DIFFERENT ${JSON.stringify(await o())} vs ${JSON.stringify(await s())}`;
        const ro = await time(label, o, runs);
        const rs = await time(label, s, runs);
        out.push({ case: label, sequelize_ms: +ro.ms.toFixed(2), sql_ms: +rs.ms.toFixed(2), sequelize_queries: ro.queriesPerCall, sql_queries: rs.queriesPerCall, result: match });
    }

    console.log(`\nLocal ${process.env.DB_NAME}, event #${eventId}, ${runs} runs per case${LATENCY ? `, +${LATENCY} ms per query round trip` : ''}\n`);
    console.table(out.map((r) => ({ ...r, 'sql faster by': `${(((r.sequelize_ms - r.sql_ms) / r.sequelize_ms) * 100).toFixed(0)}%` })));
    await sequelize.close();
})().catch(async (e) => { console.error(e); await sequelize.close(); process.exit(1); });
