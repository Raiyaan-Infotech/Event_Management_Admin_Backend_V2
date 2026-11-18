const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/helpers');
const crudController = require('./crud.controller');

/** Controller for slugCategory.service.js modules: the common CRUD answers + PATCH /reorder. */
const build = ({ service, orphanKey, orphanWords }) => {
    const handlers = crudController.build({
        service,
        resourceKey: 'category',
        title: 'Category',
        deleteMessage: (data) => {
            const n = (data && data[orphanKey]) || 0;
            return n ? `Category deleted. ${n} ${n === 1 ? orphanWords[0] : orphanWords[1]}` : null;
        },
    });
    handlers.reorder = asyncHandler(async (req, res) => {
        const result = await service.reorder(req.body.items, req.user.id, req.companyId);
        logger.logRequest(req, `Reordered ${result.updated} categories`);
        return ApiResponse.success(res, result, 'Category order updated successfully');
    });
    return handlers;
};

module.exports = { build };
