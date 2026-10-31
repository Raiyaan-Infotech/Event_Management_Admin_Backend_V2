-- Home Screen Categories (Jamal, 2026-10-31): the style master for mobile app home
-- screen templates — admin Template → Home Screen Categories. Separate from
-- template_categories (invitation design families).
-- home_screen_templates.template_category_id is replaced by home_screen_category_id
-- (FK to this table) by src/database/tools/apply-home-screen-templates.js, which also
-- copies existing rows across by style name.
CREATE TABLE IF NOT EXISTS `home_screen_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `company_id` int DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_home_screen_categories_listing` (`company_id`,`sort_order`,`deleted_at`),
  KEY `idx_home_screen_categories_slug` (`company_id`,`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
