-- Invitations flow, step 3 "Share with Guests" (Jamal's design, 2026-11-18).
-- ONE ROW PER GUEST PER SEND: which guest of which event was sent the invitation, on which
-- channel, with what message, now or scheduled. Step 4 "Track Responses" lists these rows.
-- No WhatsApp / email provider is connected yet, so a send is RECORDED (status 'recorded');
-- 'sent' / 'delivered' / 'failed' are for when a provider exists, 'scheduled' waits for its time.
-- The guest itself is still stamped invited (guests.invited_at), as the Share Event popup does.
-- Applied by src/database/tools/apply-invitation-sends.js.
CREATE TABLE IF NOT EXISTS `invitation_sends` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `website_client_id` int unsigned NOT NULL COMMENT 'the host',
  `event_id` int unsigned NOT NULL,
  `guest_id` int unsigned NOT NULL COMMENT 'guests.id - the phone-book guest',
  `batch_key` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'one Send press = one batch',
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'whatsapp | email',
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'email only',
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'as typed, placeholders intact',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'recorded' COMMENT 'recorded | scheduled | sent | delivered | failed',
  `scheduled_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `opened_at` datetime DEFAULT NULL,
  `failed_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_is_event` (`event_id`, `deleted_at`),
  KEY `idx_is_guest` (`guest_id`),
  KEY `idx_is_client` (`website_client_id`),
  KEY `idx_is_batch` (`batch_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
