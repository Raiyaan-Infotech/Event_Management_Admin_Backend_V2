const service = require('../services/eventAvailability.service');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/helpers');

// Configs
const listConfigs = asyncHandler(async (req, res) => ApiResponse.success(res, await service.listConfigs(req.query)));
const getConfig = asyncHandler(async (req, res) => ApiResponse.success(res, await service.getConfig(req.params.id)));
const createConfig = asyncHandler(async (req, res) => {
    const config = await service.createConfig(req.body, req.user.id, req.companyId);
    return ApiResponse.success(res, config, config.publish_status === 'published' ? 'Config published' : 'Config saved as draft', 201);
});
const updateConfig = asyncHandler(async (req, res) => {
    const config = await service.updateConfig(req.params.id, req.body, req.user.id);
    return ApiResponse.success(res, config, config.publish_status === 'published' ? 'Config published' : 'Config saved as draft');
});
const setConfigStatus = asyncHandler(async (req, res) => ApiResponse.success(res, await service.setConfigStatus(req.params.id, req.body.is_active, req.user.id), 'Status updated'));
const deleteConfig = asyncHandler(async (req, res) => {
    await service.deleteConfig(req.params.id);
    return ApiResponse.success(res, null, 'Config deleted');
});

// Daily list
const daily = asyncHandler(async (req, res) => ApiResponse.success(res, await service.daily(req.query)));
const dayDetails = asyncHandler(async (req, res) => ApiResponse.success(res, await service.dayDetails(req.params.configId, req.params.date)));
const DAY_MESSAGES = {
    limit: 'Daily limit updated', increase: 'Daily limit increased', full: 'Date marked as fully booked',
    disable: 'Date disabled', enable: 'Date enabled', remove: 'Date removed from the config',
};
const dayAction = asyncHandler(async (req, res) => {
    const day = await service.dayAction(req.params.configId, req.params.date, req.body, req.user.id);
    return ApiResponse.success(res, day, DAY_MESSAGES[req.body.action] || 'Saved');
});

// Overrides
const listOverrides = asyncHandler(async (req, res) => ApiResponse.success(res, await service.listOverrides(req.query)));
const getOverride = asyncHandler(async (req, res) => ApiResponse.success(res, await service.getOverride(req.params.id)));
const createOverride = asyncHandler(async (req, res) => ApiResponse.success(res, await service.createOverride(req.body, req.user.id), 'Override saved', 201));
const updateOverride = asyncHandler(async (req, res) => ApiResponse.success(res, await service.updateOverride(req.params.id, req.body, req.user.id), 'Override updated'));
const setOverrideStatus = asyncHandler(async (req, res) => ApiResponse.success(res, await service.setOverrideStatus(req.params.id, req.body.is_active, req.user.id), 'Status updated'));
const deleteOverride = asyncHandler(async (req, res) => {
    await service.deleteOverride(req.params.id);
    return ApiResponse.success(res, null, 'Override deleted');
});
const bulkOverrides = asyncHandler(async (req, res) => {
    const result = await service.bulkOverrides(req.body, req.user.id);
    const msg = `${result.done} override${result.done === 1 ? '' : 's'} updated${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}`;
    return ApiResponse.success(res, result, msg);
});

// Client portal: support / allocation requests for unavailable dates
const requestService = require('../services/availabilityRequest.service');
const createClientRequest = asyncHandler(async (req, res) => ApiResponse.success(
    res, await requestService.createRequest(req.websiteClient.id, req.body, req.file), 'Support request submitted', 201));
const listClientRequests = asyncHandler(async (req, res) => ApiResponse.success(res, await requestService.listForClient(req.websiteClient.id)));

// Super admin: Allocation Requests
const listRequests = asyncHandler(async (req, res) => ApiResponse.success(res, await requestService.listAdmin(req.query)));
const getRequest = asyncHandler(async (req, res) => ApiResponse.success(res, await requestService.getAdmin(req.params.id)));
const approveRequest = asyncHandler(async (req, res) => ApiResponse.success(res, await requestService.approve(req.params.id, req.body, req.user.id), 'Request approved'));
const rejectRequest = asyncHandler(async (req, res) => ApiResponse.success(res, await requestService.reject(req.params.id, req.body, req.user.id), 'Request rejected'));

// Client portal calendar
const clientCalendar = asyncHandler(async (req, res) => ApiResponse.success(res, await service.clientCalendar(req.query, req.websiteClient?.id)));

module.exports = {
    listConfigs, getConfig, createConfig, updateConfig, setConfigStatus, deleteConfig,
    daily, dayDetails, dayAction,
    listOverrides, getOverride, createOverride, updateOverride, setOverrideStatus, deleteOverride, bulkOverrides,
    clientCalendar, createClientRequest, listClientRequests,
    listRequests, getRequest, approveRequest, rejectRequest,
};
