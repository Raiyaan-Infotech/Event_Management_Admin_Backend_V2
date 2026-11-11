-- Live Streaming = Jamal's updated screens (2026-11-11, "Live Stream Updated").
--   · Category form: status (active), default visibility, notes.
--   · Stream form: 9 platforms, visibility (6), end time, status (scheduled / live / ended),
--     organizer notes, an optional RTMP address, the publishing switches
--     (go live automatically, notify participants; "show in event page" = is_enabled).
--   · Viewers: one row per participant per stream (views + first / last time) and a running total.
-- Applied by src/database/tools/apply-live-stream-upgrade.js (re-runnable).

CREATE TABLE IF NOT EXISTS `event_live_stream_views` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `stream_id` int unsigned NOT NULL,
  `event_id` int unsigned NOT NULL,
  `website_client_id` int unsigned NOT NULL COMMENT 'the participant who opened the stream',
  `views` int unsigned NOT NULL DEFAULT '1',
  `first_viewed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_viewed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_live_view_stream_client` (`stream_id`, `website_client_id`),
  KEY `idx_live_view_event` (`event_id`),
  CONSTRAINT `fk_live_view_stream` FOREIGN KEY (`stream_id`) REFERENCES `event_live_streams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Who opened a live stream';

ALTER TABLE `event_live_stream_types`
  ADD COLUMN `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = not offered for new streams' AFTER `description`,
  ADD COLUMN `default_visibility` enum('public','participants','guests','invite_link','unlisted','private') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'public' AFTER `is_active`,
  ADD COLUMN `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `default_visibility`;

ALTER TABLE `event_live_streams`
  ADD COLUMN `rtmp_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'encoder address, organizer only' AFTER `stream_url`,
  ADD COLUMN `visibility` enum('public','participants','guests','invite_link','unlisted','private') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'public' AFTER `rtmp_url`,
  ADD COLUMN `end_time` time DEFAULT NULL AFTER `stream_time`,
  ADD COLUMN `status` enum('scheduled','live','ended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled' AFTER `end_time`,
  ADD COLUMN `started_at` datetime DEFAULT NULL AFTER `status`,
  ADD COLUMN `ended_at` datetime DEFAULT NULL AFTER `started_at`,
  ADD COLUMN `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'organizer notes, never shown to participants' AFTER `description`,
  ADD COLUMN `auto_go_live` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Live from the start time without a click' AFTER `is_enabled`,
  ADD COLUMN `notify_participants` tinyint(1) NOT NULL DEFAULT '1' AFTER `auto_go_live`,
  ADD COLUMN `views_count` int unsigned NOT NULL DEFAULT '0' AFTER `notify_participants`;

-- Run by the tool only while the column still has the old list / size:
-- ALTER TABLE `event_live_streams` MODIFY `platform` enum('youtube','facebook','instagram','zoom','google_meet','teams','custom_rtmp','embedded','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'youtube';
-- ALTER TABLE `event_live_stream_types` MODIFY `description` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
