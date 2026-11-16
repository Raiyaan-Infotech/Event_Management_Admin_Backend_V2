const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');
const service = require('../services/clientAttendance.service');

/** Event Attendance (client portal QR Code, 2026-11-16). See clientAttendance.service. */

const list = asyncHandler(async (req, res) => {
    const data = await service.list(req, req.params.id, req.query);
    return ApiResponse.success(res, data, 'Attendance retrieved');
});

const getOne = asyncHandler(async (req, res) => {
    const participant = await service.getOne(req, req.params.id, req.params.participantId);
    return ApiResponse.success(res, { participant }, 'Participant retrieved');
});

const verify = asyncHandler(async (req, res) => {
    const participant = await service.verify(req, req.params.id, req.params.participantId, req.body);
    return ApiResponse.success(res, { participant }, participant.verification === 'verified' ? 'Participant verified' : 'Verification removed');
});

const mark = asyncHandler(async (req, res) => {
    const participant = await service.mark(req, req.params.id, req.params.participantId, req.body);
    return ApiResponse.success(res, { participant }, participant.attendance === 'attended' ? 'Attendance marked' : 'Marked as not attended');
});

const bulk = asyncHandler(async (req, res) => {
    const data = await service.bulk(req, req.params.id, req.body);
    return ApiResponse.success(res, data, `${data.updated} participant${data.updated === 1 ? '' : 's'} updated`);
});

module.exports = { list, getOne, verify, mark, bulk };
