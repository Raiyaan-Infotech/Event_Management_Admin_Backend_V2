-- Wed Wishes chat, round 2 (Jamal's panel designs, 2026-11-09):
--   · Hide Chat: the organizer hides a conversation from the main inbox (restored from Hidden), with a note,
--   · Manage Comments: "Allow new comments on this wish" — per wish.
-- Applied by src/database/tools/apply-wish-threads.js (re-runnable; it also runs 20261109-wish-threads.sql).

ALTER TABLE `event_wish_reads`
  MODIFY COLUMN `last_read_at` datetime DEFAULT NULL,
  ADD COLUMN `is_hidden` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = conversation hidden from the organizer''s main inbox' AFTER `last_read_at`,
  ADD COLUMN `hide_note` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `is_hidden`,
  ADD COLUMN `hidden_at` datetime DEFAULT NULL AFTER `hide_note`;

ALTER TABLE `event_wishes`
  ADD COLUMN `allow_comments` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = participants cannot add new comments on this wish' AFTER `is_flagged`;
