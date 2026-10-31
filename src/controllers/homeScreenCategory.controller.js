const service = require('../services/homeScreenCategory.service');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/helpers');

const getAll = asyncHandler(async (req, res) => {
    const result = await service.getAll(req.query, req.companyId);
    logger.logRequest(req, `Fetched ${result.data.length} home screen categories`);
    return ApiResponse.paginated(res, result.data, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
    const category = await service.getById(req.params.id, req.companyId);
    return ApiResponse.success(res, { category });
});

const create = asyncHandler(async (req, res) => {
    const category = await service.create(req.body, req.user.id, req.companyId);
    logger.logRequest(req, `Created home screen category: ${category.name}`);
    return ApiResponse.success(res, { category }, 'Category created successfully', 201);
});

const update = asyncHandler(async (req, res) => {
    const category = await service.update(req.params.id, req.body, req.user.id, req.companyId);
    logger.logRequest(req, `Updated home screen category ${req.params.id}`);
    return ApiResponse.success(res, { category }, 'Category updated successfully');
});

const updateStatus = asyncHandler(async (req, res) => {
    const category = await service.updateStatus(req.params.id, req.body.is_active, req.user.id, req.companyId);
    return ApiResponse.success(res, { category }, 'Category status updated successfully');
});

const reorder = asyncHandler(async (req, res) => {
    const result = await service.reorder(req.body.items, req.user.id, req.companyId);
    logger.logRequest(req, `Reordered ${result.updated} home screen categories`);
    return ApiResponse.success(res, result, 'Category order updated successfully');
});

const deleteById = asyncHandler(async (req, res) => {
    const result = await service.deleteById(req.params.id, req.user.id, req.companyId);
    logger.logRequest(req, `Deleted home screen category ${req.params.id}`);
    const orphaned = result?.orphaned_templates || 0;
    const message = orphaned
        ? `Category deleted. ${orphaned} home screen template${orphaned === 1 ? '' : 's'} now have no style.`
        : 'Category deleted successfully';
    return ApiResponse.success(res, result, message);
});

module.exports = { getAll, getById, create, update, updateStatus, reorder, deleteById };
