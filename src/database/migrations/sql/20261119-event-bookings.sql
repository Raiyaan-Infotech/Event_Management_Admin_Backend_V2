-- Per-event plans (Jamal, 2026-11-19, Create Event updated v4 designs).
-- ONE ROW PER BOOKED DATE: the client checked availability, picked a plan for THIS event
-- (Free or paid) and the date is reserved — but the event may not be created yet.
-- The dashboard's "Event Date Allotted — Create Your Event Now" card reads the 'reserved' rows;
-- creating the event from it turns the row 'used' and stores the event id.
-- A paid plan has no gateway yet: the payment is saved as a pending ledger row
-- (client_transactions) and the date is reserved anyway (payment_status 'pending').
-- A reserved row holds a slot on the availability calendar like an event does.
-- Applied by src/database/tools/apply-event-bookings.js.
CREATE TABLE IF NOT EXISTS `event_bookings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `website_client_id` int unsigned NOT NULL,
  `company_id` int unsigned DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL COMMENT 'NULL = one-day event',
  `subscription_plan_id` int unsigned NOT NULL COMMENT 'the plan chosen for this event',
  `plan_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'name at booking time',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'total incl. tax, 0 for a free plan',
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INR',
  `payment_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free' COMMENT 'free | pending | paid',
  `client_transaction_id` int unsigned DEFAULT NULL COMMENT 'the pending payment row, paid plans only',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reserved' COMMENT 'reserved | used | cancelled',
  `event_id` int unsigned DEFAULT NULL COMMENT 'set when the event is created',
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_eb_client` (`website_client_id`, `status`),
  KEY `idx_eb_dates` (`status`, `start_date`, `end_date`),
  KEY `idx_eb_event` (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
