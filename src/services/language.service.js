const { Language, Translation } = require('../models');
const codedMaster = require('./codedMaster.service');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

/**
 * Languages (global). Shared behaviour: codedMaster.service.js (on the common CRUD kit).
 * Language-only: deleting switches its translations off; creating a code that belongs to a
 * soft-deleted language restores that language (and switches its translations back on).
 */
module.exports = codedMaster.build({
    Model: Language,
    modelName: 'Language',
    moduleSlug: 'languages',
    title: 'Language',
    searchFields: ['name', 'code', 'native_name'],
    sortableFields: ['created_at', 'name', 'code'],
    activeAttributes: ['id', 'name', 'code', 'native_name', 'direction', 'is_default'],
    onDelete: async (row, userId) => {
        const [count] = await Translation.update({ is_active: false, updated_by: userId }, { where: { language_id: row.id } });
        logger.logDB('deactivate', 'Translation', `Deactivated ${count} translations for language ${row.id}`);
    },
    extend: (service) => {
        const createNew = service.create;
        return {
            create: async (data, userId = null, companyId = undefined) => {
                if (data.code) {
                    const active = await Language.findOne({ where: { code: data.code } });
                    if (active) throw ApiError.conflict('Language with this code already exists');
                    const deleted = await Language.findOne({ where: { code: data.code }, paranoid: false });
                    if (deleted) {
                        await deleted.restore();
                        await deleted.update({ ...service.pickWritable(data), is_active: true, updated_by: userId });
                        await Translation.update({ is_active: true, updated_by: userId }, { where: { language_id: deleted.id } });
                        logger.logDB('restore', 'Language', deleted.id);
                        return deleted;
                    }
                }
                return createNew(data, userId, companyId);
            },
        };
    },
});
