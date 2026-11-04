-- Gallery web design (portal, 2026-11-04): Create Album — slideshow albums built from the gallery's photos.
-- slides = JSON [{ "item_id": 12, "seconds": 5.0 }] (event_gallery_items, images).
-- Applied by src/database/tools/apply-gallery-albums.js.
CREATE TABLE IF NOT EXISTS `event_gallery_albums` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `website_client_id` int unsigned NOT NULL COMMENT 'the event owner',
  `company_id` int unsigned DEFAULT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cover_image` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `intro_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `intro_text` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `intro_animation` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fade_slide_up',
  `intro_seconds` decimal(4,1) NOT NULL DEFAULT '5.0',
  `music_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `music_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `music_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `slide_seconds` decimal(4,1) NOT NULL DEFAULT '5.0',
  `slides` json NOT NULL,
  `show_in_app` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_album_event` (`event_id`,`sort_order`),
  CONSTRAINT `fk_gallery_album_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
