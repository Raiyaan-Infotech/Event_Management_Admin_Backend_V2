-- The mobile app home screen design an event uses (Jamal, 2026-10-31).
-- Picked in the Client Portal's Create Event wizard, Step 1 (Event Basics).
-- NULL = none picked yet. SET NULL on delete so removing a template never breaks an event.
-- Applied by src/database/tools/apply-home-screen-templates.js.
ALTER TABLE `events`
  ADD COLUMN `home_screen_template_id` int unsigned DEFAULT NULL AFTER `theme_id`,
  ADD KEY `idx_events_home_screen_template` (`home_screen_template_id`),
  ADD CONSTRAINT `fk_events_home_screen_template` FOREIGN KEY (`home_screen_template_id`)
    REFERENCES `home_screen_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
