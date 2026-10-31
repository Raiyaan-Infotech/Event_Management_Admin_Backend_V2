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

## 8. Open items

1. **LIVE DATABASE IS MISSING 4 COLUMNS — client sign-in fails until fixed.** `website_clients` on live
   `event_v2` lacks `profile_visibility`, `visible_fields`, `social_links`, `cover_image_url` (the 29 Oct
   profile work; its production script was never run). Every client lookup (OTP request, email login) returns
   "Some values could not be saved". Fix (adds 4 empty columns, no data touched), from this folder:
   `NODE_PATH=D:/Jamal/Event_Management_Admin_Backend/node_modules node src/database/tools/apply-client-personal-address.js --prod --apply`
   then confirm with `schema-audit.js`. Dry run and audit were checked 2026-10-31. **V1's live DB has the same gap**
   (V1 backend still answers normally because its deployed code is older) — run the same script in the V1 folder
   before V1's next deploy.
2. **Mobile app → V2 backend.** `AppConfig` still defaults to the V1 Render address
   (`event-management-admin-backend.onrender.com`). Switch it to the V2 backend, then build.
3. **OTP delivery for V2.** `OTP_ACCEPT_ANY=true` means anyone who knows a registered mobile
   number can sign in. Needs `MSG91_*` set on the V2 Render service, then switch it to `false`.
4. **Render free plan sleeps.** First request after a quiet spell takes ~30 s.
5. **Client login end-to-end in a browser** (Public Website → Mobile/Email tab → Client Portal)
   with the V2 settings above.
6. **Google redirect URI** for the V2 backend (if V2 keeps Google login).
7. **Home Screen Templates → mobile app** wiring.
8. V2 folders have **no `node_modules`**. To run scripts there before `npm install`:
   `NODE_PATH=D:/Jamal/Event_Management_Admin_Backend/node_modules`. V2's backend also uses
   port 5001, same as V1 — stop V1 before running V2 locally.

---

## 9. Working rules for this repo

- Commit messages: the message only, no Co-Authored-By line.
- Production order for any migration: run the tool with `--prod --apply` **before** pushing the backend.
- Don't start dev servers or delete `.next` while they run.
- Don't change `EVENT_QR_SECRET`.
