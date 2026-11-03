-- Participant waiting list (Jamal, 2026-11-03): someone who joins by the event
-- QR while the host's plan guest limit (Max Guests) is full waits here instead
-- of being refused. The host is told how many are waiting; once there is room
-- (plan upgraded, guests removed) a background job lets them in, oldest first.
-- `payload` = their join form, replayed as-is. One row per person per event.
-- Applied by src/database/tools/apply-participant-waitlist.js.

CREATE TABLE IF NOT EXISTS `event_participant_waitlist` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `website_client_id` int unsigned NOT NULL COMMENT 'The HOST (event owner)',
  `participant_client_id` int unsigned NOT NULL COMMENT 'The waiting person (website_clients.id)',
  `payload` json DEFAULT NULL COMMENT 'Their join form, replayed when let in',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participant_waitlist_event_person` (`event_id`,`participant_client_id`),
  KEY `idx_participant_waitlist_host` (`website_client_id`,`created_at`),
  CONSTRAINT `fk_participant_waitlist_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Participants waiting for guest-limit room';
