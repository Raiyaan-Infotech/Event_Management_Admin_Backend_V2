const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');
const service = require('../services/clientInvitationSend.service');

/**
 * Invitations flow — Share with Guests (step 3) and Track Responses (step 4).
 * See clientInvitationSend.service: a send is RECORDED in invitation_sends
 * (no WhatsApp / email provider is connected yet). The owner always comes from
 * the session (`req.websiteClient`), never the request.
 */

const audience = asyncHandler(async (req, res) => {
    const data = await service.getAudience(req.websiteClient, { eventId: req.query.event_id });
    return ApiResponse.success(res, data, 'Invitation audience retrieved');
});

const send = asyncHandler(async (req, res) => {
    const data = await service.send(req.websiteClient, req.body);
    return ApiResponse.created(
        res,
        data,
        data.status === 'scheduled'
            ? `Invitation scheduled for ${data.recipients} guest${data.recipients === 1 ? '' : 's'}`
            : `Invitation saved for ${data.recipients} guest${data.recipients === 1 ? '' : 's'}`,
    );
});

const list = asyncHandler(async (req, res) => {
    const data = await service.list(req.websiteClient, req.query);
    return ApiResponse.success(res, data, 'Shared invitations retrieved');
});

const resend = asyncHandler(async (req, res) => {
    const data = await service.resend(req.websiteClient, req.params.id);
    return ApiResponse.success(res, data, 'Invitation sent again');
});

const remove = asyncHandler(async (req, res) => {
    const data = await service.remove(req.websiteClient, req.params.id);
    return ApiResponse.success(res, data, 'Recipient removed');
});

module.exports = { audience, send, list, resend, remove };
