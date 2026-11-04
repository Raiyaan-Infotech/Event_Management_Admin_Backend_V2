# Event Invit V2 — Session Log

Started 2026-10-30. This is the V2 log. Everything before V2 (Sessions 1–58 and the
Oct 2026 app work) is in [docs/session_V1_history.md](docs/session_V1_history.md) — grep
that file for "why was X built this way" questions about code that came from V1.

**Rule for this file:** no passwords, tokens or keys. The repo is on GitHub. Secret values live
only in Render / Vercel and in each project's local `.env` files.

---

## 1. What V2 is

A second version of Event Invit, split by role:

- **Mobile app = participants only.** Organizers and contact persons use the **Client Portal** on the web.
- **Own database, own backend, own repos, own hosting.** V1 is untouched and keeps running.
- **Same behaviour as V1 everywhere else** — V2 was copied from V1 on 2026-10-29.

V1 stays the full app. Never push V2 code to a V1 repo, and never point a V2 service at a V1 database.

---

## 2. The six V2 projects

| # | Project | Local folder (`D:\Jamal\Eveninvit_2\`) | GitHub repo (`Raiyaan-Infotech/`) | Live address |
|---|---|---|---|---|
| 1 | Backend | `Event_Management_Admin_Backend` | `Event_Management_Admin_Backend_V2` | https://event-management-admin-backend-v2.onrender.com |
| 2 | Admin portal | `Event_Management_Admin_Frontend` | `Event_Management_Admin_Frontend_V2` | https://event-management-admin-frontend-v2.vercel.app |
| 3 | Client portal | `event_client_single` | `Event_Management_Client_V2` | https://eventmanagementclientv2.vercel.app |
| 4 | Website Builder | `Event_Managment_Website_Builder` | `Event_Managment_Website_Builder_V2` | https://eventmanagmentwebsitebuilderv2.vercel.app |
| 5 | Public Website | `Event_Management_Public_Site` | `Event_Management_Public_Site_V2` | https://eventmanagementpublicsitev2.vercel.app |
| 6 | Mobile app | `Event_Invite_Mobile_App` | `Event_Invite_Mobile_App_V2` | (Android build, not a website) |

All six `origin` remotes point at the V2 repos above (checked 2026-10-30). Branch is `main`
everywhere. Each repo also carries the one-line LICENSE commit GitHub created.

**Not in V2:** the Vendor Portal, the Staff portal, and (since 2026-10-31) the Website Builder and Public Website — see section 7b.

---

## 3. Databases

| | Name | Where |
|---|---|---|
| Local | `event_v2` | MySQL on localhost:3306 — full copy of local `event_` made 2026-10-30 |
| Live | `event_v2` | Same Aiven MySQL server as V1 — full copy of live `event_`, 179 tables, 390,279 rows, verified identical at copy time |

- V2 `.env` and `.env.production` both have `DB_NAME=event_v2`.
- V1's `event_` databases were only read. The one change made there was removing the Home Screen
  Templates table and permissions from local V1 (it is a V2-only feature).
- `initial_setup.sql` in this repo includes the `home_screen_templates` table.
- Aiven is ~374 ms per query: batch writes, never loop row by row.

### Live `event_v2` rows changed after the copy

- `company_websites` id 5 → `custom_domain = eventmanagementpublicsitev2.vercel.app`
  (the copy still held the V1 site address, which made the V2 public site answer "site not found").
  V1's own row is unchanged.

---

## 4. V2-only features

### Home Screen Templates (admin portal, 2026-10-30)

Admin sidebar: **Template → Home Screen Templates**, route `/admin/home-screen-templates`.
The mobile app's event home screen design, per event category.

- Fields: name, description, event category, template style (a `template_categories` row — Royal,
  Floral…), home screen image (PNG/JPG ≤ 2 MB, 9:16), colour palette (2–5 colours: primary,
  secondary, accent, background, text; "extract from image" works on a newly picked file only),
  notes. Live phone preview. List with stats, filters, switch, edit, delete.
- Backend: table `home_screen_templates`; `/api/v1/home-screen-templates` (list, stats, by id,
  create, update, status, delete); approval-aware; permissions `home_screen_templates.*`.
- Migration `src/database/migrations/sql/20261030-home-screen-templates.sql`, tool
  `src/database/tools/apply-home-screen-templates.js`, permissions through
  `src/database/seeders/guest-option-permissions.seeder.js`.
- Applied to local and live `event_v2`. Service tests 10/10 on local.
- **Not wired to the mobile app yet** (no app endpoint or picker).

### Admin menu rename

The old invitation "Templates" group is now **Invitation** (child "All Invitations", list heading
"Invitation Templates", breadcrumb "Invitation"). Routes still `/admin/templates/...`.

### Website login card (also in V1)

Public Website and the admin's website preview: **Mobile | Email** tabs.
Mobile = real one-time code through `POST /public/website-clients/login/otp/request|verify`.
Email = email + password. "Login with Google" only. `/login/otp/verify` is in
`COOKIE_BEARING_PUBLIC_PATHS` in `src/app.js` so the browser keeps the session cookies.
"Keep me logged in" was not built (sessions are 7 days).

### Mobile app (participant-only)

- My Events uses V1's organizer design: Current / Upcoming / Past tabs, search, organizer-style
  card, the guest's own RSVP answer instead of host counts, no wishlist heart.
- Login phone field: every country, per-country number check, Google "choose your number" fills
  country + number, OTP boxes take focus after Send OTP.
- **Still calls the V1 backend** — see open item 2.

---

## 5. Settings per service (names only)

Values are in Render / Vercel. Vercel variables are all type **Config** (not Secret) — they are
web addresses and the browser sees them anyway. Redeploy after any change; they are read at build time.

**Backend — Render:** `NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME=event_v2`, `DB_USER`,
`DB_PASSWORD`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `SESSION_SECRET`,
`ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY`, `FRONTEND_URL`, `UPLOAD_PATH`, `MAX_FILE_SIZE`,
`OTP_ACCEPT_ANY`, `WEBSITE_CLIENT_DEFAULT_VENDOR_ID`, `EVENT_QR_SECRET`, `MYMEMORY_EMAIL`,
`PUBLIC_SITE_ROOT_DOMAINS`, `OAUTH_CALLBACK_BASE_URL`, `GOOGLE_CLIENT_ID/SECRET`,
`FACEBOOK_APP_ID/SECRET`, plus `MSG91_*` and `AWS_*` copied from the V1 Render service.

- `FRONTEND_URL` = the four V2 website addresses (admin, client, builder, public site), comma
  separated, **no spaces, value must start with `https://`** (a value that starts with the variable
  name `FRONTEND_URL=` blocked the admin site once).
- `EVENT_QR_SECRET` **must equal V1's**. The V2 database holds QR codes encrypted with it.
- `OAUTH_CALLBACK_BASE_URL` = the V2 backend address.

**Admin portal:** `NEXT_PUBLIC_API_URL` (…/api/v1), `NEXT_PUBLIC_SOCKET_URL` (backend address),
`NEXT_PUBLIC_APP_URL` (its own address), `NEXT_PUBLIC_CLIENT_PORTAL_URL` (client portal + `/dashboard`).

**Client portal:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_SITE_URL`
(= the V2 Public Website — the portal has no login page, signed-out visitors go there).

**Website Builder:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLIENT_PORTAL_URL`,
`NEXT_PUBLIC_VENDOR_PORTAL_URL` (currently set to the client portal as a stand-in — wrong, see item 1).

