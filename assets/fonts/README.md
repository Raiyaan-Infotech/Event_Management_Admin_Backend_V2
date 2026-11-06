# Fonts for Edit Video / Shorts (burned-in text)

Used by `src/utils/videoProcess.js` → `renderEdit` (only when `VIDEO_EDITOR_ENABLED=true`).

Put the Google Fonts `.ttf` files here, named `<Family without spaces>-<Variant>.ttf`:

| Family | Files |
|---|---|
| Poppins | `Poppins-Regular.ttf`, `Poppins-Bold.ttf`, `Poppins-Italic.ttf`, `Poppins-BoldItalic.ttf` |
| Montserrat | `Montserrat-Regular.ttf`, `Montserrat-Bold.ttf`, `Montserrat-Italic.ttf`, `Montserrat-BoldItalic.ttf` |
| Playfair Display | `PlayfairDisplay-Regular.ttf`, `PlayfairDisplay-Bold.ttf`, `PlayfairDisplay-Italic.ttf`, `PlayfairDisplay-BoldItalic.ttf` |
| Great Vibes | `GreatVibes-Regular.ttf` |
| Dancing Script | `DancingScript-Regular.ttf`, `DancingScript-Bold.ttf` |
| Cormorant Garamond | `CormorantGaramond-Regular.ttf`, `CormorantGaramond-Bold.ttf`, `CormorantGaramond-Italic.ttf`, `CormorantGaramond-BoldItalic.ttf` |

A missing variant falls back to `-Regular`; a missing family falls back to the
server's own font of that name (fontconfig), which Render does not have — so add
the files before switching the editor on.
