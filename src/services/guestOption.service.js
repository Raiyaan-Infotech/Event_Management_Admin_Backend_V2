const { EventCategory } = require('../models');
const crud = require('./crud.service');
const ApiError = require('../utils/apiError');

/**
 * Shared behaviour of the per-event-category option lists (Relationship with Invitor, Food
 * Preference, Contact Person Responsibilities). Same table shape: event_category_id (null = the
 * fallback list), name, description, icon, color, sort_order, is_active.
 *
 * Built on the common CRUD kit (crud.service.js); the list-specific rules are:
 *   - `?event_category_id=` filters the admin list (a number, or `null` for the fallback list);
 *   - the category must exist; the name is unique within (company, category);
 *   - listForCategory() — the app's dropdown: the category's own rows, else the fallback list.
 */

const WRITABLE_FIELDS = ['event_category_id', 'name', 'description', 'icon', 'color', 'sort_order', 'is_active'];

/** undefined = no filter / not sent; null = the fallback list; a positive integer = that category. */
const parseCategoryId = (value) => {
    if (value === undefined || value === '') return undefined;
    if (value === 'null' || value === null) return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
};

const assertCategoryExists = async (categoryId) => {
    if (categoryId === null || categoryId === undefined) return;
    const cat = await EventCategory.findByPk(categoryId, { attributes: ['id'] });
    if (!cat) throw ApiError.badRequest('That event category does not exist.');
};

const build = ({ Model, modelName, moduleSlug, label }) => crud.build({
    Model,
    modelName,
    moduleSlug,
    writable: WRITABLE_FIELDS,
    searchFields: ['name', 'description'],
    sortableFields: ['sort_order', 'name', 'created_at'],
    defaultSort: { sort_by: 'sort_order', sort_order: 'ASC' },
    include: [{ model: EventCategory, as: 'category', attributes: ['id', 'name'], required: false }],
    listWhere: (query) => {
        const categoryId = parseCategoryId(query.event_category_id);
        return categoryId === undefined ? undefined : { event_category_id: categoryId };
    },
    notFound: `That ${label} was not found.`,
    name: {
        required: `A ${label} name is required.`,
        duplicate: (n) => `"${n}" is already in this list.`,
    },
    uniqueScope: (payload, row) => ({
        event_category_id: (payload.event_category_id !== undefined ? payload.event_category_id : row && row.event_category_id) ?? null,
    }),
    beforeSave: async (payload, { isCreate }) => {
        if (isCreate || payload.event_category_id !== undefined) {
            payload.event_category_id = parseCategoryId(payload.event_category_id) ?? null;
            await assertCategoryExists(payload.event_category_id);
        }
    },
    extend: () => ({
        listForCategory: async (categoryId, companyId = 1) => {
            const query = (where) => Model.findAll({
                where: { company_id: companyId, is_active: 1, ...where },
                attributes: ['id', 'name', 'sort_order'],
                order: [['sort_order', 'ASC'], ['name', 'ASC']],
            });
            if (categoryId) {
                const scoped = await query({ event_category_id: categoryId });
                if (scoped.length) return scoped;
            }
            return query({ event_category_id: null });
        },
    }),
});

module.exports = { build, parseCategoryId, WRITABLE_FIELDS };
