/**
 * Amazon SES email sender — settings come from env only (Jamal, 2026-11-28).
 *
 *   AWS_REGION              e.g. ap-south-1          (SES_REGION wins if set)
 *   AWS_ACCESS_KEY_ID       IAM key with ses:SendEmail (SES_ACCESS_KEY_ID wins if set)
 *   AWS_SECRET_ACCESS_KEY                              (SES_SECRET_ACCESS_KEY wins if set)
 *   SES_CONFIG_SET          optional configuration set (bounce / open tracking)
 *   SES_ALLOWED_DOMAINS     verified sending domain(s), comma separated
 *   SES_FROM_EMAIL          optional sender; default no-reply@<first allowed domain>,
 *                           else no-reply@raiyaaninfotech.com
 *   SES_FROM_NAME           optional, default "EventInvit"
 *   SES_REPLY_TO            optional
 *   SES_RATE_PER_SEC        max emails per second (SES account send rate), default 1
 *
 * Not configured -> isConfigured() is false and send() refuses with a clear
 * message; nothing else in the app breaks.
 */
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const env = (k) => String(process.env[k] || '').trim();

const region = () => env('SES_REGION') || env('AWS_REGION');
const accessKey = () => env('SES_ACCESS_KEY_ID') || env('AWS_ACCESS_KEY_ID');
const secretKey = () => env('SES_SECRET_ACCESS_KEY') || env('AWS_SECRET_ACCESS_KEY');
const allowedDomains = () => env('SES_ALLOWED_DOMAINS').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
// Sender (Jamal, 2026-11-28): the company domain raiyaaninfotech.com.
const DEFAULT_FROM = 'no-reply@raiyaaninfotech.com';
const fromEmail = () => env('SES_FROM_EMAIL') || (allowedDomains()[0] ? `no-reply@${allowedDomains()[0]}` : DEFAULT_FROM);

const isConfigured = () => Boolean(region() && accessKey() && secretKey() && fromEmail());

/** Names the missing variables, for error messages and the admin. */
const missingVars = () => [
    !region() && 'AWS_REGION',
    !accessKey() && 'AWS_ACCESS_KEY_ID',
    !secretKey() && 'AWS_SECRET_ACCESS_KEY',
    !fromEmail() && 'SES_ALLOWED_DOMAINS (or SES_FROM_EMAIL)',
].filter(Boolean);

/** The sender must be on a verified domain, else SES refuses every mail. */
const assertSenderAllowed = () => {
    const domains = allowedDomains();
    const domain = fromEmail().split('@')[1]?.toLowerCase();
    if (domains.length && !domains.includes(domain)) {
        throw new Error(`Sender ${fromEmail()} is not on SES_ALLOWED_DOMAINS (${domains.join(', ')}).`);
    }
};

/*
 * SES_RATE_PER_SEC: SES throttles above the account's send rate (1/s in the
 * sandbox), so sends are spaced out here instead of failing with "Throttling".
 */
let nextSlot = 0;
const waitForSlot = async () => {
    const rate = Math.max(1, Number(env('SES_RATE_PER_SEC')) || 1);
    const gap = Math.ceil(1000 / rate);
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + gap;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
};

let client = null;
let clientKey = '';
const getClient = () => {
    const key = `${region()}|${accessKey()}`;
    if (!client || clientKey !== key) {
        client = new SESv2Client({
            region: region(),
            credentials: { accessKeyId: accessKey(), secretAccessKey: secretKey() },
        });
        clientKey = key;
    }
    return client;
};

/** Quotes a display name for the From header. */
const fromHeader = () => {
    const name = (env('SES_FROM_NAME') || 'EventInvit').replace(/["\\\r\n]/g, '');
    return `"${name}" <${fromEmail()}>`;
};

/** Plain-text fallback from the HTML, so clients without HTML still read it. */
const htmlToText = (html) => String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/h\d|\/tr|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

/**
 * Sends one email. `to` may be a string or an array (each address gets the same mail).
 * Returns { messageId }. Throws with SES's reason on failure.
 */
const send = async ({ to, subject, html, text, replyTo } = {}) => {
    if (!isConfigured()) {
        throw new Error(`Amazon SES is not configured on the server (missing ${missingVars().join(', ')}).`);
    }
    const list = (Array.isArray(to) ? to : [to]).map((s) => String(s || '').trim()).filter(Boolean);
    if (!list.length) throw new Error('No recipient email address.');
    if (!subject) throw new Error('The email has no subject.');
    assertSenderAllowed();

    const reply = replyTo || env('SES_REPLY_TO');
    const input = {
        FromEmailAddress: fromHeader(),
        Destination: { ToAddresses: list },
        Content: {
            Simple: {
                Subject: { Data: String(subject).slice(0, 998), Charset: 'UTF-8' },
                Body: {
                    Html: { Data: String(html || ''), Charset: 'UTF-8' },
                    Text: { Data: text || htmlToText(html), Charset: 'UTF-8' },
                },
            },
        },
    };
    if (reply) input.ReplyToAddresses = [reply];
    const configSet = env('SES_CONFIG_SET') || env('SES_CONFIGURATION_SET');
    if (configSet) input.ConfigurationSetName = configSet;

    await waitForSlot();
    const out = await getClient().send(new SendEmailCommand(input));
    return { messageId: out.MessageId };
};

module.exports = { isConfigured, missingVars, send, htmlToText, fromEmail };
