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

## 8a. Event WORKSPACE — View Event opens in its own tab (Jamal's mockup, 2026-11-04) - portal only
- New route `/event/:id?tab=…` (`src/app/event/[id]/layout.tsx` + `page.tsx`): same auth / plan / theme gates as the
  dashboard; its own sidebar = the event's sections (`components/layout/EventWorkspace/EventWorkspace.tsx` → EventSidebar:
  Dashboard, Event Information, Agenda, Venue, Gallery, Family, Wed Wishes, Live Streaming, Social Links, Guests, RSVPs,
  Participants, Settings, Messages, Activity Log — plan-gated as before; Edit Event + Back to My Events at the bottom); the
  top bar (`Header left=`) shows the event (thumbnail, name + status, date, venue + city, category) and no New Event.
- Sections list + icons + status moved to `events/[id]/_components/event-tabs.ts`. `EventDetail` reads the section from
  `?tab=` (router.replace on change) and, with `workspace`, draws no header card / tab bar.
- **Overview renamed "Dashboard"** and redesigned to the mockup's 6 cards: Basic Information, Event Status, Quick Links,
  Date & Time, RSVP Summary (donut + Accepted / Pending / Declined), Region (Venue, Location, City, Map link — the event
  has no State / Country fields). The old Design card is gone from it.
- View Event (My Events) and the Dashboard home's event links open `/event/:id` in a NEW TAB. The old
  `/dashboard/events/:id` now forwards to `/event/:id` keeping `?tab=`, so every other link / Save / Back still works.
- tsc clean; eslint: no new warnings. Not yet seen in a browser.

## 8b. Every event page stays INSIDE the event workspace (Jamal, 2026-11-05) - portal only
- Bug: in View Event (`/event/:id`) → Guests → Manage Groups (also Add Guest, Import, RSVP details / edit, Add / Edit
  Participant, Send Message, Edit Event) opened the normal dashboard (`/dashboard/...`) and left the event tab.
- Copies under the workspace: `/event/:id/{edit, guests/add, guests/import, guests/groups[/add|/:groupId],
  guests/:guestId[/profile], rsvps/:rsvpId[/edit], participants/add, participants/:id/edit, messages/send}` — each
  file just reuses the dashboard page (`src/app/event/[id]/**/page.tsx`).
- `src/lib/event-workspace.ts` → `useEventHref()`: inside `/event/:id` it turns a `/dashboard/...` link into its
  `/event/:id/...` copy (+ `event=<id>`); the lists (`/dashboard/guests|rsvps|participants|messages`) become
  `?tab=`. Outside the workspace links are unchanged. Billing, My Events, Create Event, Templates stay in the dashboard.
  Shared pages call `wsHref(...)` on every such Link / router.push.
- Workspace sidebar: links always go to `/event/:id?tab=…` and a sub-page lights up its section (Guests for Manage
  Groups). The workspace now has the plan section gate too (`PlanSectionGate path=`).
- tsc clean; eslint no new errors. Not yet clicked through in a browser.
- Workspace sidebar footer REMOVED (Jamal, 2026-11-05): no "Edit Event" / "Back to My Events" at the bottom. Leave the
  event with **Exit Event** (top bar); Edit Event stays reachable from the event pages (Dashboard / Event Information).
- **Manage Groups rows (Jamal, 2026-11-05):** the ⋮ menu is gone; **Edit** and **Delete** are buttons on the row (same
  style as the Guests table). Dropped with the menu: "View members" (the Guests page no longer filters by group) and
  "Send message to group" (Messages → Send still does it).
- **Menu Settings in the workspace sidebar (Jamal, 2026-11-05):** "Settings" renamed **Menu Settings**; under it (chevron,
  open on its own page) RSVP Settings · Participants Settings · Family Settings · Wish Settings · Contact Person, each
  `?tab=settings&set=<key>`; Menu Settings alone shows all of them. RSVP / Participants follow the plan. Family and Wish
  Settings were dialogs inside their modules — now `SettingsShell` (module-ui.tsx) shows them as a dialog (⚙ still works)
  or inline (`FamilySettingsCard`, `WishSettingsCard`). List: `SETTINGS_PAGES` in event-tabs.ts. **Guests have no
  settings** (nothing on the server either) — asked Jamal what they should hold.
- **Edit / Delete out of the ⋯ menu on RSVPs + Participants too (Jamal, 2026-11-05):** each row has Edit + Delete buttons
  (RSVP: Edit Guest / Delete Response; Participants: Edit / Delete Participant), ⋯ keeps the rest. Guests table already
  had this (pushed in 897a46d).
- RSVP rows: the View / Send Reminder button removed from the row (Jamal, 2026-11-05) — both are in ⋯ (View Response,
  Send Reminder). Row = Edit · Delete · ⋯.
- **Loader covers the main content only (Jamal, 2026-11-05):** `PageLoader` now fills `#main-content` (the content box
  of the dashboard layout and of the event workspace layout, `relative`), spinner sticky in view; sidebar + top bar stay
  usable. GlobalLoader (queries / saves) portals into `#main-content` when the page has one, else full screen.
  `fullScreen` only for `app/dashboard/loading.tsx` (before the layout exists). New `app/event/[id]/loading.tsx` so a
  page change inside the workspace (Add Guest, Manage Groups…) also covers the content only. Overlay z-40 = under
  dialogs / slide-in sheets.
- **REVERSED (Jamal, 2026-11-05): Edit + Delete live ONLY in the ⋯ menu** on every list — Guests, RSVPs, Participants
  and Manage Groups (⋯ = Edit Group / Send Message to Group / Delete Group). No separate Edit / Delete row buttons.
- **RSVP Response List fits the card (Jamal, 2026-11-05):** `min-w-[1080px]` removed; body 11.5px, headings 10.5px and
  short (Guest, Relation, Side, Invites, RSVP, Response, Attending, Meal, Responded, Source / App — full name on hover),
  pills 10.5px, cells py-1.5 / pr-2, compact ⋯. Horizontal scroll only as a fallback on narrow screens.
