const service = require('../services/galleryVideoEditor.service');
const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');

/**
 * Edit Video / Shorts export (web gallery design 03). Mounted only when
 * VIDEO_EDITOR_ENABLED=true — see session.md 8g.
 * Multipart: `spec` (JSON of the edit), optional `music` (the background song), optional `title`.
 */
const exportEdit = asyncHandler(async (req, res) => {
    const result = await service.exportEdit(req.websiteClient.id, req.params.itemId, req.body, req.file || null);
    return ApiResponse.success(res, result, 'Edited video saved to the gallery.');
});

module.exports = { exportEdit };
