const service = require('../services/clientGalleryAlbum.service');
const { asyncHandler } = require('../utils/helpers');
const ApiResponse = require('../utils/apiResponse');

/** Gallery albums (Create Album, 2026-11-04) — see clientGalleryAlbum.service. */

const list = asyncHandler(async (req, res) => {
    const result = await service.list(req.websiteClient.id, req.params.id);
    return ApiResponse.success(res, result, 'Albums loaded.');
});

const create = asyncHandler(async (req, res) => {
    const album = await service.create(req.websiteClient.id, req.params.id, req.body);
    return ApiResponse.created(res, { album }, 'Album saved.');
});

const update = asyncHandler(async (req, res) => {
    const album = await service.update(req.websiteClient.id, req.params.albumId, req.body);
    return ApiResponse.success(res, { album }, 'Album saved.');
});

const remove = asyncHandler(async (req, res) => {
    const result = await service.remove(req.websiteClient.id, req.params.albumId);
    return ApiResponse.success(res, result, 'Album deleted.');
});

const uploadMusic = asyncHandler(async (req, res) => {
    const result = await service.uploadMusic(req.websiteClient.id, req.params.id, req.file);
    return ApiResponse.success(res, result, 'Song uploaded.');
});

module.exports = { list, create, update, remove, uploadMusic };
