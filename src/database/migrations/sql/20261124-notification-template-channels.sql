-- Message templates: one template = one trigger, with its own Email, WhatsApp and In-app content
-- (Jamal, 2026-11-24, Super Admin "Manage Message Templates" designs + the channel tick sheet).
-- Before this, a template was in-app only (title + content). In-app fields become optional so an
-- Email-only or WhatsApp-only template can be saved; the service still requires them when the
-- template's channels include in_app.
-- Applied by src/database/tools/apply-notification-template-channels.js (one statement per column,
-- each skipped when the column is already there, so the tool is re-runnable).
ALTER TABLE `notification_templates` ADD COLUMN `description` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `name`;
ALTER TABLE `notification_templates` ADD COLUMN `audience` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'organizer | guest | participant | contact_person' AFTER `trigger_key`;
ALTER TABLE `notification_templates` ADD COLUMN `action_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'in-app deep link' AFTER `image_url`;
ALTER TABLE `notification_templates` ADD COLUMN `email_subject` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` ADD COLUMN `email_preheader` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` ADD COLUMN `email_heading` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` ADD COLUMN `email_body` mediumtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'HTML';
ALTER TABLE `notification_templates` ADD COLUMN `email_button_label` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` ADD COLUMN `email_button_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` ADD COLUMN `email_footer` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` ADD COLUMN `whatsapp_template_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Meta template name, e.g. event_invitation';
ALTER TABLE `notification_templates` ADD COLUMN `whatsapp_category` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'utility | authentication | marketing';
ALTER TABLE `notification_templates` ADD COLUMN `whatsapp_header_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT 'none | text';
ALTER TABLE `notification_templates` ADD COLUMN `whatsapp_header_text` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` ADD COLUMN `whatsapp_body` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'named {{var}} placeholders, numbered for Meta at send time';
ALTER TABLE `notification_templates` ADD COLUMN `whatsapp_footer` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` ADD COLUMN `whatsapp_buttons` json DEFAULT NULL COMMENT '[{type url|copy_code, text, url}] max 2';
ALTER TABLE `notification_templates` ADD COLUMN `sample_values` json DEFAULT NULL COMMENT '{var: sample} for previews and test sends';
ALTER TABLE `notification_templates` MODIFY COLUMN `title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `notification_templates` MODIFY COLUMN `content` text COLLATE utf8mb4_unicode_ci DEFAULT NULL;
