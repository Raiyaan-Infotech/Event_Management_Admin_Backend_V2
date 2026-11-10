const service = require('../services/clientDownload.service');
const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');

/** Every editable field, destructured — a field missing here is silently dropped. */
const pick = (body) => {
    const out = {};
    for (const f of ['title', 'category_key', 'file_url', 'file_name', 'file_size', 'description',
        'visibility', 'download_access', 'expires_at', 'show_in_app']) {
        if (Object.prototype.hasOwnProperty.call(body, f)) out[f] = body[f];
    }
    return out;
};

const list = asyncHandler(async (req, res) => {
    const result = await service.list(req.websiteClient.id, req.params.id);
    return ApiResponse.success(res, result, 'Downloads loaded.');
});

const getOne = asyncHandler(async (req, res) => {
    const result = await service.getOne(req.websiteClient.id, req.params.downloadId);
    return ApiResponse.success(res, result, 'Download loaded.');
});

const create = asyncHandler(async (req, res) => {
    const download = await service.create(req.websiteClient.id, req.params.id, pick(req.body));
    return ApiResponse.created(res, { download }, 'Download added.');
});

const update = asyncHandler(async (req, res) => {
    const download = await service.update(req.websiteClient.id, req.params.downloadId, pick(req.body));
    return ApiResponse.success(res, { download }, 'Download updated.');
});

const remove = asyncHandler(async (req, res) => {
    const result = await service.remove(req.websiteClient.id, req.params.downloadId);
    return ApiResponse.success(res, result, 'Download deleted.');
});

const hit = asyncHandler(async (req, res) => {
    const result = await service.hit(req.websiteClient.id, req.params.downloadId);
    return ApiResponse.success(res, result, 'Download ready.');
});

const uploadFile = asyncHandler(async (req, res) => {
    const result = await service.uploadFile(req.websiteClient.id, req.params.id, req.file);
    return ApiResponse.success(res, result, 'File uploaded.');
});

module.exports = { list, getOne, create, update, remove, hit, uploadFile };
