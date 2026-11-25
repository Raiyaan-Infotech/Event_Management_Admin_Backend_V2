const ApiError = require('./apiError');

/**
 * Field rules for the provider settings services (msg91Config / whatsappConfig).
 * Each rule takes the raw value and returns the cleaned one, or throws a 400 with a plain message.
 * `clean(fields, input)` keeps only the listed keys, so unknown keys never reach the database.
 */

const fail = (msg) => { throw ApiError.badRequest(msg); };

const str = (label, max, { required = false, pattern, patternMsg } = {}) => (v) => {
    const s = v === null || v === undefined ? '' : String(v).trim();
    if (!s) { if (required) fail(`${label} is required`); return ''; }
    if (s.length > max) fail(`${label} must be ${max} characters or fewer`);
    if (pattern && !pattern.test(s)) fail(patternMsg || `${label} is not valid`);
    return s;
};
const bool = () => (v) => v === true || v === 'true' || v === 1 || v === '1';
const int = (label, min, max) => (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) fail(`${label} must be a whole number from ${min} to ${max}`);
    return n;
};
const oneOf = (label, values) => (v) => {
    if (!values.includes(v)) fail(`${label} must be one of: ${values.join(', ')}`);
    return v;
};
const time = (label) => str(label, 5, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMsg: `${label} must be HH:MM` });
const date = (label) => str(label, 10, { pattern: /^\d{4}-\d{2}-\d{2}$/, patternMsg: `${label} must be a date` });
const email = (label, opts) => str(label, 150, { ...opts, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg: `${label} must be an email address` });
const senderId = (label, opts) => str(label, 6, { ...opts, pattern: /^[A-Z]{6}$/, patternMsg: `${label} must be 6 capital letters (DLT header), e.g. EVNTIT` });
const digits = (label, opts) => str(label, 30, { ...opts, pattern: /^\d{10,25}$/, patternMsg: `${label} must be 10 to 25 digits` });
const group = (fields) => (v) => clean(fields, v || {});
const list = (label, max, fields) => (v) => {
    const arr = Array.isArray(v) ? v : [];
    if (arr.length > max) fail(`${label}: at most ${max} rows`);
    return arr.map((row) => clean(fields, row || {}));
};

function clean(fields, input) {
    const out = {};
    for (const [key, rule] of Object.entries(fields)) out[key] = rule(input[key]);
    return out;
}

const publicApiBase = () =>
    (process.env.PUBLIC_API_BASE_URL || process.env.OAUTH_CALLBACK_BASE_URL || 'http://localhost:5001').replace(/\/+$/, '');

module.exports = { fail, str, bool, int, oneOf, time, date, email, senderId, digits, group, list, clean, publicApiBase };
