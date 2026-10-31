const service = require('../services/homeScreenTemplate.service');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /client/home-screen-templates?event_category_id=
 * The mobile app home screen designs a client can pick in the Create Event
 * wizard, plus the style chips (from Template Categories) to filter them by.
 */
const list = asyncHandler(async (req, res) => {
    const result = await service.listForClient({ eventCategoryId: req.query.event_category_id });
    return ApiResponse.success(res, result);
});

module.exports = { list };
