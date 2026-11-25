-- Meta WhatsApp Cloud API provider configuration (Jamal, 2026-11-25, Super Admin "WhatsApp Config" designs).
-- One row. Each settings tab is one JSON column, validated field by field in
-- src/services/whatsappConfig.service.js. Secrets are stored encrypted (src/utils/secretBox.js).
-- Saved settings only: WhatsApp sending still goes through MSG91 (msg91Whatsapp.service.js) until it is switched.
-- Applied by src/database/tools/apply-whatsapp-config.js (skipped when the table already exists).
CREATE TABLE IF NOT EXISTS `whatsapp_configs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `app_secret_enc` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'encrypted Meta App Secret',
  `access_token_enc` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'encrypted system user access token',
  `verify_token_enc` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'encrypted webhook verify token',
  `general` json DEFAULT NULL,
  `api` json DEFAULT NULL,
  `business` json DEFAULT NULL,
  `senders` json DEFAULT NULL,
  `templates` json DEFAULT NULL,
  `webhook` json DEFAULT NULL,
  `limits` json DEFAULT NULL,
  `budget` json DEFAULT NULL,
  `connection_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_tested' COMMENT 'not_tested | connected | error',
  `last_tested_at` datetime DEFAULT NULL,
  `last_test_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_test_info` json DEFAULT NULL COMMENT 'phone number details Meta returned on the last test',
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
