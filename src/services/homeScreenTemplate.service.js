const { Sequelize, User, HomeScreenTemplate, EventCategory, HomeScreenCategory, sequelize } = require('../models');
const baseService = require('./base.service');
const ApiError = require('../utils/apiError');

const MODEL_NAME = 'HomeScreenTemplate';
const MODULE_SLUG = 'home_screen_templates';

/**
 * Home Screen Templates — the mobile app's event home screen design per event
 * category (admin → Template → Home Screen Templates, 2026-10-30).
 *
 * The row is: a name + description, the event category it is for, a Template
 * Style (a home_screen_categories row: Classic, Royal...), the uploaded 9:16 image,
 * and a 2–5 colour palette in a fixed role order.
 */

/** The colour roles, in order. `color_count` takes the first N. */
const COLOR_ROLES = [
    { key: 'primary', label: 'Primary' },
    { key: 'secondary', label: 'Secondary' },
    { key: 'accent', label: 'Accent' },
    { key: 'background', label: 'Background' },
    { key: 'text', label: 'Text' },
];
const MIN_COLORS = 2;
const MAX_COLORS = 5;

const WRITABLE_FIELDS = [
    'name', 'description', 'event_category_id', 'home_screen_category_id',
    'image_url', 'image_name', 'image_size', 'color_count', 'colors',
    'notes', 'is_active', 'sort_order',
];

const INCLUDE = [
    { model: EventCategory, as: 'eventCategory', attributes: ['id', 'name', 'icon'], required: false },
    { model: HomeScreenCategory, as: 'style', attributes: ['id', 'name', 'slug'], required: false },
];
const AUDIT_INCLUDE = [
    { model: User, as: 'creator', attributes: ['id', 'full_name'], required: false },
    { model: User, as: 'updater', attributes: ['id', 'full_name'], required: false },
];

const toBit = (value, fallback = 1) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value ? 1 : 0;
    const s = String(value).toLowerCase();
    if (s === '2') return 2; // pending approval, set by the approval middleware
    return s === 'true' || s === '1' || s === 'yes' ? 1 : 0;
};

const toId = (raw) => {
    if (raw === undefined) return undefined;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) || n <= 0 ? null : n;
};

/** `#abc` / `abc` → `#AABBCC`; anything else → null. */
const normaliseHex = (raw) => {
    const body = String(raw || '').trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]+$/.test(body)) return null;
    if (body.length === 3) return `#${body.split('').map((c) => c + c).join('').toUpperCase()}`;
    if (body.length === 6) return `#${body.toUpperCase()}`;
    return null;
};

/**
 * The palette, validated: `count` entries in COLOR_ROLES order, each a real
 * 6-digit hex. Accepts a list of {key, hex} or of plain hex strings; a role is
 * matched by `key` first, then by position.
 */
const toColors = (raw, count) => {
    const list = Array.isArray(raw) ? raw : [];
    const byKey = new Map();
    list.forEach((item) => {
        if (item && typeof item === 'object' && item.key) byKey.set(String(item.key), item.hex);
    });
    return COLOR_ROLES.slice(0, count).map((role, i) => {
        const source = byKey.has(role.key)
            ? byKey.get(role.key)
            : (typeof list[i] === 'string' ? list[i] : list[i]?.hex);
        const hex = normaliseHex(source);
        if (!hex) throw ApiError.badRequest(`Please enter a valid ${role.label} colour (e.g. #F76AA5).`);
        return { key: role.key, label: role.label, hex };
    });
};

