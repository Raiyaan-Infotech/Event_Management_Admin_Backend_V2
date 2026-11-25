const service = require('../services/msg91Config.service');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/helpers');

/** GET /api/v1/msg91-config */
const get = asyncHandler(async (req, res) => ApiResponse.success(res, { config: await service.get() }));

/** PUT /api/v1/msg91-config/:section  (general | api | sms | otp | dlt | sms_templates | email | webhook | alerts) */
const updateSection = asyncHandler(async (req, res) => {
    const config = await service.updateSection(req.params.section, req.body, req.user?.id);
    return ApiResponse.success(res, { config }, 'Settings saved');
});

/** POST /api/v1/msg91-config/test — read-only auth key check (balance), sends nothing */
const testConnection = asyncHandler(async (req, res) => ApiResponse.success(res, { config: await service.testConnection() }));

/** POST /api/v1/msg91-config/webhook-token — new token in every callback URL */
const regenerateWebhookToken = asyncHandler(async (req, res) =>
    ApiResponse.success(res, { config: await service.regenerateWebhookToken(req.user?.id) }, 'New webhook token created'));

module.exports = { get, updateSection, testConnection, regenerateWebhookToken };
