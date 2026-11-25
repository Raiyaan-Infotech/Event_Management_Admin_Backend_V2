-- MSG91 provider configuration (Jamal, 2026-11-25, Super Admin "MSG91 Config" designs).
-- One row. Each settings tab is one JSON column, validated field by field in
-- src/services/msg91Config.service.js. Secrets are stored encrypted (src/utils/secretBox.js).
-- Saved settings only: sending still reads the MSG91 keys from .env until the sending step is wired.
-- Applied by src/database/tools/apply-msg91-config.js (skipped when the table already exists).
CREATE TABLE IF NOT EXISTS `msg91_configs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `auth_key_enc` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'encrypted MSG91 auth key',
  `webhook_token_enc` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'encrypted token put in the callback URLs',
  `general` json DEFAULT NULL,
  `api` json DEFAULT NULL,
  `sms` json DEFAULT NULL,
  `otp` json DEFAULT NULL,
  `dlt` json DEFAULT NULL,
  `sms_templates` json DEFAULT NULL,
  `email` json DEFAULT NULL,
  `webhook` json DEFAULT NULL,
  `alerts` json DEFAULT NULL,
  `connection_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_tested' COMMENT 'not_tested | connected | error',
  `last_tested_at` datetime DEFAULT NULL,
  `last_test_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_balance` json DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
