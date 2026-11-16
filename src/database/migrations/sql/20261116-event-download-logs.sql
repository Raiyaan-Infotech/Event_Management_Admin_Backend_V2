-- File Downloads list (client portal → QR Code → File Downloads, Jamal's design 2026-11-16).
-- ONE ROW PER DOWNLOAD: who downloaded which file of the event, when, on what device, and whether
-- it completed. event_downloads keeps only a counter per file, which cannot say who or when.
-- Written by POST /client/downloads/:id/hit when a participant downloads (and by the
-- attendance-sample style seeder for sample data, source = 'sample').
-- Applied by src/database/tools/apply-event-download-logs.js.
CREATE TABLE IF NOT EXISTS `event_download_logs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `download_id` int unsigned NOT NULL COMMENT 'event_downloads.id — the file',
  `participant_id` int unsigned DEFAULT NULL COMMENT 'event_participants.id — who',
  `participant_client_id` int unsigned DEFAULT NULL COMMENT 'their app account',
  `device` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'mobile | tablet | desktop',
  `platform` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Android, iOS, Windows, …',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed' COMMENT 'completed | failed',
  `failed_reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'app' COMMENT 'app | sample',
  `downloaded_at` datetime NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_edl_event_time` (`event_id`, `downloaded_at`),
  KEY `idx_edl_download` (`download_id`),
  KEY `idx_edl_participant` (`participant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
