-- Near By places (2026-11-10, Jamal's web design): the organizer searches Google Maps suggestions
-- around the venue and saves the places guests should see (hotel, restaurant, hospital, parking…).
--
-- nearby_categories     the category tiles of "Add Nearby Place". Read from here, not hard-coded.
--                       `google_types` = Places API (New) place types searched for the tile,
--                       comma separated (empty = no automatic search, e.g. Other).
--                       `icon` = Iconify id drawn in `color`.
-- event_nearby_places   one saved place of ONE event. `google_place_id` stops the same place being
--                       saved twice. `photo_url` = Google's photo copied into our storage at save time.
--
-- The older automatic Near By (events.nearby_settings + event_nearby_cache, 2026-10-24) is untouched.
-- Re-runnable (IF NOT EXISTS / INSERT IGNORE). Local, then production — BEFORE pushing the backend.

CREATE TABLE IF NOT EXISTS `nearby_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `category_key` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `google_types` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nearby_category_key` (`category_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `nearby_categories` (category_key, name, icon, color, google_types, sort_order) VALUES
  ('hotel',      'Hotel',         'mdi:bed',                  '#2563EB', 'lodging,hotel',                  1),
  ('restaurant', 'Restaurant',    'mdi:silverware-fork-knife','#EA580C', 'restaurant',                     2),
  ('hospital',   'Hospital',      'mdi:hospital-box',         '#E11D48', 'hospital',                       3),
  ('parking',    'Parking',       'mdi:car',                  '#7C3AED', 'parking',                        4),
  ('atm',        'ATM / Bank',    'mdi:bank',                 '#1D4ED8', 'atm,bank',                       5),
  ('fuel',       'Fuel Station',  'mdi:gas-station',          '#0284C7', 'gas_station',                    6),
  ('temple',     'Temple',        'mdi:temple-hindu',         '#9333EA', 'hindu_temple,church,mosque',     7),
  ('shopping',   'Shopping',      'mdi:shopping',             '#D97706', 'shopping_mall,department_store', 8),
  ('tourist',    'Tourist Spot',  'mdi:camera',               '#16A34A', 'tourist_attraction',             9),
  ('other',      'Other',         'mdi:dots-horizontal',      '#6B7280', NULL,                            10);

CREATE TABLE IF NOT EXISTS `event_nearby_places` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `website_client_id` int unsigned NOT NULL COMMENT 'the event owner',
  `google_place_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'the short line under the name',
  `category_key` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lat` decimal(10,7) DEFAULT NULL,
  `lng` decimal(10,7) DEFAULT NULL,
  `distance_km` decimal(7,2) DEFAULT NULL COMMENT 'from the venue pin when saved',
  `rating` decimal(2,1) DEFAULT NULL,
  `rating_count` int unsigned DEFAULT NULL,
  `map_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `show_in_app` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `company_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nearby_place_google` (`event_id`,`google_place_id`),
  KEY `idx_nearby_place_event` (`event_id`,`sort_order`),
  CONSTRAINT `fk_nearby_place_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Check.
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('nearby_categories', 'event_nearby_places');
