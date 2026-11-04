-- Gallery web design (portal, 2026-11-04): Create Folder's Folder Type + Notes.
-- folder_type: images | videos | shorts | mixed — an upload of another kind is refused.
-- Applied by src/database/tools/apply-gallery-folders.js (only the missing columns).
ALTER TABLE `event_gallery_categories`
  ADD COLUMN `folder_type` enum('images','videos','shorts','mixed') NOT NULL DEFAULT 'mixed' AFTER `is_default`,
  ADD COLUMN `notes` varchar(500) DEFAULT NULL AFTER `folder_type`;
