const { Op } = require('sequelize');
const { sequelize } = require('../models');
const crud = require('./crud.service');
const ApiError = require('../utils/apiError');
const { applySortOrder } = require('../utils/sortOrder');

/**
 * Shared builder for the admin "style" masters with a slug, a child count and drag reorder:
 * Template Categories (children = frame styles) and Home Screen Categories (children = home screen
 * templates). Built on the common CRUD kit (crud.service.js).
 *
 * Rules (unchanged from the two hand-written copies it replaces):
 *   - name required (trimmed, max 150), may repeat; slug made unique per company (`name-2`, `-3`…);
 *   - is_active accepts true / false / 1 / 0 / "yes" (+ 2 = pending approval where `allowPending`);
 *   - list rows carry `<countKey>` = children per row (one grouped query for the page);
 *   - delete leaves the children uncategorised and answers `{ <orphanKey>: n }`;
 *   - reorder = one UPDATE for all rows (was one query per row).
 *   - `?is_active=all` = no filter (was answering 400).
 */

const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const clampInt = (raw, min, max, fallback) => {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
};

const build = ({ Model, modelName, moduleSlug, Child, childKey, countKey, orphanKey, allowPending = false }) => {
    const toBit = (value, fallback = 1) => {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (typeof value === 'number') return allowPending && value === 2 ? 2 : value ? 1 : 0;
        const s = String(value).toLowerCase();
        if (allowPending && s === '2') return 2;
        return s === 'true' || s === '1' || s === 'yes' ? 1 : 0;
    };

    const uniqueSlug = async (base, companyId, excludeId = null) => {
        const root = slugify(base) || 'category';
        const where = { slug: { [Op.like]: `${root}%` } };
        if (companyId !== undefined && companyId !== null) where.company_id = companyId;
        if (excludeId) where.id = { [Op.ne]: excludeId };
        const taken = new Set((await Model.findAll({ where, attributes: ['slug'], raw: true })).map((r) => r.slug));
        if (!taken.has(root)) return root;
        for (let i = 2; i < 1000; i += 1) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
        return `${root}-${Date.now()}`;
    };

    const service = crud.build({
        Model,
        modelName,
        moduleSlug,
        writable: ['name', 'slug', 'sort_order', 'is_active'],
        searchFields: ['name', 'slug'],
        sortableFields: ['sort_order', 'name', 'slug', 'created_at', 'updated_at'],
        defaultSort: { sort_by: 'sort_order', sort_order: 'ASC' },
        notFound: 'Category not found',
        name: { required: 'Category name is required.', unique: false },
        reload: true,
        statusValue: (v) => toBit(v, 1),
        prepareList: (query) => {
            const { status, ...rest } = query;
            const where = {};
            if (rest.is_active === 'all' || rest.is_active === '') delete rest.is_active;
            else if (rest.is_active !== undefined) where.is_active = toBit(rest.is_active, 1);
            return { query: rest, where };
        },
        decorateList: async (rows) => {
            const ids = rows.map((r) => r.id);
            const counts = {};
            if (ids.length) {
                const grouped = await Child.findAll({
                    where: { [childKey]: ids },
                    attributes: [childKey, [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                    group: [childKey],
                    raw: true,
                });
                for (const g of grouped) counts[g[childKey]] = Number(g.count) || 0;
            }
            return rows.map((r) => ({ ...r, [countKey]: counts[r.id] ?? 0 }));
        },
        beforeSave: async (payload, { row, companyId, isCreate }) => {
            if (payload.name !== undefined) payload.name = String(payload.name ?? '').trim().slice(0, 150);
            if (payload.is_active !== undefined) payload.is_active = toBit(payload.is_active, 1);
            if (payload.sort_order !== undefined) payload.sort_order = clampInt(payload.sort_order, 0, 999999, 0);
            if (isCreate) {
                if (!payload.name) throw ApiError.badRequest('Category name is required.');
                payload.slug = await uniqueSlug(payload.slug || payload.name, companyId);
            } else if (payload.slug !== undefined) {
                payload.slug = await uniqueSlug(payload.slug || payload.name || row.name, companyId, row.id);
            }
        },
        beforeDelete: async (id) => ({ [orphanKey]: await Child.count({ where: { [childKey]: id } }) }),
    });

    /** Drag reorder: [{ id, sort_order }] — one UPDATE for all rows (utils/sortOrder.js). */
    service.reorder = (items = [], userId = null, companyId = undefined) => applySortOrder(Model, items, { userId, companyId });

    return service;
};

module.exports = { build, slugify };
