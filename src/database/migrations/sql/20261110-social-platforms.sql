-- Social platforms (2026-11-10): the platforms offered by "Add Social Link" — read from here,
-- not hard-coded in the portal / app (Jamal: "platform ... i want come from dynamic").
--
-- social_platforms   one platform. `platform_key` goes on event_social_links.platform_key
--                    (instagram / facebook / x / youtube stay the four preset rows every event
--                    has). `is_custom` = 1 is "Others": no key, the organizer names the link.
--                    `icon` is an Iconify id ("mdi:whatsapp") drawn in the platform's `color`,
--                    the same format as event_menus.icon.
--
-- Re-runnable (IF NOT EXISTS / INSERT IGNORE). Run it with
-- src/database/tools/apply-social-platforms.js — local, then production, BEFORE pushing the backend.

CREATE TABLE IF NOT EXISTS `social_platforms` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `platform_key` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Iconify id, e.g. mdi:instagram',
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `url_placeholder` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_custom` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = Others: the link is saved without a platform key',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_social_platform_key` (`platform_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `social_platforms` (platform_key, name, icon, color, url_placeholder, is_custom, sort_order) VALUES
  ('instagram', 'Instagram',  'mdi:instagram',        '#E1306C', 'https://instagram.com/yourpage',   0, 1),
  ('youtube',   'YouTube',    'mdi:youtube',          '#FF0000', 'https://youtube.com/@yourchannel', 0, 2),
  ('facebook',  'Facebook',   'mdi:facebook',         '#1877F2', 'https://facebook.com/yourpage',    0, 3),
  ('whatsapp',  'WhatsApp',   'mdi:whatsapp',         '#25D366', 'https://whatsapp.com/channel/...', 0, 4),
  ('x',         'X (Twitter)','ri:twitter-x-fill',    '#111111', 'https://x.com/yourhandle',         0, 5),
  ('telegram',  'Telegram',   'ic:baseline-telegram', '#229ED9', 'https://t.me/yourchannel',         0, 6),
  ('linkedin',  'LinkedIn',   'mdi:linkedin',         '#0A66C2', 'https://linkedin.com/in/yourname', 0, 7),
  ('website',   'Website',    'mdi:web',              '#2563EB', 'https://yourwebsite.com',          0, 8),
  ('others',    'Others',     'mdi:link-variant',     '#6B7280', 'https://',                         1, 9);

-- Check.
SELECT platform_key, name, icon, is_custom, sort_order FROM social_platforms ORDER BY sort_order;
