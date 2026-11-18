const service = require('../services/clientBooking.service');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/helpers');

// Per-event plans (2026-11-19): booked dates with the plan chosen for each event.
const list = asyncHandler(async (req, res) => ApiResponse.success(res, await service.listBookings(req.websiteClient.id, req.query)));
const summary = asyncHandler(async (req, res) => ApiResponse.success(res, await service.summary(req.websiteClient.id)));
const getOne = asyncHandler(async (req, res) => ApiResponse.success(res, await service.getBooking(req.websiteClient.id, req.params.id)));
const create = asyncHandler(async (req, res) => {
    const result = await service.createBooking(req.websiteClient.id, req.body);
    return ApiResponse.success(res, result, result.transaction ? 'Date booked — payment details saved' : 'Date booked', 201);
});

module.exports = { list, summary, getOne, create };