- **Workspace sidebar "needs 3 clicks" (Jamal, 2026-11-05) — cause:** opening a section starts its first data load; the
  GlobalLoader then laid a FULL-SCREEN overlay (fixed, z-9999) over the page INCLUDING the sidebar, so clicks during the
  load hit the overlay and did nothing; once the data arrived the next click worked. Fixed by the content-only loader
  above (the overlay now sits inside #main-content; the sidebar is never covered). Slow first loads on Render's free
  plan (~30 s after a quiet spell) made it worse.
- **Gallery photo limit 2 MB → 5 MB (Jamal, 2026-11-05):** `MAX_IMAGE_BYTES` in `services/clientGallery.service.js`
  (the one place; upload route + portal Upload Media + app read it via usage `max_image_bytes`). Old portal
  gallery-panel check updated to 5 MB too. Video stays 5 MB, shorts 10 MB. No DB change — needs a V2 backend push.
  Covers (folder cover) follow the same constant. Wishes / agenda / live images have their OWN limits (unchanged).
- **Create Album: name not in the video (Jamal, 2026-11-05):** the player plays the intro only when Intro Text has
  text; it was empty (the text was typed in Album Name), so the video skipped the intro while the timeline / summary
  still showed "Intro 0:00 – 0:05". Now the intro shows Intro Text, or the **Album Name when Intro Text is empty**
  (preview + saved `intro_text`); Intro Text no longer required; its placeholder says so. Portal only.
- **Album intro text OVER the cover image (Jamal's mockup, 2026-11-05):** the intro was white-pink text on a pink
  gradient; now the cover image fills the frame (slow zoom, dark gradient) with the intro text in white on top.
  No cover → first slide; neither → the old pink card. `PlayerAlbum.cover_image`; preview, Preview Album and Play
  (saved albums carry cover_image). Portal only.
- **Album slideshow: no lag / black gap between cover and the next image (Jamal, 2026-11-05):** the player mounted a
  slide's <img> only when its turn came (download + fade from black). Now every layer (intro/cover + each slide) is
  mounted up front (all images load at once) and the next one cross-fades (700 ms) over the last; the outgoing layer
  keeps its zoom so it does not jump. Controls bar z-10 above the layers. Portal only.

## 8c. Live browser test — Gallery / Album / Upload Short (2026-11-05)
Headless Chromium against the LIVE V2 portal + Render backend, account qa.portal (Basic), event #37 "QA Test Wedding".
Screenshots: `Documents\EventInvite_Portal_Test\2026-11-05_album_live` (+ `_run2`). Test data removed afterwards.
- PASS: Gallery Overview; Create Folder (Images); Upload 3 photos incl. a 3.5 MB one (5 MB limit live); a 5.6 MB photo
  refused; folder view + details; multi-select Move; Create Album (3 slides, Move Up, Use as Cover, intro with EMPTY
  text → album name, MP3 upload, durations); preview intro over the cover (white text); music plays; Preview Album;
  Save; Play saved album; Edit (intro text + remove slide); Delete; no page errors.
- **FAIL → FIXED (backend, not pushed): Upload Short with TRIM always failed on Render** — 400 "This video could not be
  trimmed. ffmpeg timed out": the trim re-encoded the kept part (libx264 veryfast) and Render's free CPU passed the
  60 s ffmpeg limit (local: 2 s). The 11-03 live test never reached "Upload Successful" either. `trimVideo` now COPIES
  an H.264/yuv420p picture (≈1 s, sound re-encoded) and checks the result's length — a video with few key frames
  (copy would start too early) falls back to a re-encode; re-encode = ultrafast, ≤ 1280 px, 170 s limit. Local:
  phone-like 1.1 s → 50.02 s; sparse key frames 3.9 s → 50.02 s; HEVC 2.5 s → 50.02 s; music on the cut 1.2 s.
  The error toast does show (4 s) — easy to miss.
- Expected FAIL: cross-fade between intro and first slide — fix is local only (album-builder.tsx), not pushed.
- Music trim on SHORTS = "Music starts at (seconds)" (works in the form; checked once the trim fix is live).
  ALBUM music has no trim (upload, plays + loops with the slideshow).
- **Re-test after deploy (backend 6d777b8, portal c3195da), 2026-11-05: 25 / 26 PASS** (`..._album_live_run3`).
  Upload Short with trim + music now works on Render: 90 s video, kept 10–60 s → stored 50 s, 2.98 MB, "Upload
  Successful". Cross-fade: all 4 layers loaded before their turn (no gap). The 1 "FAIL" (saved: NOT FOUND) is the test
  script reading the list before the save finished — the next steps (Play / Edit / Delete the saved album) pass.

## 8d. Album intro TEXT STYLE (Jamal, 2026-11-05) - DB CHANGE (V2)
- Create / Edit Album → under Intro Text + Text Animation: **Text Style** — Font (Playfair Display, Great Vibes,
  Dancing Script, Cormorant Garamond, Montserrat, Poppins; Google Fonts, one stylesheet hoisted by the player), Size
  S/M/L/XL, Colour (6 presets + custom picker, hex shown), Alignment left/centre/right, Position top/middle/bottom,
  Bold / Italic / Shadow, Reset style. The preview, Preview Album and Play draw the intro with it.
- Backend: `event_gallery_albums.intro_style` JSON NULL (`migrations/sql/20261105-album-intro-style.sql`,
  `tools/apply-album-intro-style.js`, model, initial_setup.sql). `clientGalleryAlbum.service.introStyle()` cleans the
  body (unknown font/size/align/position → default, colour must be #RRGGBB) and every read returns a full style
  (NULL = defaults: Playfair, #FFFFFF, L, centre, middle, italic, shadow — same look as before).
- LOCAL event_v2 applied. tsc + eslint clean. The mobile app does not show albums yet.
- **ORDER: `node src/database/tools/apply-album-intro-style.js --prod --apply` (live event_v2) BEFORE pushing the V2
  backend** — the model reads the column; without it every album request fails. Then push the portal.

## 8e. RSVP Summary card moved to the event Dashboard (Jamal, 2026-11-06) - portal only
- The RSVP Responses page's "RSVP Summary" card (donut Confirmed / Pending / Declined / Maybe with % of invited,
  Responded in the middle, Total Invited + Responded tiles) now replaces the Dashboard's old 3-slice RSVP Summary
  (which read participant stats). Shared component `rsvps/_components/rsvp-summary.tsx` (reads the rsvp-board stats).
- Removed from the RSVPs page: that row now has 3 cards (Channels, Recent Activity, Notes). tsc clean; not seen in a browser.
- Same day: **Invitation Channel Breakdown, Recent Activity, Guest Response Notes** moved to the Dashboard too
  (`RsvpChannels`, `RsvpRecent`, `RsvpNotes` in rsvp-summary.tsx; Dashboard = 9 cards, 3 per row on xl). A Recent
  Activity line opens the RSVPs section. The RSVPs page no longer has that row at all.
- **Gallery Overview: drag & drop upload box removed (Jamal, 2026-11-06)** (`gallery-board.tsx`). Upload Media (header) and
  a folder's ⋮ Upload Here still upload. Portal only.
- **Loader over a loader on first open (Jamal, 2026-11-06):** opening `/event/:id` showed "Checking your session…"
  (ClientAuthGate) with GlobalLoader's full-screen "Loading..." on top — both reacted to the `/client/me` request.
  GlobalLoader now ignores `['client','me']`; the gate shows the standard `PageLoader fullScreen` ("Loading...").
  Also fixed the old set-state-in-effect lint error in global-loader.tsx. Portal only.
- **Gallery folder Multi-select = Jamal's design (2026-11-06)** (`gallery-board.tsx` FolderView): a click in multi-select
  ticks the file AND opens it in the Details panel (un-ticking the shown file moves the panel to the last ticked one);
  the pink "N items selected" bar is replaced by a **Bulk Actions (n)** dropdown next to Multi-select (Move / Copy to
  Folder, Download, Delete) and **Select All** at the right of "N Media Items"; grid = fixed small cards
  (auto-fill, min 150 px) so one file no longer fills a quarter of the page. Portal only.
- **Loader hidden behind dialogs (Jamal, 2026-11-06):** saving from a dialog / slide-in sheet (Delete Folder, Create
  Folder, every page) showed the content-only loader (z-40) UNDER the dialog (z-50). GlobalLoader now checks for an open
  `[role=dialog|alertdialog][data-state=open]` (Radix Dialog + Sheet, so every ActionSheet too) and then shows the
  FULL-SCREEN loader (z-9999) on top; with no dialog open it stays content-only. Portal only.
- **Upload Media page: back navigation (Jamal, 2026-11-06):** back arrow + breadcrumb "Gallery › <folder> › Upload Media"
  (same as the folder page). Back = where Upload was opened from (that folder, or the Gallery Overview). Portal only.
- **Upload Media: Video Only folder stuck on Images (Jamal, 2026-11-06):** the Images / Videos / Shorts choice was set
  once from the folder the page opened with; changing "Upload to Folder" kept it, so a Video Only folder showed
  "Drag & drop images", the picker offered images only and the folder refused them. Changing the folder now switches
  the choice to the folder's type (mixed folders keep the current one). Portal only.
- **Upload queue: folder-type check in the browser (Jamal, 2026-11-06):** queue a video in a Video folder, switch to an
  Images folder, Upload → the backend refused it. Now changing the folder re-checks the waiting files at once: a file the
  folder does not take shows **"Wrong folder"** + the message (new status `wrong_folder`, no request sent, not counted in
  Upload Media (n) / Retry Failed); switching back to a folder that takes it returns it to "Ready to upload". The upload
  itself checks again before sending. Backend check unchanged (still the safety net). Portal only.
- **After upload → the folder's list (Jamal, 2026-11-06):** when Upload Media (n) finishes with every file uploaded, a
  toast "N files uploaded to <folder>" shows and the page opens that folder's list. Any failed / wrong-folder file keeps
  the Upload page open (queue + Retry). Portal only.

## 8f. Gallery = the design's missing parts (Jamal, 2026-11-06) - backend list fields + portal, NO DB change
Compared with `Web Gallery Flow` 00 / 00 default view / 01 / 02; built what was missing (`gallery-board.tsx`):
- **Overview (00):** Select All + checkbox per folder card (the default folder has none — non-deletable), **Bulk Actions**
  (one folder: Open / Upload Here / Edit; any: Clear Selection, Delete Folders → one confirm, files move to Gallery;
  hook `useDeleteGalleryCategories`), **Filter** by folder type, Sort "Recent Activity" (latest upload in the folder),
  search also matches the description. Drop box stays removed (Jamal's earlier request).
- **Folder view (00 default view):** labelled **Grid View / List View** buttons; **List View (Preview)** under the grid
  (first 3 files + "Switch to List View"); list table + **Uploaded By** column + row icons Rename / Download / Move /
  Delete (+ ⋯). **Details panel:** tabs **Details / Actions / Activity / Metadata**; Details adds copy-file-name,
  **Resolution** (read from the loaded image / video — not stored), **Uploaded By**, icons; Actions = full list incl.
  Show/Hide in Event App + Copy Link; Activity = Uploaded (by, folder, when) + Last updated; Metadata = id, MIME,
  extension, bytes, resolution, aspect, duration, short, title, caption. Bottom buttons Rename / Download / Move / Edit /
  Delete. **Rename** dialog = the item's `title` (the name shown everywhere; stored file keeps its name).
- **Upload Media (02):** queue **Move Up / Move Down** (ticked rows) + drag handle; **Pause** (row + footer — stops after
  the file now uploading; Upload Media carries on); **Preview** (eye) on uploaded rows; **Save as Draft** (queue + folder
  kept in GalleryBoard state while the page is open — files cannot survive a reload); per-VIDEO **Trim** (mm:ss
  popover), **Mute original audio**, **background Music (MP3)**, **Cover** picture. A video with any option goes through
  `POST /gallery/shorts` with `kind=video` (server already trims / mixes / covers; video limits, not a short); a
  too-large video (> 5 MB) can be queued up to 50 MB and must be trimmed (checked in the browser). Status `invalid`
  ("Cannot upload" + reason) replaces `wrong_folder`.
- **Backend (V2):** `clientGallery.service.present()` now also returns `uploaded_by` + `updated_at` (columns exist). No DB
  change — needs a V2 backend push (portal works without it: Uploaded By shows "—").
- tsc + eslint clean; `node --check` OK. Not seen in a browser.
- NOT built: **03 Edit Video / Shorts** editor (text overlays need server-side rendering); upload % progress (the API
  client has no progress events — bar stays animated).

## 8g. Upload % + Edit Video / Shorts (design 03) — BUILT, SWITCHED OFF until a paid server (Jamal, 2026-11-06)
**Upload % (live now, portal only):** `api.upload(path, form, onProgress)` in `lib/api-client.ts` (XMLHttpRequest — fetch
has no upload progress; same base URL / cookie / envelope / ApiError). `useUploadGalleryItem` + `useUploadShort` take
`onProgress`; the Upload Media queue shows "48% • Uploading… (1.2 MB / 3.0 MB)", then "100% • Saving…" /
"Processing on the server…" while the server stores / trims it.

**Edit Video / Shorts — OFF.** Jamal: build it now, switch it on when the backend moves to a paid server; while off
NOTHING of it shows in the portal (no menu item, no "soon"). Off = the route is not mounted and the UI is not rendered.
- Portal: `events/[id]/_components/video-editor.tsx` (design 03: tools Add Text / Trim & Cut / Music & Audio / Volume;
  player with live text preview — select a text → edit / duplicate / delete; Timeline & Clip Trimming = frame strip
  (needs CORS on the media files, else plain), drag handles, Start / End boxes, Reset, max 1:00 for shorts; Music
  (MP3 ≤ 10 MB, waveform, "song starts at", Mute Original Audio, length hint); Volume Controls (video / music %);
  Add Text panel = content 100, Fade / Slide / Zoom / Typewriter, duration, direction, 6 fonts, colour, B / I / U,
  3×3 position, show from–to, Add Another Text; Preview, Save Draft (localStorage per file; the MP3 must be picked
  again), Export with send % then "Rendering…"). Entry: a video's ⋯ → **Edit Video** and Details → Actions → Edit Video,
  both only when `VIDEO_EDITOR_ENABLED` (`src/lib/features.ts`). Hook `useExportVideoEdit`.
- Backend: `POST /client/gallery/:itemId/edit` (multipart `spec` JSON + optional `music` + `title`) — mounted in
  `clientPortal.routes.js` ONLY when `VIDEO_EDITOR_ENABLED=true`. `services/galleryVideoEditor.service.js` (owner check,
  videos only, spec cleaned, reads the stored file from /uploads or its URL) → `utils/videoProcess.renderEdit` (ffmpeg:
  trim, scale ≤ 1280, drawtext per layer with fade / slide / zoom / typewriter expressions, underline box, own sound
  volume / mute + looped music mix + fade-out, bitrate fitted to the 5 MB video / 10 MB short cap, timeout
  VIDEO_EDITOR_TIMEOUT_MS default 10 min) → stored as a NEW file in the same folder via `uploadItem` (plan limits,
  storage, poster; a short stays a short). The original is kept. No DB change.
- Local render test (ffmpeg 6.1, generated 12 s 720p clip): 4 text layers (all animations, underline) + music + volumes
  → 8 s, 1.8 MB in 5 s; muted cut → 0.5 MB in 0.7 s. Frame checked: every layer drawn. Not run on Render.

**TO SWITCH IT ON (paid server):**
1. Add the font files to the backend `assets/fonts/` (list in `assets/fonts/README.md`) — without them the text uses a
   plain fallback font (Render has no Poppins etc.).
2. Render (backend): `VIDEO_EDITOR_ENABLED=true` (optional `VIDEO_EDITOR_TIMEOUT_MS`), redeploy.
3. Vercel (portal): `NEXT_PUBLIC_VIDEO_EDITOR_ENABLED=true`, redeploy (read at build time).
4. Test: export a 30–60 s video with 2 texts + music; check the time it takes and the result on a phone.
Known limits: underline width is estimated from the character count; Zoom needs ffmpeg ≥ 5 (bundled 6.1 OK);
the timeline frame strip needs CORS on the media bucket.
- **Correction (Jamal, 2026-11-06):** the mockup's "List View (Preview)" block only SHOWS what List View looks like — it is
  not a section of the page. Removed from the folder view: Grid View = grid only, List View = list only.
- **Upload queue: Trim & Music = the editor's design (Jamal, 2026-11-06):** the cramped inline row controls (Trim popover,
  Mute checkbox, music link, cover box) are gone. A video row now shows one **Trim & Music** button + chips of what is
  set (trim range, song, Muted, cover thumbnail). The button opens a slide-in panel: player (plays the kept part with
  the song), **Timeline & Clip Trimming** (ticks, frame strip, drag handles, Start / End ▲▼, Duration, Reset — warns when
  the kept part is still over the 5 MB video cap), **Music (Background MP3)** (song card, Upload MP3 ≤ 10 MB, Mute
  Original Audio — on + locked with a song, because the upload REPLACES the video's sound; waveform Music Timeline,
  "Song starts at" → sent as music_start) and **Cover**. Apply / Cancel. No backend change (same /gallery/shorts kind=video).
- Built ONCE in `events/[id]/_components/media-edit-parts.tsx` (`useClipPlayer`, `TrimTimeline`, `MusicSection`,
  `TimeInput`, `clampTrim`, `loadMusic`) and used by the Upload panel AND the (switched-off) `video-editor.tsx`.
  tsc + eslint clean; not seen in a browser.
- **Trim & Music in the PAGE, not a slide-in (Jamal, 2026-11-06):** the panel (`VideoEditPanel`) now opens in place, right
  under its video's row in the Upload Queue (row highlighted), laid out like the mockup: player + Cover card side by side,
  then Timeline & Clip Trimming, then Music (Background MP3), Cancel / Apply at the bottom; ✕ closes it.
- **Trim & Music: smaller player (Jamal, 2026-11-06):** the full-width 16:9 player took too much space → fixed height
  220 px (250 px from sm), video fitted inside; cover box 110 px; tighter panel spacing.
- **Trim & Music checked LIVE (2026-11-06, headless Chromium 1366×768, Jamal's account, event 36, nothing uploaded):** live
  (`b08e770`) player was ~810×455 (full column, 16:9) — it filled the laptop screen and pushed Timeline / Music below
  the fold; Cover card tall with an empty box. Fix (not pushed): player = 16:9 box 230 px high (≈410 px wide, full width
  on phones), Cover card beside it at the same height (picture 160 px + text + buttons side by side). Previewed on
  the live page with the same sizes: the whole panel (title → Apply) fits one screen; page 1433 → 1207 px.
- **Event workspace sidebar grouped + rename (Jamal, 2026-11-06), portal only:** "Event Information" → **Event Info**
  (sidebar + event tab bar; `EVENT_TABS`). Sidebar (`EventWorkspace.tsx`) now: Dashboard, Event Info (no heading) →
  **DEFAULT MENU** → **ADDITIONAL MENU** → **SETTINGS** (Menu Settings, Activity Log). A section's group = its app menu's
  `is_default` (`TAB_MENU_SLUG` in event-tabs.ts: agenda, venue, gallery, family, wishes, live-streaming, social-links,
  guests, rsvp, participants, messages), read from the event's menus, else the plan's `/client/event-options` menus.
  Event 36 today: Default = Agenda, Venue, Guests, RSVPs, Participants, Messages; Additional = Gallery, Family,
  Wed Wishes, Live Streaming, Social Links. Collapsed sidebar: a thin line instead of each heading.
- **Participants: plan limit as a 5th tile (Jamal, 2026-11-06):** the "2 / 100 participants on this event" line above the
  tiles is now a **Plan Limit** tile in the same row ("2 / 100", caption "98 places left"; red + "Limit reached —
  upgrade your plan" when full). Shown only when the plan has a limit. Portal only.
- **Venue tab = the real Edit Venue page (Jamal, 2026-11-06), portal only:** the event workspace's Venue section showed two
  read-only rows (+ an old "wizard does not collect a venue" note). It now renders `EventWizard section="venue" embedded`
  — the same page as Edit Event → Venue (Step 1 Search on Map / Step 2 Want to Edit, map pin, name, address, city, map
  link, lat / lng) with Save. New wizard prop `embedded`: no page title / Exit, no Cancel, and Save stays on the page
  (toast "Event updated successfully") instead of going to the Edit Event hub.

## 8h. Family = DEFAULT menu + admin Menu Type field (Jamal, 2026-11-06)
- New tool `src/database/tools/set-menu-default.js --slug <slug> --default 1|0 [--prod] [--apply]` — same as the admin's
  Default switch: sets `event_menus.is_default` and (Default) grants the menu to every live plan that lacks it. Events
  need nothing (a Default menu is on for every event of its category); the portal's grant cache clears within 60 s.
- **Family (#7): LOCAL event_v2 applied** (is_default 0 → 1; all 9 plans already granted it).
  **LIVE event_v2: APPLIED 2026-11-06** (run at Jamal's request; #7 is_default=1, 4 plans already granted it; the live
  API now returns Family default=true for event 36). Earlier note, kept for the command: Dry run on live:
  `#7 Family is_default 0 -> 1`, 4 live plans, all already grant it. To apply (from the V2 backend folder):
  `$env:NODE_PATH = "D:/Jamal/Event_Management_Admin_Backend/node_modules"; node src/database/tools/set-menu-default.js --slug family --default 1 --prod --apply`
  (or V2 admin → Menu Management → Family → Edit → Menu Type = Default Menu → Update, signed in as developer@admin.com —
  admin@admin.com's saves go to approval). After it: the portal's event sidebar shows Family under DEFAULT MENU.
- **Admin "unable to change Default / Add-on" — checked LIVE:** the V2 Edit Menu form HAS it (a small "Plan Default"
  switch, Family = Add-on, switch enabled for developer@admin.com). It read as missing (list calls it "Menu Type").
  Fix (V2 admin frontend, not pushed): the switch is now **Menu Type \*** with two choice cards **Default Menu** /
  **Add-on Menu** (`menu-form-content.tsx`); the view page says "Menu Type: Default Menu / Add-on Menu". Same field
  (`is_default`), no backend change. Syntax-checked only — the V2 admin folder has no node_modules for tsc / eslint.
  V1 admin unchanged.
- **Event workspace top bar + sidebar bottom (Jamal, 2026-11-06), portal only:** top bar shows the venue's **City** only
  (venue_landmark; was "venue name - city"). "Menu Settings" → **App Menu**. Sidebar bottom: **SETTING** → App Menu (its
  RSVP / Participants / Family / Wish Settings / Contact Person sub-list unchanged); **REPORT** → Activity Log
  (`SETTING_TABS` / `REPORT_TABS` in event-tabs.ts). Jamal also listed "Website" under SETTING — no such section or page
  exists in the portal, so it is NOT added (Jamal: "reorder side bar only"); waiting for which item that means.
- **Family + Agenda tidy (Jamal, 2026-11-06), portal only:** Family tabs = All Members / Bride Side / Groom Side
  (**Close Family** and **Hidden** tabs removed; a hidden member still shows its Hidden pill). Agenda: the day header's
  "+ Add Session" removed (header Add Session stays); **Add Date** is now an outline button in the header row (Export
  Agenda · View Agenda (Guest) · Add Date · Add Session) with the same calendar popover — no longer a dashed card after
  the day cards.
- **Guests = the mobile app's flow (Jamal, 2026-11-06), portal only, no backend change** (reverses most of 7w on the web):
  list tabs = **All + one tab per guest group** (the app's pills; `group_id` filter) — Bride Side / Groom Side / VIP /
  Hidden tabs gone; table = Guest Name (+ email) · Mobile Number · Group · Status · ⋯ — Relationship, Side, Invite Count
  and App Visibility columns gone; Sort "Invite Count" gone; ⋯ = View / Edit / Send Invitation / View RSVP Response /
  Delete (Mark as VIP, Hide / Show removed). **Add Guest** = the app's form page (Full Name *, Mobile *, Group *,
  Email (Optional), Note (Optional); group pre-chosen from the open tab) — the design's slide-in panel (Guest Type,
  Relationship, Family Side, Invite Count, Address, Photo, RSVP Required, Visibility, VIP, Send via) removed.
  **Edit Guest** = the app's Edit Guest page (GuestForm). View Guest shows Group + Status instead of Relationship /
  Side / Invite Count / Visibility. The stored columns (side, is_vip, …) stay untouched.
- **Guest Import:** a **Download Sample File** card is now FIRST (above Upload CSV File), as the app. Text corrected to
  the server's rule: required **First Name + Mobile Number** (was "First Name, Email"); duplicates are by mobile number.
- Still on the RSVPs page (not asked): Bride / Groom tabs and Relation / Side columns.
- **RSVPs + Participants (Jamal, 2026-11-06), portal only:** RSVPs — "Show guests not invited yet (n)" switch removed
  (`show_uninvited` no longer sent); **Export** + **Send Reminder** moved into the heading row (ModuleHeader actions).
  Participants — tile "Pending Access" → **Pending**; new **Download CSV** button beside Add Participant: the list as
  shown (tab, search, sort, all pages) → Name, Mobile, Email, Relationship, Side, Members, RSVP Status, Access, Linked
  Guest, Joined On (UTF-8 BOM so Excel shows Tamil etc.); file `participants-<event-name>.csv`. Built in the browser
  from the already-loaded list — no backend change.
- **Guests Add / Edit back in the SLIDE-IN panel (Jamal, 2026-11-06 — "uniform with the other modules"):** the move to the
  GuestForm page is undone. New `guests/_components/guest-sheet.tsx` (FormPanel sheet) for BOTH Add Guest (header
  button) and Edit Guest (⋯ on Guests and on RSVPs): the app's fields only — Full Name *, Mobile Number * (country +
  per-country check), Group * ("Create a group first" when none; the open group tab is pre-chosen on Add), Email
  (Optional), Note (Optional, 300); "x / y guests used" line + Save blocked when the plan is full. Name saved whole in
  first_name (last_name cleared) as the app; Edit sends only these fields. The /guests/add and /guests/:id pages still
  exist (old links) but nothing in the Guests list opens them now.
- **Guest Import page tidy (Jamal, 2026-11-07), portal only:** right sidebar removed (Import Summary, Pro Tip, Need Help);
  page is one column. **CSV File Guidelines + Required / Recommended Columns** now sit in their own card ABOVE Upload CSV
  File (order: Download Sample File → Guidelines → Upload). The Excel "format phone as Text" tip is a guideline line now.
  **Back arrow** beside the "Import Guests" title → the event's Guests list (`wsHref`, so it stays in the event workspace).
- **Manage Groups: right sidebar removed (Jamal, 2026-11-07), portal only:** About Groups, Quick Actions and Pro Tip cards
  gone; the groups table uses the full width. Add Group stays in the header; Send Message to Group stays in each row's ⋯.
- **Manage Groups header (Jamal, 2026-11-07), portal only:** back arrow beside the title → Guests list (`wsHref`); button
  renamed **Add Guest Group**; **Export** moved from the filter row into the header, left of Add Guest Group.
- **Agenda: Add Date moved (Jamal, 2026-11-07), portal only:** the Add Date button now sits right AFTER the day cards
  (same row/grid, same calendar popover), not in the header. Header = Export Agenda · View Agenda (Guest) · Add Session.
- **Agenda: View Agenda (Guest) removed (Jamal, 2026-11-07), portal only:** the header button and its "what your guests see"
  dialog are gone. Header = Export Agenda · Add Session.
- **Guests list (Jamal, 2026-11-07), portal only:** header **Add Group** button removed (Manage Groups stays; Add Guest's
  "Create a group first" still opens the group panel). New **Plan Limit** tile in Guest Overview ("4 / 50", "46 places
  left"; red when full), same as Participants; Add Guest is disabled when full. The "x / y guests used on your plan" line
  is gone from the Add Guest panel — it only shows a red "Guest limit reached" note when full.
- **Guest Import: "Create missing groups" switch + "Important" note removed (Jamal, 2026-11-07), portal only.** Missing
  Guest Group names in the file are now ALWAYS created (`create_groups: true`, the switch's old default).
- **Guest import SAMPLE CSV = the app's form (Jamal, 2026-11-07) - BACKEND change, no DB change:** `clientGuestExport.service
  .sampleCsv` now writes only **First Name\*, Mobile Number\*, Guest Group, Email, Notes** (own `SAMPLE_COLUMNS`; was all 17
  export columns). Sample rows "Amit Sharma" / "Priya Mehta", group = the client's first group. Export unchanged (all columns,
  round trip). Import still reads every header. Portal Import page: "Recommended Columns" → **Optional Columns** = Guest Group,
  Email, Notes. Needs a V2 backend push (portal works either way).
- **Manage Groups ⋯ (Jamal, 2026-11-07), portal only:** "Send Message to Group" removed; ⋯ = Edit Group / Delete Group.
- **Export button named the same everywhere (Jamal, 2026-11-07), portal only:** Participants "Download CSV" → **Export**,
  Agenda "Export Agenda" → **Export**. Guests, RSVPs, Manage Groups already said Export (all outline + download icon).
- **Gallery sidebar child menu + Upload Image (Jamal, 2026-11-07), portal only:** workspace sidebar Gallery children =
  **Upload Image** · Create Video · Create Shorts (`?tab=gallery&create=image|video|short`). Upload Image opens the Upload
  Media panel on Images, in the default folder (or the first folder that takes images).
  Each child has an icon: Upload Image = ImagePlus, Create Video = Clapperboard, Create Shorts = Zap (same as the gallery's Shorts).
- **Agenda Add Date = a day-card-sized FILLED primary button (Jamal, 2026-11-07):** fills its grid cell (same width / height
  as a day card), icon box + "Add Date".
- **Family Export + Participants ⚙ (Jamal, 2026-11-07), portal only:**
  - Family header: **Export** (CSV of the list as shown — tab, search, sort, all pages: Name, Family Side, Relationship, Mobile,
    Display Order, Visibility, Key Family Member, Notes; UTF-8 BOM; `family-<event>.csv`). Order: Export · ⚙ · Add Family Member.
  - Participants header: **⚙ Participants Settings** button (same as Family's), opens the settings as a dialog. `ParticipantsForm`
    (settings-panel.tsx) now uses `SettingsShell` — dialog (Cancel / Save, closes on save) or inline card on App Menu → Participants
    Settings (gains a one-line description + footer, like Family / Wish settings). Order: Export · ⚙ · Add Participant.
- **Add Participant = slide-in panel ("canvas"), uniform with Guests / Family (Jamal, 2026-11-07), portal only:** the header
  button opens the panel straight away (the "Add from Guest / Add Manually" chooser dialog and the jump to the
  /participants/add page are gone). Same fields as before (`ParticipantForm` gained a `sheet` mode: FormPanel, 2 columns,
  Cancel / Add Participant footer, closes on save). "Fill from an event guest" at the top opens the guest picker; the picked
  guest fills the form ("Pick another guest" to change). The /participants/add page still works for old links.

## Gallery renamed to MEDIA everywhere (Jamal, 2026-11-07) - portal + backend + app + DB (names only)
- Portal: sidebar "Media" (children Upload Image / Create Video / Create Shorts), Media Overview, breadcrumbs, Edit Event
  hub tile, album builder, video editor, dialogs, toasts, home-screen preview. URLs stay `?tab=gallery`.
- Portal also this day: Upload Media = right-side panel (Select Folder → File Type → drop zone → Selected Files → Upload N
  Files); Add/Edit Group = slide-in panel (`groups/_components/group-sheet.tsx`); Venue tab = heading outside + one overall
  card with Step 1 / Step 2 cards inside.
- Backend: `clientGallery.service` DEFAULT_CATEGORY_NAME 'Media' (new events' default folder); messages say "Media";
  `rebuild-event-menus.js` names the gallery menu "Media". Slug stays `gallery`.
- DB tool `src/database/tools/apply-media-rename.js`: event_menus "Gallery" (slug gallery*) → "Media"; every default folder
  still named "Gallery" → "Media". Only exact "Gallery" rows change; re-run = no-op.
  **Applied LOCAL event_v2 (1 menu, 19 folders) AND PRODUCTION event_v2 (11 folders; prod menu #4 was already
  name 'Media' with slug 'media' — renamed in the admin).**
- Slug `media` accepted alongside `gallery`: portal sidebar (SLUG_ALIASES), app tile route/icon + offline prefetch,
  backend clientQuickActions DEFAULT_SLUGS. Local DB still has slug `gallery`.
- Sidebar Media = parent only (click = open/close, no page; collapsed icon still opens it). Children:
  Gallery (`?tab=gallery&create=gallery` → Gallery view, Upload Media inside), Create Album (`create=album` → album
  builder), Create Video (`create=video` → Upload Media on Video), Create Short (`create=short` → Upload Short).
  (V2 backend has no node_modules: prefix `NODE_PATH=d:/Jamal/Event_Management_Admin_Backend/node_modules`.)
- App: participant Media screen title + "Media Categories", Edit Event description, downloads + permission texts.
  Phone-gallery texts ("Save to Gallery", "Upload QR from Gallery", create-post picker) left as they are. Tiles read the
  menu name from the DB, so they show "Media" after the DB step. `dart analyze`: clean.
- Not done: V1 (d:\Jamal\...) projects, website-builder "Our Gallery" (public site, unrelated).

## Wed Wishes Monitor — Jamal's web design (Wishes_Monitor_Action_Flows, 2026-11-07) - portal only, no backend change
- `wishes-panel.tsx` rebuilt from the module kit: header (Wishes Settings · Post Wish), tiles (Total · Published · Pending
  Review · Hidden · Total Likes), search + Wish Type / Recipient / Date, tabs (All · Published · Pending · Hidden · Blocked),
  Wishes List table (Participant · Wish/Message + To · Type · Status · Likes · Posted On · ⋯), 10 per page.
- ⋯ actions open a panel on the RIGHT of the table (InlineSheets): View, Edit (organizer posts only — the server refuses
  edits to a participant's wish), Approve / Publish (Moderate: approve / keep pending / hide / reject = delete), Hide/Show
  (instant), Send In-App Message (templates), Block / Unblock (+ "Hide their existing wishes" = all_from_writer), Delete.
  Post a Wish (Post As, Recipient, Message, Upload Image / Video, Publish Immediately off = saved hidden), Blocked Words.
- Wishes Settings = own page, two cards (Visibility & Publishing = wish-settings fields; Moderation = filter enabled /
  auto_hide / notify + Manage Blocked Words). Menu Settings' WishSettingsCard unchanged.
- "Pending" = flagged by the word filter (server has no other approval state). New hook `useReplaceWishMedia`
  (POST /wishes/:id/media) for Edit → Replace.
- NOT built (no server support): Manage Comments, Reported tab, block reason / internal note, per-word action
  (Hold / Hide per word — the server has one global "auto_hide").

## Wishes Monitor BACKEND — comments, reports, block reason, per-word actions (Jamal, 2026-11-09) - backend + portal, DB CHANGE
- DB (`migrations/sql/20261109-wish-comments-reports.sql`, tool `apply-wish-comments-reports.js`, initial_setup.sql):
  new `event_wish_comments`, new `event_wish_reports` (one per person per wish), `event_wish_blocks.reason` + `.note`.
  **Applied LOCAL and PRODUCTION (event_v2, 2026-11-09).** Next: push backend, then portal.
- Models EventWishComment, EventWishReport (index.js); EventWishBlock reason/note; eventOrganizerAccess pins /wish-comments/:id.
- clientWish.service: settings `allow_comments`, `show_likes` (participants see like_count 0 when off); filter words get
  `action` replace | hold | hide (old words without action keep the old flag + auto_hide rule); comments (list / add /
  edit own / hide-show-review / delete, filter applies, blocked or comments-off → 403); reports (participant only, not own
  wish, notifies organizer `wish_reported`, organizer lists them, `dismiss_reports` on PUT /wishes/:id clears);
  block takes `reason` + `note`; list adds comment_count, report_count, author_block, counts.reported.
- Routes: GET/POST /wishes/:id/comments, PUT/DELETE /wish-comments/:id, POST /wishes/:id/report, GET /wishes/:id/reports.
- Portal: Reported tab + pill, Manage Comments panel (reply as organizer, edit own, hide/show, delete, Allow New Comments +
  filter toggle), View → Reports (Dismiss) + Latest Comments, Approve also dismisses reports, Block Reason + Internal Note,
  Blocked Words "Action When Detected", Settings → Allow Comments + Show Likes.
- Tests (local): API 29/29, browser 8/8. Test accounts LOCAL only: browser.test@ (#145, event 86), browser.participant@ (#146).
- Not done: the participant APP screens to comment / report (backend is ready for them).

## Wishes full test + V2 API load check + Billing race fix (Jamal, 2026-11-09) - backend, no DB change
- Wishes browser test (local): 20/20 — post (text / image / hidden), edit (text, recipient, add + remove photo), hide/show,
  filter hold → Pending → approve, reject, in-app message reaches participant, comments (reply / edit own / hide / show /
  delete / comments-off enforced), reports + dismiss, block reason + note + unblock, blocked words per action, settings,
  delete, filters. Every action checked as SAVED via the API (and reload where it matters).
- Load test (local, 200 req × 28 endpoints, 20 at once): single request 5–13 ms; under load p95 44–190 ms; gzip on.
  Pages make 8–11 API calls, no duplicates.
- **BUG FIXED — Billing first visit made duplicate subscriptions + invoices.** `clientBilling.getCurrentSubscription`
  creates the subscription on read for clients whose plan was set from the admin Clients screen (pointer only). The
  Billing page fires several requests at once → 30 simultaneous made 30 subscriptions / 17 invoices / 13 deadlock 400s.
  Now: lock the client row, re-check, create once. `clientInvoice.raiseInvoiceForTerm`: re-checks the term under the
  numbering lock + on deadlock returns the winner (no 2nd invoice for one term). `clientSocialLink.ensurePresets`:
  a deadlock on the first-read preset insert is ignored (rows exist). After: 30/30 OK, 1 sub, 1 invoice, 0 deadlocks.
- **PRODUCTION checked 2026-11-09: 0 clients with >1 subscription, 0 terms with >1 invoice — no damage.** Tool:
  `node src/database/tools/report-duplicate-subscriptions.js --prod` — lists clients with >1 subscription and terms with
  >1 invoice. Local test accounts were cleaned (#145, #147).
- Not pushed yet: wishes backend + these fixes (backend), wishes portal.

## Post Wish = slide-in panel ("canvas") (Jamal, 2026-11-09) - portal only, no backend change
- Wishes header **Post Wish** now opens the right-side slide-in panel (`FormPanel sheet`, same as Add Guest / Add
  Participant) over the page, instead of the card beside the Wishes table (`InlineSheets`). Same fields and save.
  The other ⋯ panels (View, Edit, Moderate, …) still open beside the table. `wishes-panel.tsx`; tsc + eslint clean.
- **All Wishes panels slide in too (Jamal, 2026-11-09):** View, Edit, Manage Comments, Moderate, Send In-App Message,
  Block, Delete and Blocked Words now open as the right-side slide-in (`ActionSheet` default) like Post Wish — the
  `SplitLayout` + `InlineSheets` beside the table is gone; the list always uses the full width. Wishes was the only
  module still opening panels beside the table (Agenda / Family / Guests / Groups / Participants already slide in).
- **Delete Wish = centred confirm pop-up (Jamal, 2026-11-09):** "Delete Wish?" Dialog (Cancel / Delete), the same as
  Delete in Family / Agenda / Media / Live / Social Links — no longer a slide-in. Portal only; tsc + eslint clean.

## Wed Wishes = CHAT view per participant (Jamal's design, 2026-11-09) - backend + portal, DB CHANGE
- Organizer web view only (the participant app keeps its own view). Replaces the Wishes List table.
- Jamal's choices: organizer reply = PUBLIC comment on the wish (everyone sees it); build Unread + Online now;
  composer = text + photo + emoji (no voice); old table removed. NOT built: emoji reactions, About / Notes, voice.
- **Portal** (`events/[id]/_components/wishes-chat.tsx`, used by `wishes-panel.tsx`): tiles unchanged (Total → all,
  Pending → filter, Hidden → Hidden tab). Left "Conversations (n)": search, filter (All / Pending review / Reported /
  Blocked), tabs All / Unread / Hidden, rows = avatar + Online dot, name, last message ("You: …" for own reply), time,
  unread badge. "Event Organizer" = the organizer's own posts (composer there = Post a Wish). Middle: wishes oldest
  first as bubbles (media, To Bride/Groom, Pending / Hidden / Reported pills, likes, comment count, Reply), day pills,
  organizer replies on the right (crown, ✓✓), the participant's own replies on the left; ⋯ per wish = View / Edit /
  Approve-Publish / Hide-Show / Send In-App Message / Manage Comments / Delete (panels unchanged); ⋯ per reply =
  Hide/Show, Delete (pop-up). Header: ⓘ Participant Details, Block / Unblock, ⋯ (Participant Details, Send In-App
  Message, Remove Participant = pop-up). Participant Details slide-in: Profile (Basic Details, Event Participation,
  Activity Summary) / Wishes / Media / Comments — data from `/client/participants` (no new endpoint). Phones: list
  OR conversation with a back arrow. Header also gained a **Blocked Words** button.
- **Backend** (`clientWish.service`): owner list adds `wish.thread_key` (`c:<writer client id>` | `org`),
  `wish.replies` (organizer + that writer's comments, oldest first) and `threads[key] = { unread, online, last_read_at }`.
  Unread = the writer's wishes + their own comments newer than the organizer's last read (never opened = all).
  Online = used the app in the last 3 min (same per-number presence as the Contact Person chat).
  `POST /client/events/:id/wish-threads/read { thread }` (owner only). `POST /wishes/:id/comments` takes an optional
  image `file` (organizer only; JPG/PNG/WEBP; same caps as wish photos) → comment `photo`; reply photos count in Max
  Photos + storage (clientGallery photosUsedFor / storageUsedFor); photos removed with the comment / wish / event.
- **DB:** `event_wish_reads` (event, reader, thread_key, last_read_at; unique) + `event_wish_comments.photo`,
  `.size_bytes`. Migration `20261109-wish-threads.sql`, tool `apply-wish-threads.js`, initial_setup.sql, model
  EventWishRead. **Applied LOCAL event_v2 only.** PRODUCTION ORDER: `apply-wish-threads.js --prod` (dry run) →
  `--prod --apply` → push backend → push portal.
- Tests: service 12/12 local (threads, unread, mark read, reply in thread, participant view has no thread data,
  refusals). tsc + eslint clean. **Not yet tried in a browser** (servers were not running).
- **LIVE (2026-11-09, Jamal's request):** `apply-wish-threads.js --prod --apply` done (event_wish_reads + comment
  photo / size_bytes on live event_v2; re-check = all "already there").
- **Sample conversations on LIVE event #36 "Jamal And Fahmi" (owner Jamal #26):** new tool
  `src/database/tools/seed-sample-wish-threads.js --event <id> [--prod] [--apply] [--remove]`. Uses the five
  "(Sample)" accounts (#40 Rahul, #45 Aditi, #46 Rohan, #47 Neha, #48 Karan — mobiles 9000000001 / 9000000011–14):
  each added as a participant of the event (notes = "Sample data (seed-sample-wish-threads)"), 10 text wishes over
  the last ~2 days, 4 organizer replies (as "Afzar"), 1 participant reply, likes, 1 hidden (Rohan), 1 pending review
  (Neha). Nothing marked read → all Unread. Checked through the service as the organizer: 5 participant threads +
  the Organizer thread. Re-run = skipped. Take it out: `... --event 36 --prod --apply --remove`.
  The 5 sample participants count toward the event's participant numbers while they are there.
- **Chat fits the screen (Jamal, 2026-11-09), portal only:** the chat box's height = window height minus its top
  (`useFitHeight` in wishes-chat.tsx, on load + resize, min 420 px) — was a fixed calc(100vh-200px) that pushed the
  message box below the fold. Conversation rows / thread header a little tighter (avatar 38, py-2.5). tsc + eslint clean.
- **Header ⋯ (Jamal, 2026-11-09):** "Send In-App Message" removed from the conversation header's ⋯ (now Participant Details · Remove Participant). Still on each wish's ⋯ and in Participant Details.

## Wed Wishes panels = Jamal's designs + Hide Chat + per-wish comments (2026-11-09) - backend + portal, DB CHANGE
- **Panel look** (module-kit `ActionSheet` new props `eyebrow` / `large`; `FormPanel` passes `eyebrow`): floating rounded
  slide-in, pink "<EVENT> · WED WISHES" line above a large title, Cancel/Close + main button. Other modules unchanged.
- New `events/[id]/_components/wish-panels.tsx` (+ `WishPanelsProvider`: event name + participants for "Bride Side"):
  **View Wish** (person card + status, Wish Details, Attached Media with type • size • ext, Engagement & Status, reports,
  latest comments), **Edit Wish** (Wish Type Text / Text with Image / Text with Video, Wishes To, message, current media
  with Replace, or upload), **Approve & Publish** (green check, wish card, "What happens when you publish?", Recipient,
  Pending → Published), **Manage Comments** (wish card + "N Comments", chips All / Published / Pending (/ Hidden),
  Approve / Hide-Show / Delete per comment, amber "Allow new comments on this wish" → Save Settings),
  **Send In-App Notification** (Recipient, Channel In-App, Subject 100, Message 500 prefilled, Live Preview).
  Block Participant, Blocked Words, Post Wish, Participant Details got the same header.
  NOT built from the Edit design: "Reason for Editing" + "recorded in the event activity log" — there is no event
  activity log yet. Notification message max is 500 (server MESSAGE_MAX), the design showed 1,000.
- **Hide Chat** (conversation ⋯ → Hide Chat / Move to Inbox): note ≤ 250; organizer's inbox only, wishes unchanged.
  Tabs now: All = main inbox, Unread (inbox), Hidden = hidden chats. "Has hidden wishes" moved to the filter
  (Hidden Wishes tile → that filter).
- **Backend:** `POST /client/events/:id/wish-threads/hide { thread, hidden, note }` (owner only); `threads[key].hidden /
  hide_note`; wish `allow_comments` (PUT /wishes/:id `allow_comments`; participants refused "The organizer has closed
  comments on this wish."; organizer can still reply); wish `size_bytes` for owner / writer.
- **DB:** `20261109-wish-chat-hide.sql` — event_wish_reads.last_read_at NULL-able + is_hidden, hide_note, hidden_at;
  event_wishes.allow_comments. Same tool `apply-wish-threads.js` (now also runs round 2). initial_setup.sql + models.
  **Applied LOCAL only.** ⚠ PRODUCTION: `apply-wish-threads.js --prod --apply` BEFORE pushing the backend (the model
  reads event_wishes.allow_comments — without it the wishes list fails).
- Tests: service 18/18 local (+ hide / show chat, participant can't hide, comments closed per wish). tsc + eslint clean.
- **Participant Details = Jamal's design (2026-11-09), portal only, no backend change** (wishes-chat.tsx): header (big photo
  + Online dot, name, Active pill, side; Send Message, call, mail, ⋯ = Hide Chat / Block / Remove Participant),
  underlined tabs. **Profile:** Basic Details (Edit → /participants/:id/edit in the workspace; name, mobile + copy, email
  + copy, relationship, city), Event Participation (Invitation, RSVP, Joined), Activity Summary tiles. **Wishes:** filter
  by type, "N Published", one card per wish (type, status, ⋯ = the bubble actions, text box or thumbnail + likes / length /
  To, View → View Wish). **Media:** Grid / List view, chips All / Images / Videos, big preview, Uploaded date, likes, View
  Media / Watch Video. **Comments:** EVERY comment on this person's wishes (new hook `useWishCommentsMany`, one request per
  wish, shared cache), chips All / Visible / Hidden, "On <name>'s photo wish", Visible / Hidden pill, Actions = Edit
  (own) / Hide-Show / Delete. About / Notes NOT built (Jamal: skip). tsc + eslint clean.

## LIVE browser test of the Wed Wishes chat (Jamal, 2026-11-09)
- LIVE DB: `apply-wish-threads.js --prod --apply` round 2 applied (event_wish_reads hide columns, last_read_at NULL-able,
  event_wishes.allow_comments) — re-check all "already there".
- QA account: **QA Tester #53** (qa.portal@eventinvite-test.com), event **#37 "QA Test Wedding"** — sample conversations
  seeded there (`seed-sample-wish-threads.js --event 37`). Password was unknown (bcrypt) → reset with new tool
  `src/database/tools/set-test-client-password.js --email <x>@eventinvite-test.com --prod --apply` (only
  @eventinvite-test.com). **The login is in `Event_Management_Admin_Backend/.env.qa-test` (git-ignored) — never in this
  file; the repo is on GitHub.**
- **Bug fixed in the seed tool:** mysql2 wrote the PC's local time (IST) → sample wishes were 5½ h in the future and
  stayed Unread. Now `timezone: 'Z'`. Sample data on #36 and #37 removed and re-seeded with correct times.
- Test = Playwright on https://eventmanagementclientv2.vercel.app, signed in through the login API in the same browser
  context; every step checked against the live API. Script + screenshots + report.json:
  `Documents\EventInvite_Portal_Test\2026-11-09_wishes_chat\` (`live_wishes_test.cjs`, run from a folder with playwright:
  `NODE_PATH=D:/Jamal/event_client_single/node_modules node live_wishes_test.cjs`; `cleanup_stamps.cjs` removes any
  "QA-xxxx " test item left on #37).
- **Result: 15 / 17 pass** — chat view, fits screen, unread clears on open, text reply, photo + emoji reply, View Wish,
  Hide / Show wish, Send In-App Notification, Participant Details 4 tabs, Block / Unblock, Approve & Publish, organizer
  post → Edit Wish → Delete pop-up, search + filter, Delete Reply pop-up. 0 page errors.
  **2 fail only because the live backend on Render is still the PREVIOUS build:** Manage Comments "Allow new comments"
  (list has no allow_comments) and Hide Chat (`POST /wish-threads/hide` → 404). Commit d7e0fc2 is on GitHub but not
  deployed — redeploy the V2 backend on Render, then re-run the script.
- Everything the runs created was deleted (replies, organizer posts); in-app test notifications went to sample account #45.
- **Wishes panels smaller (Jamal, 2026-11-09), portal only:** design-style ActionSheet header 18 px title / 10.5 px eyebrow / tighter padding, buttons 36 px, body 12.5 px; wish-panels cards p-3, avatar 36, message 13.5 px; View / Edit / Approve / Manage Comments 520 px wide (was 600). tsc + eslint clean.
- **Other Wishes panels smaller too (Jamal, 2026-11-09), portal only:** Participant Details (photo 60, name 17 px, small header buttons, tabs 12 px, cards p-3, rows 12 px, activity numbers 17 px), Hide Chat, Send In-App Notification (inputs 36 px, 5-row message), Block, Blocked Words — all 520 px wide. tsc + eslint clean.

## Organizer can EDIT a participant's wish (Jamal, 2026-11-09) - backend + portal, DB CHANGE
- Reverses the V1 rule "the organizer never rewords a participant's wish". `assertCanEdit`: the event owner may change
  any wish (message, recipient, type, media); a participant still only their own. `can_edit` = owner always.
- The wish keeps the participant's name; `event_wishes.edited_by_organizer_at` is set → `edited_by_organizer: true` for
  everyone (organizer + participants in the list). The writer editing it again clears the mark.
- Portal: Edit Wish now on every wish's ⋯ (chat bubble + Participant Details → Wishes); Edit panel note "This is X's
  wish. It keeps their name, and everyone sees an 'Edited by organizer' label"; label in the chat bubble + View Wish.
  The participant APP does not show the label yet (field is in the API).
- DB: `20261109-wish-edited.sql`, round 3 of `apply-wish-threads.js`, initial_setup.sql, model. **LOCAL applied.**
  ⚠ PRODUCTION: `node src/database/tools/apply-wish-threads.js --prod --apply` BEFORE pushing the backend — the model
  reads `edited_by_organizer_at`; without it the wishes list fails. (Dry run on live: "+ event_wishes.edited_by_organizer_at
  WOULD ADD".)
- Tests: service 22/22 local (+ organizer edits participant wish → saved / marked / name kept, participant sees the mark,
  writer edit clears it). Portal tsc + eslint clean.
- Note: a script slip emptied initial_setup.sql locally during this change; restored from the last commit (d7e0fc2) at
  once and the one new line re-added — diff vs commit = 1 line.
- **LIVE applied (2026-11-09, Jamal's request):** `apply-wish-threads.js --prod --apply` — edited_by_organizer_at on live event_v2 (re-check: already there). Backend + portal can be pushed.
- **Wishes: standard canvas + smaller text (Jamal, 2026-11-09), portal only:** every Wishes panel (View / Edit / Approve / Manage Comments / Send Notification / Hide Chat / Participant Details / Block / Blocked Words / Post Wish) is back to the STANDARD module slide-in (round icon, title, subtitle, ✕ — like Guests / Family); the mockup header (eyebrow) is no longer used. Chat text one step smaller (list 12.5 / 11.5, bubbles 12.5, header 14, avatars 34 / 36 / 30, tighter bubbles). tsc + eslint clean.
- **Design reference (Jamal, 2026-11-10):** `C:\Users\LK MEDIA\Downloads\20261109_Wed Wishes updated\Wed Wishes updated\` — dashboards, 01_1 per-wish panels (View / Edit / Approve / Hide / Send In-App / Manage Comments / Delete), 02_1 Participant Details tabs, View Full Profile, Block Participant.

## Wed Wishes chat: Online / last seen from the backend (Jamal, 2026-11-10) - backend + portal, no DB change
- Backend `clientWish.lastSeenOf` (was onlineClients): per participant the latest `contact_person_logins.last_seen_at`
  for their number (written by eventOrganizer.touchPresence on EVERY signed-in request, max once a minute — app and web).
  `threads[key].online` = seen in the last 3 min; new `threads[key].last_seen_at` (null = never used the app).
- Portal: chat header + Participant Details show green "Online", grey "Offline · last seen 5 min ago / today at … /
  yesterday at … / 02 Nov", or "Not on the app yet"; list keeps the green dot for online. `useEventWishes` refetches
  every 30 s while the tab is open (new wishes, unread, presence without reload).
- Tests: service 22/22 + presence local (just used → Online + last_seen; 10 min ago → Offline, last_seen kept).
  tsc + eslint clean. Needs backend push (Render) + portal push (Vercel) — both were BEHIND on 2026-11-10.
- **Block Participant = Jamal's design (2026-11-10), portal only, no backend change:** standard slide-in (Ban icon) → person
  card + Active pill, pink warning "This participant will no longer be able to post wishes or interact in this event.",
  **Reason for Block \*** dropdown (no default; button off until chosen), **Note (Optional)** 0/300, Cancel / Block
  Participant. REMOVED: reason radio list, "Hide their existing wishes" switch (blocking no longer hides their wishes),
  bottom info note. Unblock: person card (Blocked pill) + "Why they were blocked" + Unblock. tsc + eslint clean.
- **Participant Details → Comments = Jamal's mockup (2026-11-10) - backend + portal, no DB change:** **Filter** button on the
  Comments card (Written by: Everyone / Participants / Event Organizer; On wish type: All / Text / Image / Video; "Filter (n)",
  Clear filter) - the All / Visible / Hidden chips + counts follow it. Time shown as "02 Nov • 10:30 AM". **Edit Message on
  EVERY comment** (was only the organizer's own). Backend `clientWish.updateComment`: the event owner may reword any comment
  (name kept), `can_edit` = owner always - same rule as wishes (no "edited by organizer" label on comments; would need a DB
  column). Portal shows Edit on all rows; on the OLD backend a participant comment edit gets 403 -> push backend first.
  `node --check` + tsc + eslint clean; not seen in a browser.
