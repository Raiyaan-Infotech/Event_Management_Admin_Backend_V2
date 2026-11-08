#!/usr/bin/env node
/**
 * READ-ONLY report (2026-11-09): clients with more than one subscription row, or more than one invoice for
 * the same subscription term — what the Billing first-visit race (fixed in clientBilling.getCurrentSubscription
 * and clientInvoice.raiseInvoiceForTerm) could leave behind. Changes nothing.
 *
 *   node src/database/tools/report-duplicate-subscriptions.js           local
 *   node src/database/tools/report-duplicate-subscriptions.js --prod    production
 */
require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');

const PROD = process.argv.includes('--prod');
if (PROD) require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env.production'), override: true });

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD ?? process.env.DB_PASS,
        database: process.env.DB_NAME,
        ...(PROD ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    console.log(`\n${PROD ? 'PRODUCTION' : 'LOCAL'}  ${process.env.DB_NAME} @ ${process.env.DB_HOST}  (read-only)\n`);
    try {
        const [subs] = await conn.query(
            `SELECT s.website_client_id AS client_id, c.email, COUNT(*) AS subscriptions
               FROM client_subscriptions s JOIN website_clients c ON c.id = s.website_client_id
              WHERE s.deleted_at IS NULL
              GROUP BY s.website_client_id, c.email HAVING COUNT(*) > 1 ORDER BY subscriptions DESC`,
        );
        console.log(`Clients with more than one subscription: ${subs.length}`);
        subs.slice(0, 30).forEach((r) => console.log(`  #${r.client_id}  ${r.email}  ${r.subscriptions} subscriptions`));
        const [inv] = await conn.query(
            `SELECT client_subscription_id, period_start, COUNT(*) AS n
               FROM client_invoices WHERE deleted_at IS NULL AND client_subscription_id IS NOT NULL
              GROUP BY client_subscription_id, period_start HAVING COUNT(*) > 1`,
        );
        console.log(`\nSubscription terms with more than one invoice: ${inv.length}`);
        inv.slice(0, 30).forEach((r) => console.log(`  subscription #${r.client_subscription_id}  ${String(r.period_start).slice(0, 15)}  ${r.n} invoices`));
        console.log('');
    } finally {
        await conn.end();
    }
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