**Public Website:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLIENT_PORTAL_URL`, `PUBLIC_SITE_REVALIDATE=60`.
Never set `PUBLIC_SITE_DEV_HOST` in production: it pins every visitor to one company.

Google sign-in needs `<backend>/api/v1/public/website-clients/oauth/google/callback` added to the
Google console's authorised redirect URIs.

---

## 6. Logins (V2 database = copy of V1, so the accounts are the same)

No passwords here. Use the V1 passwords; the project's test files use the shared test password.

| Where | Account |
|---|---|
| Admin portal | `developer@admin.com` (full access), `superadmin@admin.com`, `admin@admin.com` (writes go to approval) |
| Client login (Public Website → Mobile tab, any code while `OTP_ACCEPT_ANY=true`) | `7010051951` Ismail, `9884699436` Jamal, `9000000028` Arsath, `9000000029` Najeeb |
| Mobile app (any code) | participants `9884699435`, `9884699439`; contact person `8220348702` |
| Vendor (Website Builder, via the vendor portal login) | `jamal@vendor.com` — **no vendor portal in V2 yet** |

---

## 7. Verification log

**2026-10-30/31, all checked from the outside with real requests:**

- Backend answers and reads `event_v2` (site lookup for the V2 public address returns the V2 site).
- All four V2 websites open. Client portal, Website Builder and Public Website call the V2 backend
  (checked in their built code). The admin goes through its own server proxy.
- Cross-site access: after `FRONTEND_URL` was corrected, all four V2 addresses are allowed (HTTP 204)
  and an unknown address is refused (HTTP 500). Before the fix the admin address was refused.
- Not yet tested in a browser by us: the login flows themselves.

---

## 7b. Decision 2026-10-31: V2 has NO Website Builder and NO Public Website

Jamal dropped both from V2. Client sign-in now lives in the **Client Portal itself**:

- New page `/login` in `event_client_single` (`src/app/login/page.tsx`, `src/components/auth/*`,
  `src/lib/auth-client.ts`): the same card as the Public Website — **Mobile | Email** tabs,
  Send OTP -> six code boxes -> Verify & Log In, email + password (with the authenticator-code step
  for 2FA accounts), **Login with Google** (returns to `/login`, with the "add your phone number"
  step when the Google account has none). Portal theme colours, not the website's pink.
- Signed-out visitors, the auth gate, the "Sign in" button and Log out all go to `/login`
  (`src/lib/site.ts` -> `loginUrl()`; `?next=` is validated to a same-origin path).
- `NEXT_PUBLIC_SITE_URL` on the portal is now OPTIONAL (footer links only). Remove it from Vercel.
- Backend: `src/app.js` — `/login/otp/verify` added to `COOKIE_BEARING_PUBLIC_PATHS`
  (the V2 copy predated that fix; without it the OTP is accepted but the cookie is dropped).
- No sign-up link: V2 has no sign-up page; accounts come from Admin -> Clients.
- Type-check of the portal passes. Not yet tried in a browser.
- The V2 Website Builder / Public Website repos and Vercel projects are now unused (nothing deleted).
  `FRONTEND_URL` on Render only needs the **admin** and **client portal** addresses.
- The V2 Website Builder login question (open item 1 below) is closed by this decision.

---

## 7b-2. 2026-11-02: Website Builder + Public Website RESTORED (reverses 7b)

The two Vercel projects had been deleted (`DEPLOYMENT_NOT_FOUND`); the local folders were gone too.

- Local folders re-cloned from the V2 repos (they already held V1's latest code: builder `8c9c56a`,
  public site `0f5dfcb`). Each has `.env.local` (localhost) and `.env.production.local` (the live values) —
  both gitignored.
- Vercel projects recreated in `jamal2426s-projects` with the SAME names, so the addresses in section 2
  are back; both connected to their V2 GitHub repo (push to `main` = deploy). Framework set to
  **Next.js** by hand — a project made with `vercel project add` has none and the build fails with
  "No Output Directory named public".
- Production variables as in section 5 (builder's `NEXT_PUBLIC_VENDOR_PORTAL_URL` = client portal stand-in).
  ⚠ `printf | vercel env add` saved them EMPTY; use `vercel env add K production --value V`.
- Verified live: builder `/login` 200 and its code calls the V2 backend; public site renders the V2
  company site (hero "Make Every Moment Memorable…"); backend CORS allows both (204).
  The "This site isn't available" text in the page source is the bundled not-found view, not shown.

## 7c. Create Event → Step 1 home template picker (2026-10-31)

Client Portal wizard, Step 1 "Event Basics": after the Event Category, **"Choose <Category> Mobile App
Home Template"** — style chips, template cards (phone preview, name, description, colour dots,
Preview / Select, check + "Selected"), and a **Mobile Home Preview** side panel. Optional; choosable later.

- **Style chips are dynamic:** the backend builds them from the **Template Categories master table**
  (`template_categories`, admin Invitation → Template Categories) — only styles that active templates of
  that event category use, in the master table's sort order. No style list in the frontend.
- Backend: `GET /client/home-screen-templates?event_category_id=` (`homeScreenTemplate.service.listForClient`,
  `controllers/clientHomeScreenTemplate.controller.js`) — active templates only.
- Saved on the event: new column **`events.home_screen_template_id`** (FK home_screen_templates, SET NULL).
  Migration `migrations/sql/20261031-event-home-screen-template.sql`, applied by
  `tools/apply-home-screen-templates.js` (now does both steps). Event model, `initial_setup.sql`,
  `clientEvent.service` WRITABLE_FIELDS + check (must exist and be active; '' / null clears).
- A selection that is not in the category's list (category changed, template switched off) is cleared.
- **Sample data:** `seeders/home-screen-templates.seeder.js` — 5 Wedding templates, one per style
  (Classic Romance, Royal Celebration, Modern Elegance, Traditional Charm, Graceful Ivory) with generated
  placeholder SVG artwork (no text; names/countdown/menus are drawn over it), uploaded via media.service.
  Skips a style that does not exist and a name that already exists. Dry run by default, `--apply` to write.
- Portal: `components/common/home-screen-preview.tsx` (same drawing as the admin preview),
  `hooks/use-home-screen-templates.ts`, `events/_components/home-template-picker.tsx`.
- LOCAL `event_v2`: column added, 5 samples seeded; listing test OK (5 templates, chips Classic, Royal,
  Minimal, Elegant, Traditional; switched-off template hidden; other category -> none). Portal type-check passes.
  Not yet seen in a browser.
- Not built (mockup extras): "Popular" badge, Preview All, Compare Templates. The mobile app does not read the
  chosen template yet.
- **PRODUCTION ORDER (live event_v2):** `apply-client-personal-address.js --prod --apply` (item 1 below) ->
  `tools/apply-home-screen-templates.js --prod --apply` -> `seeders/home-screen-templates.seeder.js --prod --apply`
  -> push backend -> push client portal.

---

## 7d. Home Screen Categories — own master table (2026-10-31)

Jamal: home screen templates need their OWN category master, not the invitation Template Categories.

- Admin: **Template → Home Screen Categories** (`/admin/home-screen-templates/categories`) — same screen as
  Invitation → Template Categories (inline add/edit, name + slug, active switch, display order, drag reorder,
  search, delete), count column = templates. Hook `use-home-screen-categories.ts`. Permission
  `home_screen_categories.*` (guest-option-permissions.seeder.js). Breadcrumb "Home Screen Categories".
- Backend: table `home_screen_categories` (`migrations/sql/20261031-home-screen-categories.sql`), model
  `HomeScreenCategory`, `homeScreenCategory.service/controller/routes`, `/api/v1/home-screen-categories`,
  registered in both approval maps. Soft delete keeps templates (they show without a style).
- `home_screen_templates.template_category_id` (-> template_categories) is REPLACED by
  **`home_screen_category_id`** (-> home_screen_categories, FK `fk_home_tpl_category`, SET NULL).
  `tools/apply-home-screen-templates.js` step 3 does it: copies each style in use across BY NAME, re-points the
  rows, drops the old FK/index/column. `initial_setup.sql` has the final shape.
- The Home Screen Template form's "Template Style" dropdown and the portal's Step 1 style chips now read this
  table. The sample seeder creates the 5 default styles (Classic, Royal, Minimal, Elegant, Traditional) when missing.
- LOCAL `event_v2`: applied; 5 styles copied, templates re-pointed; test 7/7 (list counts, chips follow the master's
  order, a new category appears as a chip once used, bad id refused, delete keeps the template). Both frontends type-check.

**PRODUCTION ORDER (live event_v2), replaces the one in 7c:**
1. `node src/database/tools/apply-client-personal-address.js --prod --apply`  (fixes client sign-in, item 1 below)
2. `node src/database/tools/apply-home-screen-templates.js --prod --apply`  (categories table, column switch, events column)
3. `node src/database/seeders/guest-option-permissions.seeder.js --prod`  (home_screen_categories permissions)
4. `node src/database/seeders/home-screen-templates.seeder.js --prod --apply`  (5 styles + 5 sample templates)
5. push backend, then admin frontend and client portal.

---

## 7e. My Events redesign (Client Portal, 2026-10-31)

Jamal's My Events mockup: full-width stat tiles (no right rail any more), tabs with counts (All / Upcoming /
Live / Completed / Drafts from `/client/events/stats`), "Sort by" (Latest = created_desc), search + "All Events"
category select, and one card per event: invitation art, name + status badge, date, venue,
"N Guests (M Confirmed)", category + privacy chips, **Pre-Event Setup** ring "X of 10" + bar + "View Setup
Details" popover, and View Event / Edit Event / Duplicate / Share / Delete. The mockup's empty box after the
progress panel is NOT reproduced — the details column takes that width.

- **Setup progress is derived** from the event row (no table): category, name+date+time, venue, home template,
  app menus, invitation design, cover image, contact person, guests added, published. `SETUP_STEPS` in
  `events/page.tsx`.
- **Duplicate:** no backend endpoint — `useDuplicateEvent` reads the event and creates a copy through the normal
  create (status draft, name + " (Copy)"), then opens its edit page. Plan limits and validation apply.
- **Share:** the event QR dialog ("Share Event").
- Backend `getDashboardStats`: `total_guests`, `rsvp_going/pending/declined`, `rsvps_received` (yes + no) now
  counted from `event_participants` (one grouped query); `guests_available: true`. Local check matches a direct
  count (client 23: 121 guests, 42 yes). The Dashboard's RSVP tile caption now reads "N accepted".
- Removed from My Events: the Quick Actions / Upcoming / Event Performance rail and the privacy filter (not in
  the design). Portal type-check passes; not yet seen in a browser.

---

## 7f. Create Event wizard = the mobile app's steps, no invitation (2026-10-31)

Jamal: the portal's Create Event must follow the mobile app's form; the invitation design is OUT of Create
Event (it returns later as its own module).

Steps now (`event-wizard.tsx`, constants S_TYPE..S_CREATED): **1 Event Type** (category + home template picker),
**2 Basic Details** (title, Groom/Bride or hosts, tagline, short description, Event Status Public/Private cards
with the participant-count note, event photo), **3 Date & Time** (time zone, start/end date + time),
**4 Venue** (name, address, landmark, map link, lat/lng, venue image), **5 Menus**, **6 Settings** (Guest
Registration switches shown disabled "Soon" — the app does not save them either), **7 Organizer Settings**
(hosted by, contact number, email, footer note), **8 Review** (summary per section with Edit links; Create /
Save here), **9 Event Created** (summary, QR, Download QR, share tiles).

- Removed from the form: Design & Theme, Preview Invitation, the ceremony fields, the Event Status (draft /
  cancelled) select and the Unlisted privacy option. Their values are still sent as loaded, so editing an old
  event does not wipe them; new events still get the plan's first invitation template as `theme_id` silently.
- Event Created no longer shows / downloads the invitation card, so `invitation_image` is not re-rendered on
  save (the app falls back to its drawn card) — until the invitation module returns.
- Validation per step: Type -> category; Basic -> title + photo; Date -> 4 date/time fields; Organizer -> phone /
  email format. Portal type-check passes; not yet seen in a browser.

---

## 7g. Edit Event hub + Guests / RSVP / Agenda per event (Client Portal, 2026-10-31)

**Edit Event = the app's hub.** `/dashboard/events/:id/edit` (`events/[id]/_components/edit-event-hub.tsx`):
Splash Screen, Invitation Card, Basic Details, Event QR (dialog), Date & Time, Venue, Agenda, Family,
Participants, RSVP, Photo Gallery, Wed Wishes (Soon), Live Streaming (Soon), Social Links (Soon), Contact Person,
Organizer Settings (web extra), Event App Menu. Form rows open `?section=basic|date|venue|menus|organizer|invitation`
-> the wizard in SECTION MODE (no stepper, Cancel / Save, save = the same full update, back to the hub).
**Invitation Card** = the old Design & Theme + Preview pages (restored from git) as pages 1-2 of that section.
`?section=all` = the full Create Event steps (drafts: "Continue Create Event" banner; My Events "Continue setup" and
Duplicate go there). Module rows open the event page with `?tab=` (event-detail reads it). Portal has no Wishes /
Live Streaming / Social Links modules yet -> "Soon".

**Guests per event (as the app):** event picker on Guests; tabs + tiles All / Not Invited / Invited / Pending /
Confirmed / Declined with counts (`/client/guests?event_id=&status=`, `/client/guests/stats?event_id=` -> `statuses`);
Status column; bulk **Mark as Invited** (`action: invite`); Add Guest and Import carry `?event=` and send `event_id`.
No backend change (the 2026-10-28 event-based guest API).

**RSVPs per event:** no "All Events"; always one event (`?event=` or the first); Clear filters keeps the event.

**Agenda:** new sidebar page `/dashboard/agenda` — event picker + the same AgendaPanel as the Schedule tab.

Portal type-check passes; none of this seen in a browser yet.

---

## 7h. Venue map in Create / Edit Event (2026-10-31)

`components/common/venue-map-picker.tsx` on the Venue step: Google map, click / drag the pin, Use My Current Location,
Remove Pin, search box (Places API New, optional). Fills venue_lat / venue_lng; name, address and map link only when
empty. Key = the mobile app's Google Maps key via `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (set in the portal's local
.env.local; documented in .env.example; must be added on Vercel).

**Blocker found (tested in headless Chromium):** that key's Google project does NOT have the Maps JavaScript API
enabled -> `ApiNotActivatedMapError` ("This page didn't load Google Maps correctly"). Places API (New) is blocked
by the key's API restrictions; Geocoding not enabled. The key has no app restriction (server calls are refused only
for "not activated"). To make the map work: enable Maps JavaScript API (+ Places API (New) for search) in Google
Cloud and allow them in the key's API restrictions — or use a separate web key with an HTTP-referrer restriction.
Until then the Venue step still takes typed latitude / longitude.

---

## 7i. Splash Screen off the web; Invitation Card pages like the app (2026-10-31)

- **Splash Screen removed from the Client Portal:** sidebar entry, Edit Event hub row, the `/dashboard/splash-screens`
  pages and `hooks/use-splash-screens.ts` deleted. It stays in the mobile app; the backend API is untouched.
- **Edit Event → Invitation Card** now follows the app's Design pages: 1 Choose a Template Category (style tiles with
  counts) -> 2 Choose a Template (All / Color / Image / Gradient / Custom tabs, grid, Change Category) -> 3 Your Image
  (custom templates only; skipped otherwise, both directions; required picture checked here) -> Preview (components +
  live card, Save). **Card Settings** (primary / secondary colour, QR style) opens from a button on the Preview and
  returns with Done / Back to Preview. Page constants S_DESIGN, S_TEMPLATES, S_CUSTOM_IMG, S_CARD_SETTINGS, S_PREVIEW.
- Portal type-check passes; not yet seen in a browser.

---

## 7j. Create Event order + fit view (2026-10-31)

Steps now: 1 Event Type, 2 Basic Details, 3 Date & Time, 4 Venue, **5 Mobile Splash Screen (EMPTY placeholder —
Jamal: "just an empty screen"; nothing saved)**, 6 Menus, 7 **Organizer Details** (renamed from Organizer
Settings), 8 Review, 9 Event Created. **Settings step removed.** Fit view: Basic / Date / Venue / Organizer use
the full card width in two columns (Venue: map left, fields right); the stepper no longer forces a 680px minimum.
Edit hub: "Mobile Splash Screen" row shows Soon; "Organizer Details" renamed. The venue pin also fills venue name /
address / landmark like the app (Google geocoder, OpenStreetMap fallback).

## 7k. Live check + Create Event screenshots (2026-10-31)

- Pushed (no Co-Authored-By): portal `5a0aa72`, backend `aed9eef`. Pushes go out under the GitHub login
  saved in Windows Credential Manager (`Jamal2426`), so no sign-in window appears.
- Live V2 portal (`eventmanagementclientv2.vercel.app`) checked in a headless browser: `/login` Mobile OTP
  sign-in works end to end (so the 4 missing `website_clients` columns are now on live `event_v2`).
- Screenshots of every Create Event page are in `D:\Jamal\Eveninvit_2\screenshots\create-event\`
  (01 Event Type ... 08 Review, 10 Edit Event hub, 11-14 Invitation Card: category, template, preview,
  card settings). Taken through Edit Event -> all steps on Ismail's event #34 without saving, because
  Ismail's Basic plan is at its limit (2 events allowed, 6 created) and `/events/create` shows
  "Event limit reached". Step 9 "Event Created" needs a real create on an account under its limit.

---

## 7l. Create / Edit Event — Jamal's review fixes (2026-11-02, portal only, no backend change)

- Title "New Event" / "Edit Event"; header **New Event** button hidden on `/events/create` and `/events/:id/edit`.
- Step description now sits under the active step in the stepper (no "Step N" block in the card).
- **Exit** asks on new AND edit: Save as Draft (new / draft events; toast "Draft saved successfully.") or
  **Save Changes** when editing a live event (never unpublishes it), Exit, Keep Editing.
- Step 1: home templates in a slider with left / right arrows.
- Step 2: order Title, Tagline, Short Description, Groom/Bride, Event Status; photo in its own column + size note.
  ALL mandatory now (tagline, description, first host; second host for wedding-type).
- Step 3: red "* The event date cannot be changed after it is created."; a saved time zone not in the list
  (e.g. the app's long India name) is now offered, so the box no longer shows empty.
- Step 4: "Step 1 (Search on Map)" / "Step 2 (Want to Edit)"; own search box + Search button (Google geocoder,
  OpenStreetMap fallback — the Places autocomplete was dropped, Places is blocked for the key); taller map;
  "(Optional)" labels removed.
- **Step 5 Splash Screen built** (`_components/splash-step.tsx`, `hooks/use-event-splash.ts`): background
  Image / Gradient (linear|radial, 5 directions, start/end) / Color (presets), invitation parts with switches,
  animation Fade / Zoom / Slide / Particle, music (MP3 ≤ 5 MB, play), live phone preview. Saved to the existing
  `/client/splash-screens` row of the event AFTER the event save, only if touched or already existing.
  Web-only values live in `background_config` (gradient_*, animation, music_*). ⚠ The mobile app does not yet
  play animation / music or draw the web gradient/image — it renders its splash from the invitation design.
  Edit hub row "Splash Screen" now opens `?section=splash`.
- Step 6 "App Menus": panel descriptions (Additional = switchable, Default = can't be disabled).
- Step 7: **Organizer Photo** (required, square crop) → `events.organizer_image` (already accepted by the API).
- Review: cards in step order — Event Type, Basic, Date & Time, Venue, Splash, App Menus, Organizer.
- **Mandatory fields = the mobile app's rules** (Jamal): Basic = title, tagline, description, photo, and
  Groom + Bride on wedding-type only (other types' hosts optional — to be decided later); Date = all four, end
  not before start; Venue = map pin + name, address, landmark, map link (http/https); Organizer = hosted by,
  number, email, footer note (+ organizer photo, from the web design — the app has it optional).
- Type-check passes; not yet seen in a browser; not committed.

## 7m. Create / Edit Event — round 2 (2026-11-02)

- **Fit view:** tighter card padding, gaps and inputs (h-10); map 340px (400 on xl); smaller splash preview.
- **Time zones from the API:** the wizard uses `/client/event-options` → `timezones` (the app's list);
  default = "(GMT +05:30) India Standard Time (Mumbai, Kolkata, New Delhi, Colombo)".
- **Crop like the app:** `image-crop-dialog.tsx` now has a primary title bar, dark crop area with grid,
  rotate left/right + zoom (rotation-aware export; new `shape` prop, avatars stay round). Shapes as in the
  app: event photo **1:1** (was 16:9), organizer 1:1, venue 16:9.
- **Landmark → "City"** (same column `venue_landmark`); the map pin now fills the town/city.
- **Venue photo — REMOVED (Jamal, 2026-11-02).** The auto photo needed Google Places photos, which need a
  billing account (card) on the key's Google project — not available. Removed: the Venue Image field and the
  auto-fetch in the wizard, `GET /client/venue-photo`, `services/venuePhoto.service.js`. The `venue_image`
  column stays (old events keep their photo; the wizard still re-sends the loaded value on edit). Same removal in
  the V1 app's Create Event (Venue Image section). Backend change → needs a V2 backend push.
- **Guests module: spacing tightened** (all guest pages: page gaps, card padding, 20px title, table rows).
- **Add Guest = the app's form** (`guests/_components/guest-form.tsx`): Full Name * (kept whole as first_name),
  Mobile Number * (country code + per-country check), Group * ("Create a group first" when none), Email (Optional),
  Note (Optional), "x / y guests used" line, hint "More details … with Edit Guest". Toasts: "Please fill all
  mandatory fields." → mobile check → "Please enter a valid email address.". Edit Guest keeps the full form
  (First Name *, Phone *, rest optional) like the app's Edit. The list's group filter is pre-chosen (?group=).
  Portal only, no backend change.
- **RSVP Edit = the app's Edit Response** (`rsvps/[id]/edit/rsvp-edit.tsx`): Response Status * (Attending / Not
  Attending / Maybe), Number of Guests 1-50 (hidden for Not Attending; sent as 1), Special Requests, Participant Name
  (read-only), Phone Number * (country code + check; sent as dial_code + mobile — the server already accepts it and
  refuses a number another participant has), Internal Note. Meal preference + Reset removed (the app has neither).
  Toasts: "Please select an RSVP response." / "Please enter a valid mobile number.". RSVP list/detail: 20px titles,
  doubled page padding removed.
- **NEW web Participants module** (`/dashboard/participants`, sidebar entry gated by plan menu slug `participants`):
  event picker, "x / y participants" plan line, tabs All / Active (has_joined) / Pending with counts, search, rows
  (photo, name, phone, relation • side, members, status), ⋮ View Details (→ /dashboard/rsvps/:id) / Edit / Change Photo
  (crop 1:1) / Remove. Add Participant → Add from Guest (this event's guests, "Added" when already a participant) or
  Add Manually. Form = the app's (`participants/_components/participant-form.tsx`): Photo, Title *, First Name *,
  Last Name, DOB, Email, Phone *; RSVP: Number of Guests (Add only), Food Preference, Groom/Bride Side *, Relation *;
  Company; Add More Details (address + location pickers, Table Number, Notes, Special Requirements). Toast "Please
  complete all required fields.". Hooks: `hooks/use-event-participants.ts` (existing /client/participants API, no
  backend change). NOT built (not saved on the server in the app either): Block, Show in Participant List.
- **Guests / RSVPs / Participants moved INSIDE the event** (Jamal, 2026-11-02): event view tabs = … Family, Guests,
  RSVPs, Participants, Settings …; each opens its own page `/dashboard/events/:id/{guests,rsvps,participants}` with
  `EventMiniCard` (thumbnail, status, name, date/time, venue, Back to event). Guests page = Jamal's screenshot: title +
  Add Guest + Manage Group, event card, 5 tiles in one row, All Groups / search / Filters / **Import** / Export, status
  tabs, table full width (right rail removed). List code moved to `guests/_components/guests-view.tsx`,
  `rsvps/_components/rsvps-view.tsx`, `participants/_components/participants-view.tsx` (event fixed; event pickers gone).
  Old `/dashboard/{guests,rsvps,participants}` forward to the event page (`?event=`) or My Events. Sidebar entries
  removed; plan gate kept via `EVENT_SECTIONS` in lib/navigation.ts (sectionForPath + event tabs hidden when the plan
  lacks guests / rsvp / participants). Save / Cancel / Back on guest, participant, RSVP and import pages return to the
  event page. Also: Edit Venue map now moves to the saved pin when the event loads; RSVP filters on one row;
  breadcrumb "RSVPs". Portal only.
- **Event view tab "Schedule" renamed "Agenda"** (value `agenda`; old `?tab=schedule` links still open it; Edit Event hub
  Agenda card → `?tab=agenda`). Data note: event 34 agenda rows are dated 2026-10-25/26 while the event is now
  2026-11-25/26 (event dates moved after the agenda was made) — old rows sit outside the event; new ones are refused.
- **Music ≤ 1 minute** (checked in the browser before upload) and < 5 MB.
- **"Always included"** text removed from Default menus.
- **Phone = the app's rules everywhere** (`lib/phone.ts` + `components/common/phone-input.tsx`, libphonenumber-js
  added): all countries (India first, searchable), per-country digit limit, mobile-number check, trunk 0 dropped.
  Used in: wizard Contact Number, Guest form, Settings → Profile, Family member, Event Settings contact.
  Event contact numbers stay one string "+91 98…" (as stored before).
- Type-check passes; not seen in a browser; nothing committed.
- **Fit view, round 2 (laptop ~1366 px):** smaller header + stepper; Basic = 3 columns on xl (text | hosts +
  status | 230px photo, size note folded into the hint); Venue = map | 2-column fields; Organizer = 2×2 fields |
  220px photo; Splash = Background, then Invitation Menu | Animation + Music; menu rows py-2; Review 3 per row;
  dashboard layout padding pt-4/pb-4 (all pages).

## 7n. Venue search finds the place NEAR you (Jamal, 2026-11-03, portal only, no backend change)

- Bug: searching "JK Mahal" pinned the one in Chennai, not the one nearby. The search sent only the text (Google
  geocoder / OpenStreetMap, no location) → the best-known match won; the map also opens on Chennai.
- `venue-map-picker.tsx`: every search is biased to the person's location (asked once on the first search;
  quietly read on load when already allowed; also set by Use My Current Location), else to the map's centre.
  Order: Google Places (New) text search (50 km bias, gives the venue name) → Google geocoder (bounds) →
  OpenStreetMap (viewbox around you first, then anywhere). Without Places it also searches "<text>, <your town>"
  (town read from your location) — OSM only knows the Chennai JK Mahal, so the bare name alone can't find a
  nearby one. Results sorted nearest first; several → a pick list
  with name, address, distance; one → pinned straight away. With location already allowed and no pin, the map
  opens on you instead of Chennai.
- Type-check + lint pass; not seen in a browser; nothing committed.

## 7o. Review step + breadcrumb + V2 APK (Jamal, 2026-11-03)

- **Review → Event Type:** "Home Template" shows the template's name, and the card draws the chosen home
  template (`HomeScreenPreview` sm: image, colours, names, date, the menus that are on).
- **Review → App Menus:** under "Menus on N", every menu that is on, numbered, in the app's order (2 columns).
- **Breadcrumb:** an event id in the path (`/events/36/…`, `/messages/notification-templates/36`) shows the
  event's NAME (`useClientEvent`, same cached query as the pages); the id shows only until it loads.
- **V2 app → V2 backend** (open item 2 done): `AppConfig` default + `.env.prod` =
  `https://event-management-admin-backend-v2.onrender.com/api/v1`.
- **V2 APK:** release arm64 → `Documents\EventInvite_Mobile_Build\V2\20261103_Event_Invite_V2.apk` (51.2 MB, V2 backend).
- **Every participant is also a guest** (same change as V1, files copied): `clientGuest.ensureEventGuest` used by
  `guestRegistration.join` + `clientParticipant.createParticipant` — the event's guest with that mobile is linked
  (host's name kept), else one is created under the name given. Max Guests full → join / Add Participant REFUSED
  (Jamal's choice). No DB change; old participants not back-filled. Needs a V2 backend push.

## 8. Open items

1. ~~Live `event_v2` missing 4 `website_clients` columns~~ — fixed (OTP login works on live, 2026-10-31).
   **V1's live DB still has the gap** — run `apply-client-personal-address.js --prod --apply` in the V1
   folder before V1's next deploy.
2. **Mobile app → V2 backend.** `AppConfig` still defaults to the V1 Render address
   (`event-management-admin-backend.onrender.com`). Switch it to the V2 backend, then build.
3. **OTP delivery for V2.** `OTP_ACCEPT_ANY=true` means anyone who knows a registered mobile
   number can sign in. Needs `MSG91_*` set on the V2 Render service, then switch it to `false`.
4. **Render free plan sleeps.** First request after a quiet spell takes ~30 s.
5. **Client login end-to-end in a browser** (Public Website → Mobile/Email tab → Client Portal)
   with the V2 settings above.
6. **Google redirect URI** for the V2 backend (if V2 keeps Google login).
7. **Home Screen Templates → mobile app** wiring.
8. **Re-run the fixed Home Screen seeder on live** (first run skipped every template):
   `NODE_PATH=D:/Jamal/Event_Management_Admin_Backend/node_modules node src/database/seeders/home-screen-templates.seeder.js --prod --apply`
9. **Venue map key:** set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` on Vercel (V2 portal) to the new web key
   "Web Maps (Client Portal)" (Maps JavaScript API; Places API (New) + Geocoding API optional) and
   replace the app key in local `.env.local`.
10. V2 folders have **no `node_modules`**. To run scripts there before `npm install`:
   `NODE_PATH=D:/Jamal/Event_Management_Admin_Backend/node_modules`. V2's backend also uses
   port 5001, same as V1 — stop V1 before running V2 locally.

---

## 9. Working rules for this repo

- Commit messages: the message only, no Co-Authored-By line.
- Production order for any migration: run the tool with `--prod --apply` **before** pushing the backend.
- Don't start dev servers or delete `.next` while they run.
- Don't change `EVENT_QR_SECRET`.

## 7p. Guest limit full → waiting list (Jamal, 2026-11-03) - DB CHANGE
- Same as V1 session.md "Guest limit full → WAITING LIST": QR joiner waits on `event_participant_waitlist`,
  host gets in-app + push "N participants are waiting … please upgrade your plan", a 5-minute job lets them in
  oldest first when there is room; app shows `WaitingListScreen`. Organizer Add Participant still refused when full.
- ORDER: `node src/database/tools/apply-participant-waitlist.js --prod --apply` (V2 DB) BEFORE pushing the V2 backend.

## Guest status: only RSVP Yes = Confirmed (Jamal, 2026-11-03) - backend only, no DB change
- `clientGuest.statusSql` for a guest who JOINED: RSVP Yes (or accepted) -> Confirmed; No -> Declined; Maybe or
  not answered yet -> Pending (was: anything but No/Maybe -> Confirmed). Event with RSVP OFF (join writes
  rsvp_status invited + no answer, nobody is asked) -> joined = Confirmed. Not joined: Added / Invited / Pending
  unchanged. Guest list + stats queries run locally. Push backend (V1 + V2).
- **Waiting list table APPLIED (2026-11-03):** V1 local + V1 live (event_) + V2 live (event_v2). Local end-to-end test passed (full -> waiting #1 + host notice; re-join keeps place; room -> job admits, participant + guest made, Welcome sent; test rows removed). Next: push backend.
- **Event list: Duplicate → Add Guest (Jamal, 2026-11-03):** each event card's Duplicate button is now **Add Guest** → `/dashboard/guests/add?event=<id>` (Add Guest for that event, guest-limit gate as usual). Portal only.
- **Event Details hero compact (Jamal, 2026-11-03):** landscape invitation 230×130 on the left; status badge + #EVT code on one line, name 20px, fact chips (date/time, venue + CITY, category) one line each with full text on hover (was a square 206×200 tile and three tall boxes with the full address). Portal only.

## 7q. V2 app = its own Android app (Jamal, 2026-11-03)
- applicationId com.eventinvite.app -> **com.eventinvite.app.v2** (namespace / Kotlin package unchanged), launcher
  name **Event Invite V2** -> installs NEXT TO V1. FileProvider authority already ${applicationId}-based.
- google-services.json: a 2nd client for com.eventinvite.app.v2 COPIED from V1's (same Firebase app id) so the build
  passes. TODO: register com.eventinvite.app.v2 in Firebase (project eventinvite-61656) + add release SHA-1, put the
  new google-services.json here and update lib/firebase_options.dart android appId — until then V2 push may fail.
  iOS bundle id unchanged.
- Portal Edit Event hub: still NO page for **Wed Wishes, Live Streaming, Social Links** (app has them).

## 7r. Wed Wishes, Live Streaming, Social Links in the portal — like V1 app (Jamal, 2026-11-03) - portal only
- New tabs on the event page (+ Edit Event hub cards now link to them): **Wed Wishes** (`wishes-panel.tsx`),
  **Live Streaming** (`live-panel.tsx`), **Social Links** (`social-links-panel.tsx`); hooks `use-event-engagement.ts`.
  Same endpoints as the app (/client/events/:id/wishes, wish-settings, wish-filter, /client/wishes/:id[/block];
  live-stream-types[/reorder], live-streams[/cover], /client/live-streams/:id; social-links[/reorder|/icon]).
- Wed Wishes: tiles Total / Visible / Hidden / Blocked participants / Flagged (click = filter), All/Visible/Hidden,
  search, cards (avatar, audience, Organizer Post, Hidden/Blocked/Flagged pills, text, image/video, likes), ⋮ Hide /
  Hide all from participant / Show / Mark as Reviewed / Message participant / Block-Unblock / Edit / Delete, New Post
  (name, Wish To, message, photo/video), Settings (6 switches + Content Filter words, auto-hide, notify).
- Live Streaming: Show in Event App, tiles Total / Live Enabled / Disabled, search + category filter, streams grouped
  by category (cover, platform badge, date, time, Watch, enable switch, edit, delete), Add Category dialog (add,
  rename, delete with stream count, move up/down), Add/Edit Live Stream (cover upload 2MB, category, platform, title,
  link, date within event, time, description, enabled).
- Social Links: Show in Event App, presets Instagram/Facebook/X/YouTube (Not added yet / remove link) + custom links
  (icon upload 1MB), per-link show switch, move up/down, add/edit (Open in External App, Show in Event App).
- tsc + eslint clean; backend list responses checked (fields match). Not yet clicked through in a browser.
- V2 APK with new package: Documents\EventInvite_Mobile_Build\V2\20261103_Event_Invite_V2_pkg.apk (51.2 MB).

## 7s. Portal Agenda rebuilt to match the V1 app exactly (Jamal, 2026-11-03: "like the other modules, nothing special")
- `agenda-panel.tsx` rewritten (used by the event's Agenda tab AND the sidebar Agenda page): + Add, pills All + one per
  event day (d MMM), numbered cards (primary circle, title, "date, time", edit, delete). REMOVED the "Show in Event App"
  switch (the app removed it 2026-10-13) and the extra Date & Time box on the Agenda tab.
- Card tap -> Agenda Details (date, time, location, description, Gallery images; Edit / Delete; Actions: Duplicate
  Agenda, Move to Another Day = Day 1..n, multi-day keeps its length).
- Add / Edit ("Add" / "Edit"): Agenda Title * 100, Description 200, Date = an event day (Start/End Date only when
  editing a multi-day item), Start / End Time, "Ends after midnight", Location (Main Hall), Agenda Image up to 10
  (2MB, /agenda/media). Same checks + "Session Time Overlap" / "Possible Duplicate Session" (Create Anyway / Change
  Time / Cancel). Add ends on "Agenda Added Successfully!" (Add Another / Back to Agenda List).
- Hooks: useDuplicateAgendaItem, uploadAgendaImage; useSaveAgendaItem takes `done` toast. tsc + eslint clean.

## 7t. Portal modules made the SAME as the V1 app (Jamal, 2026-11-03) - portal only, no backend change
Jamal: "just like the app, nothing special". Module by module:
- **Live Streaming**: removed the extra "Show in Event App" switch. Added Live Stream Details (cover + LIVE, title,
  category, platform, date, time, link + copy, description, Watch Live, Edit / Share / Disable-Enable) and Share Live
  Stream (QR code, Copy Link, WhatsApp, Email, Share QR Code = PNG download). Categories list shows each cover.
- **Social Links**: removed the "Show in Event App" switch and the per-row Show switch (the app has it only in the form);
  a hidden link is marked "Hidden". Added Social Link Details (URL + copy, description, Display Order, Open in External
  App, Show in App, Created On, Last Updated, Edit / Delete).
- **Family**: removed "Show in Event App"; Family Settings moved behind the ⚙ icon; header "Manage family members for
  your event"; ⋮ = Edit / Change Photo (straight to the picker) / Delete; order by DRAGGING a card (arrows removed);
  Family Details (Relation, Side, Phone, Email, Date of Birth, Added On, Notes, Edit / Delete); "Family Member Added /
  Updated Successfully!" (Add Another / Back to Family List).
- **Gallery** (rebuilt): Gallery Categories (search, list / cards switch, cover + name + item count, ⋮ Edit / Delete,
  none on Gallery; Add Category: Name *, Description, Cover Image, Display Order; result page) → a category's media
  (back, name + count, grid / list; tap = View Full Screen, Edit Media [Show in Event App; video Title, Description,
  Change Cover], Move to Another Category, Reorder Media [drag + Save Order], Select, Download, Remove from Gallery;
  select mode: Cancel · N items selected · Select All · Remove). Upload Media (several, Crop for photos = frame starts
  around the whole photo, "Modified" mark, plan counts checked first, one by one) and Upload Short (≤ 1 min / 10 MB
  checked in the browser, Remove Audio, background music file + start second, cover, album, Title *, Description →
  POST /gallery/shorts; "Upload Successful": View Gallery / Upload More). REMOVED the "Plan limits" card and captions.
  Not possible in a browser without a backend change: TRIMMING a longer video to 1 minute (the app cuts it on the phone).
- **RSVP Settings**: removed "Enable RSVP" (always on, sent as true); added "Allow Food Preference"; switches renamed and
  ordered as the app (Allow Number of Guests, Allow Food Preference, Allow to Specify the Relationship, Allow Special
  Requests); Response Options + Response Deadline kept (the app has them); Save + Preview (the guest form as set).
- **Participants Settings**: Attendance Status removed (server forces it off); Mobile and Email added.
- **Contact Person** (was "Organizer Contact"): Full Name *, Designation / Role *, Mobile *, WhatsApp (+ Same as
  mobile number), Email *, Address / Base Location, Preferred Contact Time * (from / to), Languages (12, as the app),
  About * (300). Sent as the app does (designation, whatsapp, time_from, time_to, languages, about).
- Hooks: types updated (allow_food_preference, participant mobile/email, contact fields, gallery item title /
  description / is_short, category sort_order/position); new useReplaceGalleryCover, useUploadShort; family save
  takes a partial body + `done` toast.
- tsc clean; eslint: no new warnings (6 old ones in event-detail.tsx). Not yet clicked through in a browser.

## Upload Short TRIM (web) + full browser test (Jamal, 2026-11-03)
- Backend (V1 + V2, same files): `utils/videoProcess.trimVideo(buffer, start, end)` (ffmpeg, re-encode H.264/AAC MP4,
  throws on failure); `clientGallery.uploadItem` cuts a short first when `trim_start`/`trim_end` are sent (≤ 60 s kept),
  then every check sees the cut clip; shorts upload limit raised to MAX_SHORT_SOURCE_BYTES = 50 MB (the cut must still
  fit 10 MB). Local test: 90 s portrait → 30 s in ~2 s, still portrait. No DB change. Needs a backend push.
- V2 portal Upload Short: trim bar (two handles, ≤ 1 min, preview loops the kept part), landscape refused (server rule),
  sources up to 50 MB; `useUploadShort` sends trim_start / trim_end. Needs a portal push.
- Full live browser test of the V2 portal (test client #53 qa.portal@eventinvite-test.com, Basic): every module form
  filled → saved, real uploads (photos + crop, short with music), wishes content filter, Create Event 9 steps. All pass,
  0 page errors; saved values checked via the API. Screenshots: Documents\EventInvite_Portal_Test\2026-11-03.
  Tool: V2 backend src/database/tools/create-test-client.js.

## 7u. Agenda = Jamal's web design (2026-11-04) - portal only
- `agenda-panel.tsx` rebuilt to the mockup ONLY: Event Agenda + Export Agenda (CSV) + View Agenda (Guest); day cards
  ("Mon, 10 Nov 2026 · N Sessions") + Add Date (another event day); the day: Total Sessions / Total Overlap Groups,
  timeline (time · dot · card with Edit / Delete), overlapping sessions wrapped in a purple "Overlap Sessions (n)" box;
  right: Add / Edit Agenda Session (Date, Start, End, Title 100, Description 200 = DB column; Clear / Save Session).
  Location / images / details / duplicate / move / overlap popup / success page not in the design → not shown
  (an item's location and images are kept as they are). Checked in a browser (local portal + live V2 data).

## 7v. Family = Jamal's web design (2026-11-04) - DB CHANGE (V2 only)
- Portal `family-panel.tsx` rebuilt to the mockup: "Event Family"; Family Overview tiles (Total, Bride Side, Groom Side,
  Visible Groups = sides with a visible member); tabs All Members / Bride Side / Groom Side / Close Family (relation is
  father, mother, brother, sister, son, daughter, husband, wife, grandparent) / Hidden; search; Sort by Display Order / Name /
  Relationship / Recently Added; collapsible "Bride Side Family (n)" / "Groom Side Family (n)" cards; row = photo, name
  (+ "Key" badge), relation, side pill, "#n Display Order" (place WITHIN the side), Visible / Hidden, app note, Edit / Delete;
  10 per page. Right: Add / Edit Family Member — Family Side *, Member Name * (one field -> `name`), Relationship *, Photo
  (drag-drop, PNG/JPG/WEBP ≤ 5 MB, square crop 500 px), Mobile (optional), Display Order * (moves the member to that place
  in its side via /reorder), Notes, Visibility * (Show in App / Hide from App), Highlight as Key Family Member; Clear /
  Save. Family Settings kept behind a ⚙ button. Removed (not in the design): drag reorder, Family Details, Change Photo
  menu, success page, Title / Last Name / Email / DOB fields (an edited member keeps them).
- Backend (V2): `event_family_members.is_visible` (default 1) + `is_key` (default 0). Model, `clientFamily.service`
  (owner gets both; participant gets is_key, list leaves hidden members out, hidden profile = 404; body accepts both).
  Migration `migrations/sql/20261104-family-visibility.sql`, tool `tools/apply-family-visibility.js`, `initial_setup.sql`.
  LOCAL event_v2 applied; service test 7/7. Portal treats a missing is_visible as visible (safe if the portal ships first).
  The V1 app / V2 app do not show the Key badge yet.
- ORDER: `node src/database/tools/apply-family-visibility.js --prod --apply` (live event_v2) BEFORE pushing the V2 backend;
  then push the portal. tsc + eslint clean; not yet seen in a browser.

## 7w. Module kit + Guests = Jamal's web design (2026-11-04) - DB CHANGE (V2 only)
- Designs: `Downloads\20261103 Wedding Organizer Mobile App UI` (Agenda, Family, Guests 2 + 7 actions, Participants,
  RSVP, Wishes, Gallery). Rule (Jamal): build repeated parts ONCE as shared components and reuse them.
- **Portal module kit** `src/components/module-kit/` (index.ts): tones (one colour table for pills / icons),
  layout (ModuleHeader, OverviewCard + StatTile, ListCard [collapsible], FormPanel, SplitLayout, Notice), filters
  (CountTabs, SearchBox, SortSelect, Toolbar, Pager + pageWindow), people (PersonAvatar, PersonCell, PersonSummary,
  StatusPill, StarBadge), form (FormField, FieldNote, SideNote, CharCount, NumberStepper, ChoiceRadio, SwitchField,
  CheckChoices, PhotoDropzone = drag-drop + square crop + upload), sheets (ActionSheet = slide-in panel, DetailSection /
  DetailRow, InfoGrid, DeleteSheet = cannot-be-undone + affected data + reason + "I understand", RowActions = ⋯ menu).
  Family and Agenda now use it (same look as 7u / 7v).
- **Guests page** (`guests/_components/guests-view.tsx`, `guest-fields.tsx`, `guest-actions.tsx`): Event Guests +
  Guest Overview (Total, Invited = not "added", Confirmed, Pending RSVP = invited + pending), tabs All / Bride Side /
  Groom Side / VIP / Hidden, search (name, email, mobile, company, relationship), Sort (name A–Z / Z–A, recent, oldest,
  invite count), Guest List table (photo + VIP, relationship, side, invite count, RSVP status, app visibility, ⋯), 10 per
  page. Right: Add Guest (Guest Type, Name, Mobile, Email, Relationship, Family Side, Invite Count stepper, Address ->
  address_line1, Notes, Photo, RSVP Required, Visibility, Mark as VIP, Send Invitation via WhatsApp / Email / In-App).
  Save with channels = invite (invited_at + channels) and a toast button opens WhatsApp (wa.me) / Email (mailto) with the
  message. ⋯ panels: View Guest, Edit Guest, Send Invitation (channels, message template presets, Send Now; Schedule
  Later shown "soon"), View RSVP Response (the participant's answer; "No response yet" when not joined), Mark as VIP
  (enable, category, label, where to highlight), Hide Guest (reason + internal note; Show Guest = straight back), Delete
  Guest (DeleteSheet; the reason is not stored). Header keeps Import / Export / Manage Groups. Removed: group filter,
  bulk checkboxes. The name is saved whole in first_name (last_name cleared), like the app's form.
- **Backend (V2):** `guests` + guest_type, side, invite_count, rsvp_required, is_visible, hidden_reason, hidden_note,
  is_vip, vip_category, vip_label, vip_highlight (JSON), invite_channels (JSON), invite_message. Migration
  `migrations/sql/20261104-guest-design-fields.sql`, tool `tools/apply-guest-design-fields.js`, model, initial_setup.sql.
  `clientGuest.service`: designFields() on create/update (optional — the app's form keeps defaults), list filters
  side / vip / visibility + sort, stats bride / groom / vip / hidden, getGuestById adds `rsvp`, bulk `invite` keeps
  { channels, message }. `guestRegistration.participantsDirectory`: a participant whose guest is hidden is left out for
  OTHER participants (host and the person still see it); VIP with "app directory" ticked carries is_vip + vip_label.
  LOCAL event_v2 applied; tests 19/19 (create, VIP, hide/show, tabs, search, stats, invite, rsvp, directory).
- tsc + eslint clean on everything changed; not seen in a browser (no dev server per repo rule).
- ORDER: `apply-family-visibility.js --prod --apply` + `apply-guest-design-fields.js --prod --apply` (live event_v2)
  BEFORE pushing the V2 backend; then push the portal.
- Next (same kit): Participants, RSVP, Wishes, Gallery.
- **APPLIED to live event_v2 (2026-11-04):** apply-family-visibility + apply-guest-design-fields (`--prod --apply`, re-check
  shows all columns). Run from the V2 backend folder with `$env:NODE_PATH = "D:/Jamal/Event_Management_Admin_Backend/node_modules"`
  (PowerShell) — V2 has no node_modules. Next: push V2 backend, then the portal.

## 7x. Agenda fixes (Jamal, 2026-11-04) - portal only
- Session card = the mockup's speech-bubble card (rounded, small pointer towards the timeline dot).
- Date field opens a CALENDAR (kit `DatePickerField` / `DayCalendar` in module-kit/date-field.tsx; only the event's days
  can be picked). "+ Add Date" opens the same calendar with the event days that have no session yet.
- "Unable to add another session on the same date": the backend allows it (tested: 3 sessions, same date, 2 at the same
  time). The page now has "+ Add Session" on the day header, keeps the form on that day after a save (empty, title
  focused), and a day card click moves an unsaved new session to that day. Live V2 portal still has the OLD agenda
  until the portal is pushed.

## 7y. Guests / RSVPs / Participants inside the event page + RSVP & Participants = web design (2026-11-04) - DB CHANGE (V2)
- **Event page tabs:** Guests, RSVPs and Participants now open IN the event page like Family (`?tab=guests|rsvps|participants`,
  kept in the URL). `/dashboard/events/:id/{guests,rsvps,participants}` forward there, so every old link / Save / Back still
  works. Tab bar = `events/[id]/_components/scroll-tabs.tsx`: one row, scrolls sideways (wheel / swipe / ‹ › buttons).
  The three views no longer draw their own event card.
- **RSVP Responses** (`rsvps/_components/rsvps-view.tsx`, `rsvp-actions.tsx`, hook `use-rsvp-board.ts`): 6 tiles (Total
  Invited, Responded + rate, Confirmed / Pending / Declined / Maybe % of invited), Export (CSV of the current filters), Send
  Reminder (pending guests, one WhatsApp tap each), "Show guests not invited yet", search + Status / Side / Source / Sort /
  Date range, tabs All / Confirmed / Pending / Declined / Bride / Groom / VIP / Hidden, Response List (guest + VIP,
  relationship, side, invite count, RSVP status, response type, attending count, meal, response date, source + app
  visibility, View or Send Reminder + ⋯), right rail: RSVP Summary donut, Invitation Channel Breakdown, Recent Activity,
  Guest Response Notes. ⋯ = View Response (RSVP Details / Guest Information / Activity), View Guest + Edit Guest (the Guests
  panels), Send Reminder, Mark as Confirmed / Pending / Declined (= Update RSVP Status: decline reason, attendance count, meal,
  response note, admin note -> guest note), Add Note (type, priority, previous notes; guest_notes), Hide Response, Delete.
  Backend: `clientRsvpBoard.service/controller`, `GET /client/events/:id/rsvp-board`, `PUT /client/rsvp-board/:guestId`,
  `PUT .../:guestId/hide`, `DELETE .../:guestId`. One row per event GUEST; the answer = their participant row when joined
  (written there), else the organizer's answer on the guest (new `guests.rsvp_*` columns). Delete Response clears the
  answer only (guest + participant kept). Test 17/17.
- **Participants** (`participants/_components/participants-view.tsx`, `participant-actions.tsx`): tiles Total / Active /
  Pending Access / Blocked, tabs All / Active / Pending / Blocked / Hidden, search, Sort (joined, name), list (photo,
  relationship, linked guest = VIP or side, mobile, invite / RSVP / access status, joined on, ⋯). Panels: View, Edit (name,
  mobile, email, relationship, side, RSVP status, access Active/Blocked, notes, Visible in App, Send Invitation -> WhatsApp),
  Send Invitation, View RSVP Response, Block (reason, note, hide too) / Unblock, Hide (reason, note) / Show, Delete. Add
  Participant (from Guest / Manually) unchanged.
  Backend: `event_participants` + is_blocked, block_reason, block_note, blocked_at, is_hidden, hide_reason, hide_note
  (`migrations/sql/20261104-participant-access.sql`, `tools/apply-participant-access.js`). BLOCKED = every participant access
  check now has `is_blocked: false` (agenda, family, gallery, wishes, live, social, splash, contact chat, nearby, my events,
  event details, my RSVP, participant settings, check-in, QR profile scan) + join refuses ("You cannot join this event");
  blocked / hidden rows are left out of the app's participant directory for others. List: `access` (active/pending/blocked/
  hidden; with `access` sent and none matching, hidden rows are left out), `sort`, search on relationship; stats.access.
  Test 13/13.
- LOCAL event_v2 applied (guest rsvp_* + participant access columns). tsc + eslint clean; not seen in a browser.
- **PRODUCTION ORDER:** `apply-guest-design-fields.js --prod --apply` (adds the 8 rsvp_* columns) +
  `apply-participant-access.js --prod --apply` BEFORE pushing the V2 backend; then push the portal.
- **APPLIED to live event_v2 (2026-11-04):** apply-guest-design-fields (8 rsvp_* columns) + apply-participant-access
  (7 columns); re-check shows nothing missing. Next: push V2 backend, then the portal.

## 7z. Gallery = web design, PHASE 1 (2026-11-04) - DB CHANGE (V2)
- Designs: `Web Gallery Flow` (00 overview, 00 default view, 01 Create Folder, 02 Upload Media, 03 Edit Video/Shorts,
  04 Move files, 05 Create Album). Phase 1 built; Phase 2 = Create Album (slideshow: new table + builder + preview + app
  playback); Phase 3 = Edit Video / Shorts editor (animated text overlays need server-side ffmpeg rendering).
- Portal `events/[id]/_components/gallery-board.tsx` (event page Gallery tab now uses it; the old `gallery-panel.tsx` only
  lends MediaViewer, EditMediaDialog, ShortDialog): Gallery Overview (Create Folder / Upload Media / Create Album = "coming
  next" toast; tiles Images / Videos / Shorts / Folders / Albums + Storage Usage bar; drop zone -> upload page; folder cards
  with stacked cover, Default badge, counts per kind, ⋮ Open / Upload Here / Edit / Delete; grid / list; Recent Uploads
  strip + View All). Folder view (breadcrumb, All / Images / Videos / Shorts, search, sort, grid / list, Multi-select +
  Move / Copy to Folder / Download / Delete, per-file ⋯, Details panel: preview, details, Edit / Download / Move / View /
  Delete, 24 per page). Upload Media (folder select, Images / Videos / Shorts, queue with status / retry / remove /
  clear completed, one-by-one upload; Shorts = the existing trim + music Upload Short). Create / Edit Folder (name,
  description, cover via the gallery cover upload, Folder Type, Sort Order, Notes). Move / Copy Files sheet.
  Kit: PhotoDropzone takes an `uploader`.
- Backend: `event_gallery_categories.folder_type` (images|videos|shorts|mixed, default mixed) + `notes`
  (`migrations/sql/20261104-gallery-folders.sql`, `tools/apply-gallery-folders.js`). Folder list returns `counts`
  {images, videos, shorts}; uploads into a typed folder of another kind are refused; `POST /client/events/:id/gallery/bulk`
  {ids, action: move|copy|delete, category_id} (wrong-kind files skipped; copy = same stored file, counted against the
  plan's photo / video limits); deleting a copy keeps the file while another row uses it. LOCAL applied; test 7/7.
- **APPLIED to live event_v2 (2026-11-04):** apply-gallery-folders (folder_type + notes); re-check shows both there.
- **Create Album (Phase 2) built (2026-11-04):** table `event_gallery_albums` (name, description, cover, intro on/text/
  animation fade_slide_up|fade|zoom|typewriter, intro_seconds, music on/url/name, slide_seconds, slides JSON
  [{item_id, seconds}], show_in_app, sort_order) — `migrations/sql/20261104-gallery-albums.sql`,
  `tools/apply-gallery-albums.js`, model `EventGalleryAlbum`, `clientGalleryAlbum.service/controller`:
  `GET/POST /client/events/:id/gallery/albums`, `PUT/DELETE /client/gallery/albums/:albumId`,
  `POST /client/events/:id/gallery/albums/music` (MP3 ≤ 10 MB). Slides must be the event's gallery photos; a deleted photo
  drops out on read; participants (not blocked) read albums shown in the app. Portal: `album-builder.tsx` (Album Slides
  with Add Images picker / drag reorder / per-slide seconds / use as cover / remove; Album Settings; live Slideshow
  Preview with timeline + Album Summary; Preview Album full screen) + album cards (Play / Edit / Delete) on the Overview;
  hook `use-gallery-albums.ts`. The mobile app does not show albums yet.
- **Tested (2026-11-04):** backend service test 30/30 on LOCAL (folders, real image + ffmpeg video uploads, type refusal,
  counts, hide, bulk move / copy / delete with shared file, albums create / validate / music / participant read / delete,
  folder delete moves files to Gallery). Browser test (local backend :5001 + portal :3005, event #68, client 23) 12/12,
  0 console errors: sign in, Overview, Create Folder, Upload 2 photos, folder view + details, multi-select Move, Create
  Album with preview, save, play. Test data removed; servers stopped.
- Albums table on LOCAL and **live event_v2 (applied 2026-11-04, re-check OK)**.
