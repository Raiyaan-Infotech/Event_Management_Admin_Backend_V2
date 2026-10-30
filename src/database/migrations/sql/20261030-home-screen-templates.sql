-- Home Screen Templates (Jamal, 2026-10-30): the mobile app's event home screen
-- design, per event category — admin portal → Template → Home Screen Templates.
-- `colors` = [{"key":"primary","label":"Primary","hex":"#F76AA5"}, ...], 2–5 entries
-- (primary, secondary, accent, background, text — in that order, color_count long).
-- Applied by src/database/tools/apply-home-screen-templates.js.
CREATE TABLE IF NOT EXISTS `home_screen_templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_category_id` int unsigned DEFAULT NULL,
  `template_category_id` int unsigned DEFAULT NULL COMMENT 'Template Style (Royal, Floral...)',
  `image_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'The home screen image (9:16)',
  `image_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_size` int unsigned DEFAULT NULL,
  `color_count` tinyint unsigned NOT NULL DEFAULT '4',
  `colors` json DEFAULT NULL,
  `notes` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `company_id` int DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_home_tpl_company` (`company_id`,`deleted_at`),
  KEY `idx_home_tpl_event_category` (`event_category_id`,`deleted_at`),
  KEY `idx_home_tpl_style` (`template_category_id`,`deleted_at`),
  CONSTRAINT `fk_home_tpl_event_category` FOREIGN KEY (`event_category_id`) REFERENCES `event_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_home_tpl_style` FOREIGN KEY (`template_category_id`) REFERENCES `template_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
