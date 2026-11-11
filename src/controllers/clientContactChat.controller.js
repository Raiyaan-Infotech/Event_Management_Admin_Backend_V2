const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');
const service = require('../services/clientContactChat.service');

/**
 * Contact Person chat (2026-10-26; portal Contact Messages 2026-11-11) — see
 * clientContactChat.service.
 *
 * Team routes run as the event OWNER; for the contact person (organizer login)
 * eventOrganizerAccess has already swapped req.websiteClient to the owner and
 * kept the real caller on req.organizerClient — that is the message's sender.
 * Message routes take an optional `photo` file (multipart).
 */
const ownerId = (req) => req.websiteClient.id;
const senderId = (req) => (req.organizerClient || req.websiteClient).id;

const list = asyncHandler(async (req, res) => {
    const data = await service.listChats(ownerId(req), req.params.id);
    return ApiResponse.success(res, data, 'Participant chats retrieved');
});

const messages = asyncHandler(async (req, res) => {
    const data = await service.getTeamMessages(ownerId(req), req.params.id, req.params.chatId, senderId(req));
    return ApiResponse.success(res, data, 'Chat retrieved');
});

const reply = asyncHandler(async (req, res) => {
    const message = await service.sendTeamMessage(
        ownerId(req), req.params.id, req.params.chatId, senderId(req), req.body?.body, req.file || null, req.body?.reply_to_id,
    );
    return ApiResponse.created(res, { message }, 'Message sent');
});

const recipients = asyncHandler(async (req, res) => {
    const data = await service.recipients(ownerId(req), req.params.id);
    return ApiResponse.success(res, data, 'Participants retrieved');
});

const start = asyncHandler(async (req, res) => {
    const data = await service.startChat(ownerId(req), req.params.id, senderId(req), req.body || {}, req.file || null);
    return ApiResponse.created(res, data, 'Message sent');
});

const status = asyncHandler(async (req, res) => {
    const chat = await service.setStatus(ownerId(req), req.params.id, req.params.chatId, req.body || {});
    return ApiResponse.success(res, { chat }, 'Chat updated');
});

const details = asyncHandler(async (req, res) => {
    const data = await service.details(ownerId(req), req.params.id, req.params.chatId);
    return ApiResponse.success(res, data, 'Participant details retrieved');
});

const myChat = asyncHandler(async (req, res) => {
    const data = await service.getMyChat(req.websiteClient.id, req.params.id);
    return ApiResponse.success(res, data, 'Chat retrieved');
});

const sendMine = asyncHandler(async (req, res) => {
    const data = await service.sendMyMessage(req.websiteClient.id, req.params.id, req.body?.body, req.file || null);
    return ApiResponse.created(res, data, 'Message sent');
});

module.exports = { list, messages, reply, recipients, start, status, details, myChat, sendMine };
