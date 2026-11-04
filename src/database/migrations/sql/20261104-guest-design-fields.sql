-- Guests web design (portal, 2026-11-04): guest type, family side, invite count,
-- RSVP required, app visibility (+ why hidden), VIP (+ category / label / where),
-- the invitation channels and personal message last used.
-- Applied by src/database/tools/apply-guest-design-fields.js (only the missing columns).
ALTER TABLE `guests`
  ADD COLUMN `guest_type` varchar(20) NOT NULL DEFAULT 'individual' AFTER `photo`,
  ADD COLUMN `side` enum('groom','bride') DEFAULT NULL AFTER `guest_type`,
  ADD COLUMN `invite_count` smallint unsigned NOT NULL DEFAULT '1' AFTER `side`,
  ADD COLUMN `rsvp_required` tinyint(1) NOT NULL DEFAULT '1' AFTER `invite_count`,
  ADD COLUMN `is_visible` tinyint(1) NOT NULL DEFAULT '1' AFTER `rsvp_required`,
  ADD COLUMN `hidden_reason` varchar(60) DEFAULT NULL AFTER `is_visible`,
  ADD COLUMN `hidden_note` varchar(500) DEFAULT NULL AFTER `hidden_reason`,
  ADD COLUMN `is_vip` tinyint(1) NOT NULL DEFAULT '0' AFTER `hidden_note`,
  ADD COLUMN `vip_category` varchar(60) DEFAULT NULL AFTER `is_vip`,
  ADD COLUMN `vip_label` varchar(60) DEFAULT NULL AFTER `vip_category`,
  ADD COLUMN `vip_highlight` json DEFAULT NULL AFTER `vip_label`,
  ADD COLUMN `invite_channels` json DEFAULT NULL AFTER `vip_highlight`,
  ADD COLUMN `invite_message` varchar(1000) DEFAULT NULL AFTER `invite_channels`,
  -- RSVP board: the organizer's answer for a guest who has not joined, + hide / decline reason.
  ADD COLUMN `rsvp_response` enum('yes','no','maybe') DEFAULT NULL AFTER `invite_message`,
  ADD COLUMN `rsvp_attending` smallint unsigned DEFAULT NULL AFTER `rsvp_response`,
  ADD COLUMN `rsvp_meal` varchar(255) DEFAULT NULL AFTER `rsvp_attending`,
  ADD COLUMN `rsvp_note` varchar(500) DEFAULT NULL AFTER `rsvp_meal`,
  ADD COLUMN `rsvp_decline_reason` varchar(60) DEFAULT NULL AFTER `rsvp_note`,
  ADD COLUMN `rsvp_responded_at` datetime DEFAULT NULL AFTER `rsvp_decline_reason`,
  ADD COLUMN `rsvp_hidden` tinyint(1) NOT NULL DEFAULT '0' AFTER `rsvp_responded_at`,
  ADD COLUMN `rsvp_hidden_reason` varchar(60) DEFAULT NULL AFTER `rsvp_hidden`;
