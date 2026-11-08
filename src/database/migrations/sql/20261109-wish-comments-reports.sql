-- Wed Wishes Monitor backend (Jamal's web design, 2026-11-09):
--   · comments under a wish (Manage Comments / Latest Comments),
--   · participants reporting a wish (the Reported tab),
--   · why a participant was blocked (Block Reason + Internal Note).
-- Applied by src/database/tools/apply-wish-comments-reports.js (re-runnable).

CREATE TABLE IF NOT EXISTS `event_wish_comments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `wish_id` int unsigned NOT NULL,
  `website_client_id` int unsigned NOT NULL COMMENT 'the event owner',
  `author_client_id` int unsigned DEFAULT NULL COMMENT 'the participant who wrote it, NULL = the organizer',
  `guest_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_hidden` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = hidden from participants',
  `is_flagged` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = the blocked-words filter caught it, not reviewed yet',
  `company_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wish_comment_wish` (`wish_id`,`created_at`),
  KEY `idx_wish_comment_event` (`event_id`),
  CONSTRAINT `fk_event_wish_comment_wish` FOREIGN KEY (`wish_id`) REFERENCES `event_wishes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Comments under a Wed Wishes post';

CREATE TABLE IF NOT EXISTS `event_wish_reports` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `wish_id` int unsigned NOT NULL,
  `reporter_client_id` int unsigned NOT NULL COMMENT 'the participant who reported it',
  `reason` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT 'inappropriate | spam | harassment | other',
  `note` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wish_report` (`wish_id`,`reporter_client_id`),
  KEY `idx_wish_report_event` (`event_id`),
  CONSTRAINT `fk_event_wish_report_wish` FOREIGN KEY (`wish_id`) REFERENCES `event_wishes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='A participant reporting a Wed Wishes post';

ALTER TABLE `event_wish_blocks`
  ADD COLUMN `reason` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'inappropriate | spam | harassment | other' AFTER `hide_menu`,
  ADD COLUMN `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'the organizer''s internal note' AFTER `reason`;
