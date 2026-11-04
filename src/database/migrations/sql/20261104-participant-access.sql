-- Participants web design (portal, 2026-11-04): Block Participant + Hide Participant.
-- is_blocked = 1 -> no event features in the app (every access check reads it), cannot re-join.
-- is_hidden  = 1 -> out of the organizer's main list (Hidden tab) and the app's participant directory.
-- Applied by src/database/tools/apply-participant-access.js (only the missing columns).
ALTER TABLE `event_participants`
  ADD COLUMN `is_blocked` tinyint(1) NOT NULL DEFAULT '0' AFTER `checked_in_by_name`,
  ADD COLUMN `block_reason` varchar(60) DEFAULT NULL AFTER `is_blocked`,
  ADD COLUMN `block_note` varchar(500) DEFAULT NULL AFTER `block_reason`,
  ADD COLUMN `blocked_at` datetime DEFAULT NULL AFTER `block_note`,
  ADD COLUMN `is_hidden` tinyint(1) NOT NULL DEFAULT '0' AFTER `blocked_at`,
  ADD COLUMN `hide_reason` varchar(60) DEFAULT NULL AFTER `is_hidden`,
  ADD COLUMN `hide_note` varchar(500) DEFAULT NULL AFTER `hide_reason`;
