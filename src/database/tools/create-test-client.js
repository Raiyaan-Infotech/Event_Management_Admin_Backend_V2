#!/usr/bin/env node
/**
 * Creates ONE client portal test account on a plan (Jamal, 2026-11-03: "create
 * one client with basic plan from db, use that for testing"). Goes through the
 * admin's own `websiteClient.service.create` (same checks as the admin Clients
 * screen), in the SAME company as the existing clients (the admin screen sets
 * it from the signed-in admin; categories and templates are read per company).
 *
 *   node src/database/tools/create-test-client.js --prod                    dry run: plans + companies in use
 *   node src/database/tools/create-test-client.js --prod --plan 3 \
 *        --email qa@example.com --password 'Secret@123' --name 'QA Tester' --apply
 *   node src/database/tools/create-test-client.js --prod --fix-company --email qa@example.com --apply
 *        (an account made before the company was set: give it the clients' company)
 *
 * Re-running with the same email refuses (the address is taken) — nothing is
 * duplicated.
 */
const path = require('path');

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = args.includes('--apply');
const PROD = args.includes('--prod');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
if (PROD) {
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });
    process.env.NODE_ENV = 'production';
}

(async () => {
    const { sequelize, SubscriptionPlan, WebsiteClient } = require('../../models');
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  ${APPLY ? '(APPLY)' : '(dry run)'}\n`);

    const plans = await SubscriptionPlan.findAll({ order: [['id', 'ASC']] });
    console.log('Plans:');
    for (const p of plans) {
        const j = p.toJSON();
        console.log(`  #${j.id}  ${j.name}  ${j.billing_cycle ?? ''}  ${j.price ?? ''}  company ${j.company_id ?? '-'}`);
    }
    const [companies] = await sequelize.query(
        'SELECT company_id, vendor_id, COUNT(*) AS n FROM website_clients WHERE deleted_at IS NULL GROUP BY company_id, vendor_id ORDER BY n DESC',
    );
    console.log('Clients by company / vendor:', JSON.stringify(companies));
    const email = flag('email');
    if (email) {
        const row = await WebsiteClient.findOne({ where: { email }, attributes: ['id', 'company_id', 'vendor_id', 'subscription_plan_id'] });
        console.log('This account:', JSON.stringify(row));
    }
    // The company most clients are in (never NULL).
    const company = companies.find((c) => c.company_id !== null)?.company_id ?? null;

    if (!APPLY) {
        console.log('\nDry run. Add --plan <id> --email <e> --password <p> [--name <n>] --apply to create.\n');
        process.exit(0);
    }
    if (args.includes('--fix-company')) {
        if (!email || company === null) throw new Error('--email is required, and a company must exist.');
        const [n] = await WebsiteClient.update({ company_id: company }, { where: { email }, hooks: false });
        console.log(`\nSet company ${company} on ${email} (${n} row).\n`);
        process.exit(0);
    }

    const planId = Number(flag('plan'));
    const password = flag('password');
    const name = flag('name') || 'QA Tester';
    if (!planId || !plans.some((p) => p.id === planId)) throw new Error('Choose an existing plan with --plan <id>.');
    if (!email || !password) throw new Error('--email and --password are required.');

    const clients = require('../../services/websiteClient.service');
    const created = await clients.create({ name, email, password, subscription_plan_id: planId, is_active: 1 }, null, company);
    await WebsiteClient.update({ email_verified: 1, company_id: company }, { where: { id: created.id }, hooks: false });
    console.log(`\nCreated client #${created.id}  ${email}  on plan #${planId}, company ${company}.\n`);
    process.exit(0);
})().catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
});
