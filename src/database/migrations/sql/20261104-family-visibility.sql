-- Family member Visibility + Key Family Member (portal Family design, 2026-11-04).
-- is_visible = 0 -> "Hide from App": kept on the organizer's list, never sent to participants.
-- is_key     = 1 -> "Highlight as Key Family Member": shown with a badge.
ALTER TABLE `event_family_members`
  ADD COLUMN `is_visible` tinyint(1) NOT NULL DEFAULT '1' AFTER `notes`,
  ADD COLUMN `is_key` tinyint(1) NOT NULL DEFAULT '0' AFTER `is_visible`;
