-- Event Attendance (client portal QR Code → Event Attendance, Jamal's design 2026-11-16).
-- Verify Participant now SAVES a status (before it only showed the details), and every check-in
-- records how it happened. Applied by src/database/tools/apply-participant-attendance.js.
ALTER TABLE `event_participants`
  ADD COLUMN `check_in_source` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'event_qr | manual | self_link' AFTER `checked_in_by_name`,
  ADD COLUMN `check_in_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `check_in_source`,
  ADD COLUMN `verified_at` datetime DEFAULT NULL AFTER `check_in_note`,
  ADD COLUMN `verified_by_client_id` int unsigned DEFAULT NULL AFTER `verified_at`,
  ADD COLUMN `verified_by_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `verified_by_client_id`,
  ADD COLUMN `verify_method` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'qr | manual' AFTER `verified_by_name`,
  ADD COLUMN `verify_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `verify_method`;
