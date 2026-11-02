const axios = require('axios');
const mediaService = require('./media.service');
const logger = require('../utils/logger');

/**
 * Venue photo from the place itself (Create / Edit Event → Venue).
 *
 * When the host drops the venue pin, the portal asks for a real photo of that
 * place. Google Places (New) Text Search near the pin → the place's first
 * photo → downloaded here and stored in OUR media storage, so the event never
 * holds a Google URL (those carry the API key and expire).
 *
 * Never throws: no key, no match, no photo, or any Google error all answer
 * `{ url: null }` and the host simply uploads one themselves.
 */

const apiKey = () => process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';

const MAX_WIDTH = 1280;

const findPhoto = async ({ lat, lng, name }) => {
    const key = apiKey();
    if (!key) return null;
    const body = {
        textQuery: name || `${lat},${lng}`,
        maxResultCount: 1,
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 300 } },
    };
    const search = await axios.post('https://places.googleapis.com/v1/places:searchText', body, {
        timeout: 10000,
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.id,places.photos',
        },
    });
    const photo = search.data?.places?.[0]?.photos?.[0];
    if (!photo?.name) return null;

    const media = await axios.get(`https://places.googleapis.com/v1/${photo.name}/media`, {
        timeout: 15000,
        params: { maxWidthPx: MAX_WIDTH, key },
        responseType: 'arraybuffer',
    });
    return {
        buffer: Buffer.from(media.data),
        mimetype: String(media.headers['content-type'] || 'image/jpeg').split(';')[0],
    };
};

const venuePhoto = async (companyId, query) => {
    const lat = Number(query.lat);
    const lng = Number(query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return { url: null };
    }
    const name = String(query.name || '').trim().slice(0, 200);

    try {
        const found = await findPhoto({ lat, lng, name });
        if (!found || !found.buffer.length) return { url: null };
        const ext = found.mimetype === 'image/png' ? 'png' : found.mimetype === 'image/webp' ? 'webp' : 'jpg';
        const stored = await mediaService.upload(
            {
                buffer: found.buffer,
                mimetype: found.mimetype,
                originalname: `venue.${ext}`,
                size: found.buffer.length,
            },
            { folder: 'event-venues' },
            companyId || 1,
        );
        return { url: stored?.url || null };
    } catch (e) {
        const g = e.response?.data?.error;
        logger.error(`[venue-photo] ${g?.status || e.code || ''} ${g?.message || e.message}`);
        return { url: null };
    }
};

module.exports = { venuePhoto };