const pickWritable = (data = {}) => {
    const p = WRITABLE_FIELDS.reduce((acc, key) => {
        if (data[key] !== undefined) acc[key] = data[key];
        return acc;
    }, {});
    if (p.name !== undefined) p.name = String(p.name ?? '').trim().slice(0, 150);
    for (const [key, max] of [['description', 300], ['notes', 200], ['image_url', 500], ['image_name', 255]]) {
        if (p[key] !== undefined) p[key] = String(p[key] ?? '').trim().slice(0, max) || null;
    }
    if (p.event_category_id !== undefined) p.event_category_id = toId(p.event_category_id);
    if (p.home_screen_category_id !== undefined) p.home_screen_category_id = toId(p.home_screen_category_id);
    if (p.image_size !== undefined) {
        const n = parseInt(p.image_size, 10);
        p.image_size = Number.isNaN(n) || n < 0 ? null : n;
    }
    if (p.color_count !== undefined) {
        const n = parseInt(p.color_count, 10);
        if (Number.isNaN(n) || n < MIN_COLORS || n > MAX_COLORS) {
            throw ApiError.badRequest(`Colour count must be between ${MIN_COLORS} and ${MAX_COLORS}.`);
        }
        p.color_count = n;
    }
    if (p.is_active !== undefined) p.is_active = toBit(p.is_active, 1);
    if (p.sort_order !== undefined) {
        const n = parseInt(p.sort_order, 10);
        p.sort_order = Number.isNaN(n) ? 0 : Math.max(0, n);
    }
    return p;
};

const assertRefs = async (p) => {
    if (p.event_category_id) {
        const c = await EventCategory.findByPk(p.event_category_id, { attributes: ['id'] });
        if (!c) throw ApiError.badRequest('Selected event category does not exist.');
    }
    if (p.home_screen_category_id) {
        const c = await HomeScreenCategory.findByPk(p.home_screen_category_id, { attributes: ['id'] });
        if (!c) throw ApiError.badRequest('Selected template style does not exist.');
    }
};

/** The required-field check shared by create and update (on the merged row). */
const assertComplete = (row) => {
    const missing = [];
    if (!row.name) missing.push('Template Name');
    if (!row.description) missing.push('Description');
    if (!row.event_category_id) missing.push('Event Category');
    if (!row.home_screen_category_id) missing.push('Template Style');
    if (!row.image_url) missing.push('Home Screen Image');
    if (missing.length) throw ApiError.badRequest(`Please fill all mandatory fields: ${missing.join(', ')}.`);
};

const shape = (row) => {
    const plain = row && row.toJSON ? row.toJSON() : { ...row };
    let colors = plain.colors;
    if (typeof colors === 'string') {
        try { colors = JSON.parse(colors); } catch { colors = []; }
    }
    plain.colors = Array.isArray(colors) ? colors : [];
    return plain;
};

const getAll = async (query = {}, companyId = undefined) => {
    const where = {};
    const eventCategoryId = toId(query.event_category_id);
    if (eventCategoryId) where.event_category_id = eventCategoryId;
    const styleId = toId(query.home_screen_category_id);
    if (styleId) where.home_screen_category_id = styleId;
    if (query.status === 'active') where.is_active = 1;
    else if (query.status === 'inactive') where.is_active = 0;

    const { status, ...rest } = { sort_by: 'created_at', sort_order: 'DESC', ...query };
    const result = await baseService.getAll(HomeScreenTemplate, MODEL_NAME, rest, {
        searchFields: ['name', 'description'],
        sortableFields: ['sort_order', 'name', 'created_at', 'updated_at'],
        companyId,
        moduleSlug: MODULE_SLUG,
        include: INCLUDE,
        where,
    });
    return { ...result, data: result.data.map(shape) };
};

