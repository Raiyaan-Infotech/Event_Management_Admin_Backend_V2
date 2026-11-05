-- Album intro text style (Jamal, 2026-11-05): font, colour, size, alignment, position, bold / italic / shadow.
-- intro_style = JSON { "font": "playfair", "color": "#FFFFFF", "size": "lg", "align": "center",
--                      "position": "middle", "bold": false, "italic": true, "shadow": true }  — NULL = the defaults.
-- Applied by src/database/tools/apply-album-intro-style.js.
ALTER TABLE `event_gallery_albums` ADD COLUMN `intro_style` json DEFAULT NULL AFTER `intro_seconds`;
