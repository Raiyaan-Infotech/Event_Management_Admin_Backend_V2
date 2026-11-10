const service = require('../services/clientNearbyPlace.service');
const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');

/** Near By places (2026-11-10) — see clientNearbyPlace.service. */

const list = asyncHandler(async (req, res) => {
    const result = await service.list(req.websiteClient.id, req.params.id);
    return ApiResponse.success(res, result, 'Nearby places loaded.');
});

const suggestions = asyncHandler(async (req, res) => {
    const { q, categories, radius_km: radius, sort } = req.query;
    const result = await service.suggestions(req.websiteClient.id, req.params.id, { q, categories, radius_km: radius, sort });
    return ApiResponse.success(res, result, 'Suggestions loaded.');
});

const add = asyncHandler(async (req, res) => {
    const result = await service.add(req.websiteClient.id, req.params.id, { places: req.body.places });
    return ApiResponse.created(res, result, result.added === 1 ? 'Nearby place added.' : 'Nearby places added.');
});

const update = asyncHandler(async (req, res) => {
    const body = {};
    for (const f of ['name', 'description', 'category_key', 'show_in_app']) {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) body[f] = req.body[f];
    }
    const place = await service.update(req.websiteClient.id, req.params.placeId, body);
    return ApiResponse.success(res, { place }, 'Nearby place updated.');
});

const remove = asyncHandler(async (req, res) => {
    const result = await service.remove(req.websiteClient.id, req.params.placeId);
    return ApiResponse.success(res, result, 'Nearby place deleted.');
});

const reorder = asyncHandler(async (req, res) => {
    const result = await service.reorder(req.websiteClient.id, req.params.id, { ids: req.body.ids });
    return ApiResponse.success(res, result, 'Order saved.');
});

module.exports = { list, suggestions, add, update, remove, reorder };
