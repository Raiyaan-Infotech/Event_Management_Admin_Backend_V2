const crud = require('./crud.service');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

/**
 * Shared builder for the global "coded" masters: Currencies and Languages. Built on the common CRUD
 * kit (crud.service.js). Rules (unchanged from the two hand-written copies it replaces):
 *   - global tables (no company scoping); `code` is unique → 409 "<Title> with this code already exists";
 *   - the default row cannot be deleted; delete suffixes the code so it can be reused;
 *   - setDefault() makes one row the default (all others off);
 *   - getActive() = the public dropdown list (GET /active, no login), default first, then by name.
 * New: a blank name is refused.
 * `onDelete(row, userId)` / `restoreDeleted` cover what only one of them does (Languages: translations).
 */
const build = ({ Model, modelName, moduleSlug, title, searchFields, sortableFields, activeAttributes, onDelete, extend }) => {
    const service = crud.build({
        Model,
        modelName,
        moduleSlug,
        companyScoped: false,
        searchFields,
        sortableFields,
        notFound: `${title} not found`,
        unique: [{ field: 'code', message: `${title} with this code already exists`, conflict: true }],
        name: { required: `${title} name is required`, unique: false },
        deleteUniqueFields: ['code'],
        beforeDelete: async (id, userId) => {
            const row = await Model.findByPk(id);
            if (!row) throw ApiError.notFound(`${title} not found`);
            if (row.is_default) throw ApiError.badRequest(`Cannot delete default ${title.toLowerCase()}`);
            if (onDelete) await onDelete(row, userId);
            return undefined;
        },
    });

    service.getActive = async () => {
        const rows = await Model.findAll({
            where: { is_active: true },
            attributes: activeAttributes,
            order: [['is_default', 'DESC'], ['name', 'ASC']],
        });
        logger.logDB('getActive', modelName);
        return rows;
    };

    service.setDefault = async (id, userId = null) => {
        const row = await Model.findByPk(id);
        if (!row) throw ApiError.notFound(`${title} not found`);
        await Model.update({ is_default: false }, { where: {} });
        await row.update({ is_default: true, updated_by: userId });
        logger.logDB('setDefault', modelName, id);
        logger.logActivity(userId, 'set_default', modelName, `Set default ${title.toLowerCase()}: ${row.name}`, { recordId: id });
        return row;
    };

    return extend ? Object.assign(service, extend(service)) : service;
};

module.exports = { build };
