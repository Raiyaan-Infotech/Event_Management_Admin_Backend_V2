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
