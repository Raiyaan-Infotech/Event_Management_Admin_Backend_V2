#!/usr/bin/env node
/**
 * Give a TEST client account a fresh password (2026-11-09) — for live browser tests. Only
 * addresses ending in @eventinvite-test.com are accepted. The password is generated here,
 * saved through the model (its hook bcrypt-hashes it, same as the admin Clients screen) and
 * written to `.env.qa-test` in the backend folder (git-ignored by `.env.*`) — never printed,
 * never put in session.md (the repo is on GitHub).
 *
 *   node src/database/tools/set-test-client-password.js --email qa.portal@eventinvite-test.com --prod           dry run
 *   node src/database/tools/set-test-client-password.js --email qa.portal@eventinvite-test.com --prod --apply
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod');
const EMAIL = String(flag('email') || '').trim().toLowerCase();
const ROOT = path.join(__dirname, '..', '..', '..');

require('dotenv').config({ path: path.join(ROOT, '.env') });
if (PROD) {
    require('dotenv').config({ path: path.join(ROOT, '.env.production'), override: true });
    process.env.NODE_ENV = 'production';
}

(async () => {
    if (!/^[^@\s]+@eventinvite-test\.com$/.test(EMAIL)) throw new Error('Only @eventinvite-test.com test accounts.');
    const { sequelize, WebsiteClient } = require('../../models');
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);
    try {
        const client = await WebsiteClient.findOne({ where: { email: EMAIL } });
        if (!client) throw new Error(`No client with ${EMAIL}.`);
        console.log(`  client #${client.id} ${client.name} (active ${client.is_active})`);
        if (!APPLY) { console.log('  WOULD set a new password and write .env.qa-test'); return; }
        // Letters + digits + a symbol, so any password rule passes.
        const password = `Qa@${crypto.randomBytes(9).toString('base64url')}9`;
        client.password = password;
        await client.save();
        const file = path.join(ROOT, '.env.qa-test');
        fs.writeFileSync(file, `# Live QA test login (set-test-client-password.js, ${new Date().toISOString()}). Git-ignored.\nQA_EMAIL=${EMAIL}\nQA_PASSWORD=${password}\nQA_CLIENT_ID=${client.id}\n`);
        console.log(`  password set — saved to ${path.relative(ROOT, file)}`);
    } finally {
        await sequelize.close().catch(() => null);
    }
    console.log('\nDone.\n');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
