const service = require('../services/whatsappConfig.service');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/helpers');

/** GET /api/v1/whatsapp-config */
const get = asyncHandler(async (req, res) => ApiResponse.success(res, { config: await service.get() }));

/** PUT /api/v1/whatsapp-config/:section  (general | api | business | senders | templates | webhook | limits | budget) */
const updateSection = asyncHandler(async (req, res) => {
    const config = await service.updateSection(req.params.section, req.body, req.user?.id);
    return ApiResponse.success(res, { config }, 'Settings saved');
});

/** POST /api/v1/whatsapp-config/test — read-only Graph API lookup of the default number, sends nothing */
const testConnection = asyncHandler(async (req, res) => ApiResponse.success(res, { config: await service.testConnection() }));

/** POST /api/v1/whatsapp-config/verify-token — new webhook verify token */
const regenerateVerifyToken = asyncHandler(async (req, res) =>
    ApiResponse.success(res, { config: await service.regenerateVerifyToken(req.user?.id) }, 'New verify token created'));

module.exports = { get, updateSection, testConnection, regenerateVerifyToken };
