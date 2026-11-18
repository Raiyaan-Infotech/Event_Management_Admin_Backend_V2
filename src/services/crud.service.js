const { Op } = require('sequelize');
const baseService = require('./base.service');
const ApiError = require('../utils/apiError');

/**
 * Common CRUD service (V2 clean-up step 4, 2026-11-19).
 *
 * One module = one call:
 *
 *   module.exports = crud.build({
 *       Model: NotificationCategory, modelName: 'NotificationCategory', moduleSlug: 'notification_categories',
 *       writable: ['name', 'description', 'icon', 'color', 'sort_order', 'is_active'],
 *       searchFields: ['name', 'description'], sortableFields: ['sort_order', 'name', 'created_at'],
 *       defaultSort: { sort_by: 'sort_order', sort_order: 'ASC' },
 *       name: { required: 'Category name is required', duplicate: (n) => `… "${n}" already exists.` },
 *   });
 *
 * and gets getAll / getById / create / update / updateStatus / deleteById (+ `remove`, the name the
 * approval service calls). Everything runs through base.service.js, so company scoping, activity
 * log, secret redaction, pending-approval flags and the soft-delete slug suffix stay in one place.
 *
 * Rules every module now gets for free:
 *   - only `writable` fields are ever written (never id, company_id, created_by … from a body);
 *     without a list, every model column except PROTECTED is writable;
 *   - the name (when `name` is given) is trimmed, required and unique per company (+ `uniqueScope`);
 *   - status is stored as 1 / 0.
 *
 * Module-specific rules go in `beforeSave(payload, { row, companyId, isCreate })` (throw an ApiError
 * to refuse) and extra methods in `extend(service)`.
 */

const PROTECTED = new Set([
    'id', 'company_id', 'vendor_id', 'created_by', 'updated_by', 'created_at', 'updated_at', 'deleted_at',
    'createdAt', 'updatedAt', 'deletedAt',
]);

const build = (cfg) => {
    const {
        Model,
        modelName,
        moduleSlug,
        writable,
        searchFields = ['name'],
        sortableFields = ['created_at'],
        defaultSort = null,
        include,
        listWhere,
        name = null,
        uniqueScope,
        notFound = `${modelName} not found`,
        beforeSave,
        extend,
    } = cfg;

    const fields = writable || Object.keys(Model.rawAttributes).filter((k) => !PROTECTED.has(k));
    const nameField = name ? name.field || 'name' : null;

    const pickWritable = (data = {}) => fields.reduce((acc, key) => {
        if (data[key] !== undefined) acc[key] = data[key];
        return acc;
    }, {});

    const assertName = async (payload, { row = null, companyId } = {}) => {
        if (!nameField) return;
        if (row && payload[nameField] === undefined && !uniqueScope) return;
        if (payload[nameField] !== undefined || !row) {
            const value = String(payload[nameField] ?? '').trim();
            if (!value) throw ApiError.badRequest(name.required);
            payload[nameField] = value;
        }
        const finalName = payload[nameField] ?? row[nameField];
        const where = {
            company_id: (companyId ?? (row ? row.company_id : null)) ?? null,
            [nameField]: finalName,
            ...(uniqueScope ? uniqueScope(payload, row) : {}),
        };
        if (row) where.id = { [Op.ne]: row.id };
        const hit = await Model.findOne({ where, attributes: ['id'] });
        if (hit) throw ApiError.badRequest(name.duplicate(finalName));
    };

    const service = {
        getAll: async (query = {}, companyId = undefined) => baseService.getAll(Model, modelName, defaultSort ? { ...defaultSort, ...query } : query, {
            searchFields,
            sortableFields,
            companyId,
            moduleSlug,
            where: listWhere ? listWhere(query) : undefined,
            include,
        }),

        getById: async (id, companyId = undefined) => baseService.getById(Model, modelName, id, { companyId }),

        create: async (data, userId = null, companyId = undefined) => {
            const payload = pickWritable(data);
            if (beforeSave) await beforeSave(payload, { row: null, companyId, isCreate: true });
            await assertName(payload, { companyId });
            return baseService.create(Model, modelName, payload, userId, companyId);
        },

        update: async (id, data, userId = null, companyId = undefined) => {
            const row = await Model.findByPk(id);
            if (!row) throw ApiError.notFound(notFound);
            const payload = pickWritable(data);
            if (beforeSave) await beforeSave(payload, { row, companyId, isCreate: false });
            await assertName(payload, { row, companyId });
            return baseService.update(Model, modelName, id, payload, userId, companyId);
        },

        updateStatus: async (id, isActive, userId = null, companyId = undefined) =>
            baseService.update(Model, modelName, id, { is_active: isActive ? 1 : 0 }, userId, companyId),

        deleteById: async (id, userId = null, companyId = undefined) =>
            baseService.remove(Model, modelName, id, userId, companyId),
    };
    service.remove = service.deleteById;
    service.pickWritable = pickWritable;

    return extend ? Object.assign(service, extend(service)) : service;
};

module.exports = { build, PROTECTED };
