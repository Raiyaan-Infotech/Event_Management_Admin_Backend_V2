-- Contact Messages = Jamal's 8 portal screens (2026-11-11).
--   · An INQUIRY is one question round inside a participant's chat: it starts with the
--     participant's first message (or their first message after Resolved / Removed) and
--     ends when the team marks it Resolved. One chat can hold many inquiries.
--   · Resolve form: resolution type + internal note (on the inquiry).
--   · Block form: reason, note, duration (until the event ends / permanent).
--   · Remove form: reason.
--   · Reply time: awaiting_since + reply totals → "Awaiting Reply" and "Avg. Reply Time".
--   · A photo on a message, and the message a team reply quotes (Replying to, added later the same day).
-- Applied by src/database/tools/apply-contact-inquiries.js (re-runnable, back-fills old chats).

CREATE TABLE IF NOT EXISTS `event_contact_inquiries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `chat_id` int unsigned NOT NULL,
  `event_id` int unsigned NOT NULL,
  `first_message` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'the participant message that opened it',
  `opened_at` datetime NOT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `resolution_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolution_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'internal, never shown to the participant',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contact_inquiry_chat` (`chat_id`, `id`),
  KEY `idx_contact_inquiry_event` (`event_id`),
  CONSTRAINT `fk_contact_inquiry_chat` FOREIGN KEY (`chat_id`) REFERENCES `event_contact_chats` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Question rounds of a Contact Person chat';

ALTER TABLE `event_contact_chats`
  ADD COLUMN `awaiting_since` datetime DEFAULT NULL COMMENT 'oldest participant message not answered yet' AFTER `participant_unread`,
  ADD COLUMN `reply_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'team answers counted in reply_seconds' AFTER `awaiting_since`,
  ADD COLUMN `reply_seconds` bigint unsigned NOT NULL DEFAULT '0' COMMENT 'total wait before those answers' AFTER `reply_count`,
  ADD COLUMN `block_reason` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `reply_seconds`,
  ADD COLUMN `block_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `block_reason`,
  ADD COLUMN `block_duration` enum('event_end','permanent') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `block_note`,
  ADD COLUMN `blocked_at` datetime DEFAULT NULL AFTER `block_duration`,
  ADD COLUMN `remove_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `blocked_at`,
  ADD COLUMN `removed_at` datetime DEFAULT NULL AFTER `remove_reason`;

ALTER TABLE `event_contact_chat_messages`
  ADD COLUMN `photo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'an attached image' AFTER `body`,
  ADD COLUMN `size_bytes` bigint unsigned NOT NULL DEFAULT '0' AFTER `photo`,
  ADD COLUMN `reply_to_id` int unsigned DEFAULT NULL COMMENT 'the participant message a team reply quotes (Replying to)' AFTER `size_bytes`;
