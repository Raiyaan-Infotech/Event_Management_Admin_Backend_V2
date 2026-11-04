const service = require('../services/clientRsvpBoard.service');
const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');

/** RSVP board (portal "RSVP Responses", 2026-11-04) — see clientRsvpBoard.service. */

const list = asyncHandler(async (req, res) => {
    const result = await service.list(req.websiteClient.id, req.params.id, req.query);
    return ApiResponse.success(res, result, 'RSVP responses loaded.');
});

const update = asyncHandler(async (req, res) => {
    const row = await service.update(req.websiteClient.id, req.params.guestId, req.body);
    return ApiResponse.success(res, { row }, 'RSVP status updated.');
});

const hide = asyncHandler(async (req, res) => {
    const row = await service.hide(req.websiteClient.id, req.params.guestId, req.body);
    return ApiResponse.success(res, { row }, row.rsvp.hidden ? 'Response hidden.' : 'Response shown.');
});

const clear = asyncHandler(async (req, res) => {
    const row = await service.clear(req.websiteClient.id, req.params.guestId);
    return ApiResponse.success(res, { row }, 'Response deleted.');
});

module.exports = { list, update, hide, clear };
