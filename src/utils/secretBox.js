const crypto = require('crypto');

/**
 * Encrypt provider secrets (MSG91 auth key, webhook token) before they go into the database.
 *
 * AES-256-GCM, stored as "SB1.<iv>.<tag>.<ciphertext>" (base64url). The key comes from
 * CONFIG_SECRET_KEY, falling back to EVENT_QR_SECRET and then ACCESS_TOKEN_SECRET so the
 * module works on an existing server without a new env var.
 *
 * ⚠ Whichever variable is in use must not change later: rotating it makes every stored
 * secret unreadable (decrypt returns null and the admin has to type the key again).
 */

const PREFIX = 'SB1';

const getKey = () => {
    const secret = process.env.CONFIG_SECRET_KEY || process.env.EVENT_QR_SECRET || process.env.ACCESS_TOKEN_SECRET;
    if (!secret) throw new Error('secretBox: set CONFIG_SECRET_KEY (or ACCESS_TOKEN_SECRET) to store provider secrets.');
    return crypto.createHash('sha256').update(`secretBox:${secret}`).digest();
};

const encrypt = (plain) => {
    if (plain === null || plain === undefined || plain === '') return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return [PREFIX, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
};

/** Returns null for an empty, foreign or tampered value (or after a key change). */
const decrypt = (box) => {
    if (typeof box !== 'string' || !box.startsWith(`${PREFIX}.`)) return null;
    const [, iv, tag, data] = box.split('.');
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
};

module.exports = { encrypt, decrypt };
