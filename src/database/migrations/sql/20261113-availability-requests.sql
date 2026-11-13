-- Event Allocation / support requests (2026-11-13, Jamal's designs "Contact Support Team" on the client
-- Check Event Availability page + Super Admin "Event Allocation Requests").
--
-- A client picks a date (or a consecutive range) where at least one day is fully booked / not open, and
-- asks the support team for help — by call back or by email. The request is stored here with a ticket
-- number and shows in the super admin's Allocation Requests (review → approve with a one-time exception,
-- or reject). The decision columns are filled by that later screen.
--
-- Re-runnable (IF NOT EXISTS). Local, then production — BEFORE pushing the backend.

CREATE TABLE IF NOT EXISTS `availability_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ticket_no` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'EAR-2026-1025, set after insert',
  `website_client_id` int unsigned NOT NULL,
  `booking_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single' COMMENT 'single | multiple',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `unavailable_dates` json DEFAULT NULL COMMENT '[{"date":"2026-11-25","status":"full"}] at submit time',
  `contact_method` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'call | email',
  `contact_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_mobile` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_email` varchar(190) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `preferred_call_time` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subject` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attachment_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'pending | approved | rejected',
  `decision_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decision` json DEFAULT NULL COMMENT 'approval details (exception slots, expiry, …) — set by the super admin screen',
  `decided_by` int unsigned DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `company_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_avail_req_ticket` (`ticket_no`),
  KEY `idx_avail_req_client` (`website_client_id`, `created_at`),
  KEY `idx_avail_req_status` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
