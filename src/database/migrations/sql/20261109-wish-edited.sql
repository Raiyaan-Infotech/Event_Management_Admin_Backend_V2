-- The organizer may edit a participant's wish (Jamal, 2026-11-09). The wish keeps the participant's
-- name and shows "Edited by organizer". Applied by src/database/tools/apply-wish-threads.js (round 3).

ALTER TABLE `event_wishes`
  ADD COLUMN `edited_by_organizer_at` datetime DEFAULT NULL COMMENT 'the organizer changed this participant wish' AFTER `allow_comments`;
