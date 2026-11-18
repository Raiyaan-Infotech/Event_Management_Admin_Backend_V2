const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/helpers');
const crudController = require('./crud.controller');

/** Controller for codedMaster.service.js modules: the common CRUD answers + GET /active + PATCH /:id/default. */
const build = ({ service, resourceKey, listKey, title }) => {
    const handlers = crudController.build({ service, resourceKey, title });
    handlers.getActive = asyncHandler(async (req, res) => {
        const rows = await service.getActive();
        logger.logRequest(req, `Get active ${listKey}`);
        return ApiResponse.success(res, { [listKey]: rows });
    });
    handlers.setDefault = asyncHandler(async (req, res) => {
        const row = await service.setDefault(req.params.id, req.user.id);
        logger.logRequest(req, `Set default ${resourceKey}`);
        return ApiResponse.success(res, { [resourceKey]: row }, `Default ${title.toLowerCase()} updated successfully`);
    });
    handlers.delete = handlers.deleteById;
    return handlers;
};

module.exports = { build };
