const { Sequelize, HomeScreenCategory, HomeScreenTemplate, sequelize } = require('../models');
const { Op } = Sequelize;
const baseService = require('./base.service');
const ApiError = require('../utils/apiError');

const MODEL_NAME = 'HomeScreenCategory';
const MODULE_SLUG = 'home_screen_categories';

/**
 * Home Screen Categories — the style master for mobile app home screen templates.
 * Same rules as Template Categories (name + slug, sort order, soft delete);
 * the count column is home screen templates.
 */

// Whitelist, so a stray body key can never write company_id, created_by or an id.
const WRITABLE_FIELDS = ['name', 'slug', 'sort_order', 'is_active'];

const slugify = (value) =>
    String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const toBit = (value, fallback = 1) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value === 2 ? 2 : value ? 1 : 0;
    const s = String(value).toLowerCase();
    if (s === '2') return 2; // pending approval
    return s === 'true' || s === '1' || s === 'yes' ? 1 : 0;
};

const clampInt = (raw, min, max, fallback) => {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
};

/**
 * Unique per company among LIVE rows (soft delete means a UNIQUE index would
 * keep a deleted slug hostage). Appends -2, -3… instead of failing the save.
 */
const buildUniqueSlug = async (base, companyId, excludeId = null) => {
    const root = slugify(base) || 'category';
    const where = { slug: { [Op.like]: `${root}%` } };
    if (companyId !== undefined && companyId !== null) where.company_id = companyId;
    if (excludeId) where.id = { [Op.ne]: excludeId };

    const taken = new Set(
        (await HomeScreenCategory.findAll({ where, attributes: ['slug'], raw: true })).map((r) => r.slug)
    );
    if (!taken.has(root)) return root;
    for (let i = 2; i < 1000; i += 1) {
        if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
    }
    return `${root}-${Date.now()}`;
};

const pickWritable = (data = {}) => {
    const payload = WRITABLE_FIELDS.reduce((acc, key) => {
        if (data[key] !== undefined) acc[key] = data[key];
        return acc;
    }, {});
    if (payload.name !== undefined) payload.name = String(payload.name ?? '').trim().slice(0, 150);
    if (payload.is_active !== undefined) payload.is_active = toBit(payload.is_active, 1);
    if (payload.sort_order !== undefined) payload.sort_order = clampInt(payload.sort_order, 0, 999999, 0);
    return payload;
};

/** Templates per category, in ONE grouped query (prod is ~374 ms a round trip). */
const templateCountsByCategory = async (categoryIds = []) => {
    if (!categoryIds.length) return {};
    const rows = await HomeScreenTemplate.findAll({
        where: { home_screen_category_id: categoryIds },
        attributes: ['home_screen_category_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['home_screen_category_id'],
        raw: true,
    });
    return rows.reduce((acc, row) => {
        acc[row.home_screen_category_id] = Number(row.count) || 0;
        return acc;
    }, {});
};

const getAll = async (query = {}, companyId = undefined) => {
    const listQuery = { sort_by: 'sort_order', sort_order: 'ASC', ...query };
    const where = {};
    if (query.is_active !== undefined && query.is_active !== '' && query.is_active !== 'all') {
        where.is_active = toBit(query.is_active, 1);
    }
    // baseService's own `status` handling would look for a `status` column.
    const { status, ...restQuery } = listQuery;

    const result = await baseService.getAll(HomeScreenCategory, MODEL_NAME, restQuery, {
        searchFields: ['name', 'slug'],
        sortableFields: ['sort_order', 'name', 'slug', 'created_at', 'updated_at'],
        companyId,
        moduleSlug: MODULE_SLUG,
        where,
    });

    const counts = await templateCountsByCategory(result.data.map((r) => r.id));
    return {
        ...result,
        data: result.data.map((row) => {
            const plain = row && row.toJSON ? row.toJSON() : { ...row };
            plain.templates_count = counts[plain.id] ?? 0;
            return plain;
        }),
    };
};

const getById = async (id, companyId = undefined) =>
    baseService.getById(HomeScreenCategory, MODEL_NAME, id, { companyId });

const create = async (data, userId = null, companyId = undefined) => {
    const payload = pickWritable(data);
    if (!payload.name) throw ApiError.badRequest('Category name is required.');
    payload.slug = await buildUniqueSlug(payload.slug || payload.name, companyId);
    const created = await baseService.create(HomeScreenCategory, MODEL_NAME, payload, userId, companyId);
    return getById(created.id, companyId);
};

const update = async (id, data, userId = null, companyId = undefined) => {
    const category = await HomeScreenCategory.findByPk(id);
    if (!category) throw ApiError.notFound('Category not found');
    if (companyId !== undefined && companyId !== null && category.company_id && category.company_id !== companyId) {
        throw ApiError.notFound('Category not found');
    }
    const payload = pickWritable(data);
    if (payload.name !== undefined && !payload.name) throw ApiError.badRequest('Category name is required.');
    // Regenerated only when the slug is explicitly sent — a rename alone keeps it.
    if (payload.slug !== undefined) {
        payload.slug = await buildUniqueSlug(payload.slug || payload.name || category.name, companyId, category.id);
    }
    await baseService.update(HomeScreenCategory, MODEL_NAME, id, payload, userId, companyId);
    return getById(id, companyId);
};

/** Drag-and-drop order, in one transaction. Ids not owned by this company are skipped. */
const reorder = async (items = [], userId = null, companyId = undefined) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw ApiError.badRequest('Provide an array of { id, sort_order }.');
    }
    const ids = items.map((i) => parseInt(i.id, 10)).filter((n) => !Number.isNaN(n));
    const where = { id: ids };
    if (companyId !== undefined && companyId !== null) where.company_id = companyId;
    const owned = await HomeScreenCategory.findAll({ where, attributes: ['id'], raw: true });
    const ownedIds = new Set(owned.map((r) => r.id));

    await sequelize.transaction(async (transaction) => {
        for (const item of items) {
            const id = parseInt(item.id, 10);
            if (!ownedIds.has(id)) continue;
            await HomeScreenCategory.update(
                { sort_order: parseInt(item.sort_order, 10) || 0, updated_by: userId },
                { where: { id }, transaction }
            );
        }
    });
    return { updated: ownedIds.size };
};

const updateStatus = async (id, is_active, userId = null, companyId = undefined) => {
    await baseService.update(HomeScreenCategory, MODEL_NAME, id, { is_active: toBit(is_active, 1) }, userId, companyId);
    return getById(id, companyId);
};

/**
 * Soft delete. The templates filed under it are KEPT and show without a style;
 * restoring the category puts them back, because their column is left alone.
 */
const deleteById = async (id, userId = null, companyId = undefined) => {
    const templates = await HomeScreenTemplate.count({ where: { home_screen_category_id: id } });
    await baseService.remove(HomeScreenCategory, MODEL_NAME, id, userId, companyId);
    return { orphaned_templates: templates };
};

module.exports = {
    getAll,
    getById,
    create,
    update,
    updateStatus,
    reorder,
    deleteById,
    // Alias used by approval.service.js executeApprovedAction
    remove: deleteById,
};
