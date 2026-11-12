-- Event Availability (2026-11-12, Super Admin designs "Create Event Availability Configuration",
-- "Daily Event Booking Availability", "Special Limits Override").
--
-- The super admin decides how many events may be created on each date. The limit is shared by ALL
-- clients together. A multi-day event takes one slot on every day it covers.
--
-- availability_configs    the default rule: a category (NULL = every category), a date range and a
--                         daily max. Only ACTIVE + PUBLISHED configs count. Two active published configs
--                         may not cover the same category on the same date (checked in the service).
--                         A date no config covers is "not configured" — clients cannot book it
--                         (only while EVENT_AVAILABILITY_ENFORCED=true).
-- availability_overrides  every per-date change, made on the Special Limits Override page OR from the
--                         daily list's action menu (Edit Limit, Increase Limit, Mark Fully Booked,
--                         Disable Date, Delete). Belongs to one config.
--                         mode  limit     daily_limit replaces the config's daily max (0 = blocked date)
--                               full      no new events; balance shows 0
--                               disabled  no new events; shown as Disabled
--                               removed   the date is taken out of the config (= not configured)
--                         When several active overrides cover a date, the shortest range wins, then the
--                         newest.
--
-- Re-runnable (IF NOT EXISTS). Local, then production — BEFORE pushing the backend.

CREATE TABLE IF NOT EXISTS `availability_configs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_category_id` int unsigned DEFAULT NULL COMMENT 'NULL = every category',
  `applies_to` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT 'all (specific clients later)',
  `config_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'daily_limit',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `daily_max` int unsigned NOT NULL,
  `allow_single_date` tinyint(1) NOT NULL DEFAULT '1',
  `allow_multi_date` tinyint(1) NOT NULL DEFAULT '1',
  `auto_full` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'show Fully Booked when the balance reaches 0',
  `block_weekends` tinyint(1) NOT NULL DEFAULT '0',
  `exclude_holidays` tinyint(1) NOT NULL DEFAULT '0',
  `holidays` json DEFAULT NULL COMMENT '["2026-11-14", ...] used when exclude_holidays = 1',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `publish_status` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT 'draft | published',
  `company_id` int unsigned DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_avail_cfg_range` (`publish_status`,`is_active`,`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `availability_overrides` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `config_id` int unsigned NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `mode` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'limit' COMMENT 'limit | full | disabled | removed',
  `daily_limit` int unsigned DEFAULT NULL COMMENT 'mode = limit only',
  `reason` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_avail_ovr_config` (`config_id`,`start_date`,`end_date`),
  CONSTRAINT `fk_avail_ovr_config` FOREIGN KEY (`config_id`) REFERENCES `availability_configs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
