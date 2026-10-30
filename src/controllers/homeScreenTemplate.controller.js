const service = require('../services/homeScreenTemplate.service');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/helpers');

const getAll = asyncHandler(async (req, res) => {
    const result = await service.getAll(req.query, req.companyId);
    logger.logRequest(req, `Fetched ${result.data.length} home screen templates`);
    return ApiResponse.paginated(res, result.data, result.pagination);
});

const getStats = asyncHandler(async (req, res) => {
    const stats = await service.getStats(req.companyId);
    return ApiResponse.success(res, { stats });
});

const getById = asyncHandler(async (req, res) => {
    const homeScreenTemplate = await service.getById(req.params.id, req.companyId);
    return ApiResponse.success(res, { homeScreenTemplate });
});

const create = asyncHandler(async (req, res) => {
    const homeScreenTemplate = await service.create(req.body, req.user.id, req.companyId);
    logger.logRequest(req, `Created home screen template: ${homeScreenTemplate.name}`);
    return ApiResponse.success(res, { homeScreenTemplate }, 'Template created successfully', 201);
});

const update = asyncHandler(async (req, res) => {
    const homeScreenTemplate = await service.update(req.params.id, req.body, req.user.id, req.companyId);
    logger.logRequest(req, `Updated home screen template ${req.params.id}`);
    return ApiResponse.success(res, { homeScreenTemplate }, 'Template updated successfully');
});

const updateStatus = asyncHandler(async (req, res) => {
    const homeScreenTemplate = await service.updateStatus(req.params.id, req.body.is_active, req.user.id, req.companyId);
    return ApiResponse.success(res, { homeScreenTemplate }, 'Template status updated successfully');
});

const deleteById = asyncHandler(async (req, res) => {
    await service.deleteById(req.params.id, req.user.id, req.companyId);
    logger.logRequest(req, `Deleted home screen template ${req.params.id}`);
    return ApiResponse.success(res, null, 'Template deleted successfully');
});

module.exports = { getAll, getStats, getById, create, update, updateStatus, deleteById };
