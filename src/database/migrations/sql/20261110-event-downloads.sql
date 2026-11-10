-- Downloads (2026-11-10, Jamal's web design): files the host shares for participants to download in the
-- event app — invitation PDF, route map, schedule brochure, dress code…
--
-- download_categories  the category chips of "Add Download" (Invitation, Travel, Stay, Agenda, Info,
--                      Other). Read from here, not hard-coded in the portal / app. `color` tints the chip.
-- event_downloads      one file of ONE event.
--                      visibility       all | bride | groom   — which participants see it
--                      download_access  all | confirmed       — confirmed = RSVP Yes only may download
--                      expires_at       after this day it is no longer shown to participants
--                      download_count   +1 each time a participant downloads it
--
-- The "Downloads" menu row is added by src/database/tools/apply-event-downloads.js (granted to every plan).
-- Re-runnable (IF NOT EXISTS / INSERT IGNORE). Local, then production — BEFORE pushing the backend.

CREATE TABLE IF NOT EXISTS `download_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `category_key` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_download_category_key` (`category_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `download_categories` (category_key, name, color, sort_order) VALUES
  ('invitation', 'Invitation', '#DB2777', 1),
  ('travel',     'Travel',     '#7C3AED', 2),
  ('stay',       'Stay',       '#2563EB', 3),
  ('agenda',     'Agenda',     '#EA580C', 4),
  ('info',       'Info',       '#4F46E5', 5),
  ('other',      'Other',      '#6B7280', 6);

CREATE TABLE IF NOT EXISTS `event_downloads` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `website_client_id` int unsigned NOT NULL COMMENT 'the event owner',
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_key` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'PDF / DOCX / JPG …',
  `file_size` int unsigned NOT NULL DEFAULT '0' COMMENT 'bytes',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visibility` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT 'all | bride | groom',
  `download_access` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT 'all | confirmed',
  `expires_at` date DEFAULT NULL,
  `show_in_app` tinyint(1) NOT NULL DEFAULT '1',
  `download_count` int unsigned NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `company_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_download_event` (`event_id`,`sort_order`),
  CONSTRAINT `fk_download_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Check.
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('download_categories', 'event_downloads');
