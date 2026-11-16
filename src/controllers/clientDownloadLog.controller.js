const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');
const service = require('../services/clientDownloadLog.service');

/** Files Downloaded list (client portal QR Code, 2026-11-16). See clientDownloadLog.service. */

const list = asyncHandler(async (req, res) => {
    const data = await service.list(req, req.params.id, req.query);
    return ApiResponse.success(res, data, 'Downloads retrieved');
});

const participantHistory = asyncHandler(async (req, res) => {
    const data = await service.participantHistory(req, req.params.id, req.params.participantId);
    return ApiResponse.success(res, data, 'Download history retrieved');
});

const removeParticipant = asyncHandler(async (req, res) => {
    const data = await service.removeParticipant(req, req.params.id, req.params.participantId);
    return ApiResponse.success(res, data, 'Participant removed from the download list');
});

module.exports = { list, participantHistory, removeParticipant };
