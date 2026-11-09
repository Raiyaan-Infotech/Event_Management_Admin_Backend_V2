-- Wed Wishes as conversations (Jamal's chat design, 2026-11-09):
--   · the organizer's "last read" per participant thread (Unread count + Unread tab),
--   · a photo on a comment (the organizer replies with text + photo from the thread).
-- Applied by src/database/tools/apply-wish-threads.js (re-runnable).

CREATE TABLE IF NOT EXISTS `event_wish_reads` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `reader_client_id` int unsigned NOT NULL COMMENT 'the organizer (event owner) who read it',
  `thread_key` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'c:<participant client id> | org (the organizer posts)',
  `last_read_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wish_read` (`event_id`,`reader_client_id`,`thread_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Organizer last-read time per Wed Wishes conversation';

ALTER TABLE `event_wish_comments`
  ADD COLUMN `photo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'an attached image (organizer replies)' AFTER `message`,
  ADD COLUMN `size_bytes` bigint unsigned NOT NULL DEFAULT '0' COMMENT 'stored bytes of the photo, counted in the plan storage' AFTER `photo`;