/** Total / Active / Inactive in one grouped query (prod is ~374 ms a round trip). */
const getStats = async (companyId = undefined) => {
    const where = {};
    if (companyId !== undefined && companyId !== null) where.company_id = companyId;
    const rows = await HomeScreenTemplate.findAll({
        where,
        attributes: ['is_active', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['is_active'],
        raw: true,
    });
    const stats = { total: 0, active: 0, inactive: 0 };
    for (const r of rows) {
        const n = Number(r.count) || 0;
        stats.total += n;
        if (Number(r.is_active) === 1) stats.active += n;
        else if (Number(r.is_active) === 0) stats.inactive += n;
    }
    return stats;
};

const getById = async (id, companyId = undefined) => {
    const row = await baseService.getById(HomeScreenTemplate, MODEL_NAME, id, {
        companyId,
        include: [...INCLUDE, ...AUDIT_INCLUDE],
    });
    return shape(row);
};

const create = async (data, userId = null, companyId = undefined) => {
    const p = pickWritable(data);
    if (p.color_count === undefined) p.color_count = 4;
    p.colors = toColors(data.colors, p.color_count);
    assertComplete(p);
    await assertRefs(p);
    const created = await baseService.create(HomeScreenTemplate, MODEL_NAME, p, userId, companyId);
    return getById(created.id, companyId);
};

const update = async (id, data, userId = null, companyId = undefined) => {
    const row = await HomeScreenTemplate.findByPk(id);
    if (!row) throw ApiError.notFound('Home screen template not found');
    if (companyId !== undefined && companyId !== null && row.company_id && row.company_id !== companyId) {
        throw ApiError.notFound('Home screen template not found');
    }
    const p = pickWritable(data);
    // Colours are re-validated whenever either the list or the count changes.
    if (data.colors !== undefined || p.color_count !== undefined) {
        const count = p.color_count ?? row.color_count;
        p.colors = toColors(data.colors !== undefined ? data.colors : shape(row).colors, count);
    }
    // A status-only change (toggle / approval activation) skips the full check.
    const onlyStatus = Object.keys(p).every((k) => k === 'is_active');
    if (!onlyStatus) assertComplete({ ...shape(row), ...p });
    await assertRefs(p);
    await baseService.update(HomeScreenTemplate, MODEL_NAME, id, p, userId, companyId);
    return getById(id, companyId);
};

const updateStatus = async (id, isActive, userId = null, companyId = undefined) => {
    await baseService.update(HomeScreenTemplate, MODEL_NAME, id, { is_active: toBit(isActive, 1) }, userId, companyId);
    return getById(id, companyId);
};

/**
 * For the Client Portal's Create Event wizard (Step 1).
 *
 * Only ACTIVE templates, optionally for one event category. The style chips
 * are NOT a fixed list: `styles` is built from the Template Categories the
 * returned templates actually use (in that category's own sort order), so a new
 * style added in the admin appears in the portal with no code change, and a
 * style with no template for this category is never shown as an empty chip.
 */
const listForClient = async ({ eventCategoryId } = {}) => {
    const where = { is_active: 1 };
    const categoryId = toId(eventCategoryId);
    if (categoryId) where.event_category_id = categoryId;

    const rows = await HomeScreenTemplate.findAll({
        where,
        attributes: [
            'id', 'name', 'description', 'event_category_id', 'home_screen_category_id',
            'image_url', 'color_count', 'colors', 'sort_order', 'created_at',
        ],
        include: [
            { model: EventCategory, as: 'eventCategory', attributes: ['id', 'name'], required: false },
            { model: HomeScreenCategory, as: 'style', attributes: ['id', 'name', 'slug', 'sort_order'], required: false },
        ],
        order: [['sort_order', 'ASC'], ['created_at', 'ASC']],
    });

    const templates = rows.map(shape);

    const styleMap = new Map();
    for (const t of templates) {
        if (t.style && !styleMap.has(t.style.id)) styleMap.set(t.style.id, t.style);
    }
    const styles = [...styleMap.values()]
        .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name).localeCompare(String(b.name)))
        .map(({ id, name, slug }) => ({ id, name, slug }));

    return { templates, styles };
};

const deleteById = async (id, userId = null, companyId = undefined) =>
    baseService.remove(HomeScreenTemplate, MODEL_NAME, id, userId, companyId);

module.exports = {
    getAll,
    getStats,
    getById,
    create,
    update,
    updateStatus,
    deleteById,
    listForClient,
    // Alias used by approval.service.js executeApprovedAction
    remove: deleteById,
    COLOR_ROLES,
};
