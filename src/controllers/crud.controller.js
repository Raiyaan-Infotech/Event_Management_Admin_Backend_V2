const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/helpers');

/**
 * Common CRUD controller (V2 clean-up step 4, 2026-11-19) — pairs with services/crud.service.js.
 *
 *   module.exports = crudController.build({ service, resourceKey: 'notificationCategory', title: 'Notification category' });
 *
 * Answers (unchanged from the hand-written controllers):
 *   GET    /       paginated list
 *   GET    /:id    { [resourceKey]: row }
 *   POST   /       201 { [resourceKey]: row }  "<title> created successfully"
 *   PUT    /:id    { [resourceKey]: row }      "<title> updated successfully"
 *   PATCH  /:id/status                         "<title> status updated successfully"
 *   DELETE /:id    null                        "<title> deleted successfully"
 *
 * `remove` is the same handler as `deleteById` (some routers use that name).
 */
const build = ({ service, resourceKey, title }) => {
    const log = String(title).toLowerCase();

    const handlers = {
        getAll: asyncHandler(async (req, res) => {
            const result = await service.getAll(req.query, req.companyId);
            logger.logRequest(req, `Fetched ${result.data.length} ${log} rows`);
            return ApiResponse.paginated(res, result.data, result.pagination);
        }),

        getById: asyncHandler(async (req, res) => {
            const row = await service.getById(req.params.id, req.companyId);
            logger.logRequest(req, `Fetched ${log} ${req.params.id}`);
            return ApiResponse.success(res, { [resourceKey]: row });
        }),

        create: asyncHandler(async (req, res) => {
            const row = await service.create(req.body, req.user.id, req.companyId);
            logger.logRequest(req, `Created ${log} ${row.id}`);
            return ApiResponse.success(res, { [resourceKey]: row }, `${title} created successfully`, 201);
        }),

        update: asyncHandler(async (req, res) => {
            const row = await service.update(req.params.id, req.body, req.user.id, req.companyId);
            logger.logRequest(req, `Updated ${log} ${req.params.id}`);
            return ApiResponse.success(res, { [resourceKey]: row }, `${title} updated successfully`);
        }),

        updateStatus: asyncHandler(async (req, res) => {
            const row = await service.updateStatus(req.params.id, req.body.is_active, req.user.id, req.companyId);
            logger.logRequest(req, `Updated status for ${log} ${req.params.id}`);
            return ApiResponse.success(res, { [resourceKey]: row }, `${title} status updated successfully`);
        }),

        deleteById: asyncHandler(async (req, res) => {
            await service.deleteById(req.params.id, req.user.id, req.companyId);
            logger.logRequest(req, `Deleted ${log} ${req.params.id}`);
            return ApiResponse.success(res, null, `${title} deleted successfully`);
        }),
    };
    handlers.remove = handlers.deleteById;
    return handlers;
};

module.exports = { build };
