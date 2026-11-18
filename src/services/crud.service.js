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
 *
 * Other options:
 *   name.unique: false      name required but may repeat
 *   statusValue(v)          how PATCH /:id/status stores its value (default 1 / 0)
 *   reload: true            create / update / status answer with a fresh getById row
 *   prepareList(query, where)  returns { query, where } just before the list runs
 *   decorateList(rows)      adds computed fields to the list rows (one query for all rows, never per row)
 *   beforeDelete(id)        what it returns becomes the DELETE answer's data
 *   companyScoped: false    a global table: company id is never applied (currencies, languages)
 *   unique: [{ field, message, conflict }]  other unique columns, checked first (conflict → 409)
 *   deleteUniqueFields      unique columns suffixed on soft delete (default slug, key)
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
        beforeDelete,
        statusValue = (v) => (v ? 1 : 0),
        reload = false,
        prepareList,
        decorateList,
        companyScoped = true,
        unique: uniques = [],
        deleteUniqueFields,
        extend,
    } = cfg;
    const scope = (companyId) => (companyScoped ? companyId : undefined);

    const assertUnique = async (payload, row = null) => {
        for (const u of uniques) {
            const value = payload[u.field];
            if (value === undefined || value === null || value === '') continue;
            if (row && value === row[u.field]) continue;
            const hit = await Model.findOne({ where: { [u.field]: value }, attributes: ['id'] });
            if (hit) throw u.conflict ? ApiError.conflict(u.message) : ApiError.badRequest(u.message);
        }
    };

    const fields = writable || Object.keys(Model.rawAttributes).filter((k) => !PROTECTED.has(k));
    const nameField = name ? name.field || 'name' : null;

    const pickWritable = (data = {}) => fields.reduce((acc, key) => {
        if (data[key] !== undefined) acc[key] = data[key];
        return acc;
    }, {});

    const unique = !name || name.unique !== false;

    const assertName = async (payload, { row = null, companyId } = {}) => {
        if (!nameField) return;
        if (row && payload[nameField] === undefined && (!uniqueScope || !unique)) return;
        if (payload[nameField] !== undefined || !row) {
            const value = String(payload[nameField] ?? '').trim();
            if (!value) throw ApiError.badRequest(name.required);
            payload[nameField] = value;
        }
        if (!unique) return;
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

    const getById = async (id, companyId = undefined) => baseService.getById(Model, modelName, id, { companyId: scope(companyId) });
    const fresh = (row, companyId) => (reload ? getById(row.id, companyId) : row);

    const service = {
        getAll: async (rawQuery = {}, cid = undefined) => {
            const companyId = scope(cid);
            let query = defaultSort ? { ...defaultSort, ...rawQuery } : rawQuery;
            let where = listWhere ? listWhere(rawQuery) : undefined;
            if (prepareList) ({ query, where } = prepareList(query, where));
            const result = await baseService.getAll(Model, modelName, query, {
                searchFields, sortableFields, companyId, moduleSlug, where, include,
            });
            if (!decorateList) return result;
            const plain = result.data.map((r) => (r && r.toJSON ? r.toJSON() : { ...r }));
            return { ...result, data: await decorateList(plain) };
        },

        getById,

        create: async (data, userId = null, cid = undefined) => {
            const companyId = scope(cid);
            const payload = pickWritable(data);
            await assertUnique(payload);
            if (beforeSave) await beforeSave(payload, { row: null, companyId, isCreate: true });
            await assertName(payload, { companyId });
            return fresh(await baseService.create(Model, modelName, payload, userId, companyId), companyId);
        },

        update: async (id, data, userId = null, cid = undefined) => {
            const companyId = scope(cid);
            const row = await Model.findByPk(id);
            if (!row) throw ApiError.notFound(notFound);
            if (companyId !== undefined && companyId !== null && row.company_id && row.company_id !== companyId) {
                throw ApiError.notFound(notFound);
            }
            const payload = pickWritable(data);
            await assertUnique(payload, row);
            if (beforeSave) await beforeSave(payload, { row, companyId, isCreate: false });
            await assertName(payload, { row, companyId });
            return fresh(await baseService.update(Model, modelName, id, payload, userId, companyId), companyId);
        },

        updateStatus: async (id, isActive, userId = null, cid = undefined) =>
            fresh(await baseService.update(Model, modelName, id, { is_active: statusValue(isActive) }, userId, scope(cid)), scope(cid)),

        deleteById: async (id, userId = null, cid = undefined) => {
            const extra = beforeDelete ? await beforeDelete(id, userId) : undefined;
            const done = await baseService.remove(Model, modelName, id, userId, scope(cid), deleteUniqueFields ? { uniqueFields: deleteUniqueFields } : {});
            return extra !== undefined ? extra : done;
        },
    };
    service.remove = service.deleteById;
    service.pickWritable = pickWritable;

    return extend ? Object.assign(service, extend(service)) : service;
};

module.exports = { build, PROTECTED };
