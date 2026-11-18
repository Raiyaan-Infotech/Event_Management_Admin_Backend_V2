# V2 unused audit (candidates, nothing removed)

Generated 2026-11-18T21:41:54.413Z by `src/database/tools/audit-unused.js`. Database: `event_v2` (local).

## Summary

- Routes: **839** — referenced by a client: 712, probably referenced: 74, **no reference: 53**
- Route files with no referenced route at all: **0**
- Backend files nothing reaches without those: **0**
- Tables: **149** — used: 149, **no reachable code: 0**

Clients read: Admin portal (525 paths), Client portal (271 paths), Website Builder (86 paths), Public Website (35 paths), Mobile app (211 paths)

## Routes by file

| Route file | Routes | Used | Likely | No reference | Audience of the unreferenced |
|---|---|---|---|---|---|
| routes/activityLog.routes.js | 4 | 3 | 0 | 1 | open 1 |
| routes/approval.routes.js | 7 | 7 | 0 | 0 |  |
| routes/auth.routes.js | 10 | 10 | 0 | 0 |  |
| routes/clientPortal.routes.js | 284 | 272 | 2 | 10 | open 10 |
| routes/colorPalette.routes.js | 5 | 5 | 0 | 0 |  |
| routes/company.routes.js | 7 | 7 | 0 | 0 |  |
| routes/companyWebsiteBuilder.routes.js | 178 | 109 | 64 | 5 | open 5 |
| routes/currency.routes.js | 7 | 7 | 0 | 0 |  |
| routes/decoration.routes.js | 10 | 10 | 0 | 0 |  |
| routes/emailConfig.routes.js | 8 | 7 | 0 | 1 | open 1 |
| routes/emailTemplate.routes.js | 10 | 10 | 0 | 0 |  |
| routes/eventAvailability.routes.js | 20 | 20 | 0 | 0 |  |
| routes/eventCategory.routes.js | 6 | 6 | 0 | 0 |  |
| routes/eventMenu.routes.js | 9 | 9 | 0 | 0 |  |
| routes/eventResponsibility.routes.js | 6 | 2 | 0 | 4 | open 4 |
| routes/eventTemplate.routes.js | 10 | 10 | 0 | 0 |  |
| routes/frameStyle.routes.js | 9 | 9 | 0 | 0 |  |
| routes/guestFoodPreferenceOption.routes.js | 6 | 2 | 0 | 4 | open 4 |
| routes/guestRelationshipOption.routes.js | 6 | 2 | 0 | 4 | open 4 |
| routes/homeScreenCategory.routes.js | 7 | 7 | 0 | 0 |  |
| routes/homeScreenTemplate.routes.js | 7 | 7 | 0 | 0 |  |
| routes/language.routes.js | 7 | 7 | 0 | 0 |  |
| routes/location.routes.js | 23 | 23 | 0 | 0 |  |
| routes/media.routes.js | 9 | 9 | 0 | 0 |  |
| routes/menu.routes.js | 7 | 7 | 0 | 0 |  |
| routes/module.routes.js | 6 | 5 | 0 | 1 | open 1 |
| routes/notificationCategory.routes.js | 6 | 2 | 0 | 4 | open 4 |
| routes/notificationTemplate.routes.js | 9 | 9 | 0 | 0 |  |
| routes/permission.routes.js | 5 | 5 | 0 | 0 |  |
| routes/planBadge.routes.js | 10 | 10 | 0 | 0 |  |
| routes/planType.routes.js | 6 | 6 | 0 | 0 |  |
| routes/public.routes.js | 19 | 15 | 2 | 2 | open 2 |
| routes/pushNotificationConfig.routes.js | 9 | 8 | 0 | 1 | open 1 |
| routes/role.routes.js | 6 | 6 | 0 | 0 |  |
| routes/setting.routes.js | 6 | 6 | 0 | 0 |  |
| routes/subscriptionPlan.routes.js | 11 | 11 | 0 | 0 |  |
| routes/templateCategory.routes.js | 7 | 7 | 0 | 0 |  |
| routes/templateFont.routes.js | 5 | 5 | 0 | 0 |  |
| routes/timezone.routes.js | 1 | 1 | 0 | 0 |  |
| routes/translation.routes.js | 13 | 13 | 0 | 0 |  |
| routes/translationKey.routes.js | 10 | 10 | 0 | 0 |  |
| routes/user.routes.js | 6 | 6 | 0 | 0 |  |
| routes/vendor.routes.js | 35 | 13 | 6 | 16 | open 6, client 5, vendor 5 |
| routes/websiteClient.routes.js | 7 | 7 | 0 | 0 |  |

## Routes with no client reference

### routes/activityLog.routes.js (1 of 4)

- `GET /api/v1/activity-logs/module/:module` — open

### routes/clientPortal.routes.js (10 of 284)

- `GET /api/v1/client/events/:id/contact-chats/recipients` — open
- `GET /api/v1/client/events/:id/contact-chats/:chatId/messages` — open
- `POST /api/v1/client/events/:id/contact-chats/:chatId/messages` — open
- `GET /api/v1/client/events/:id/contact-chats/:chatId/details` — open
- `GET /api/v1/client/events/:id/my-contact-chat` — open
- `POST /api/v1/client/events/:id/my-contact-chat/messages` — open
- `POST /api/v1/client/events/:id/notification-templates/:templateId/test` — open
- `PUT /api/v1/client/events/:id/agenda/reorder` — open
- `POST /api/v1/client/downloads/:downloadId/hit` — open
- `POST /api/v1/client/wishes/:wishId/report` — open

### routes/companyWebsiteBuilder.routes.js (5 of 178)

- `GET /api/v1/website-builder/content-translations/auto-translate/stream` — open
- `PATCH /api/v1/website-builder/faq-categories/:id/status` — open
- `PUT /api/v1/website-builder/faq-categories/:id/status` — open
- `PATCH /api/v1/website-builder/faqs/:id/status` — open
- `PUT /api/v1/website-builder/faqs/:id/status` — open

### routes/emailConfig.routes.js (1 of 8)

- `GET /api/v1/email-configs/:id/debug` — open

### routes/eventResponsibility.routes.js (4 of 6)

- `GET /api/v1/event-responsibilities/:id` — open
- `PUT /api/v1/event-responsibilities/:id` — open
- `PATCH /api/v1/event-responsibilities/:id/status` — open
- `DELETE /api/v1/event-responsibilities/:id` — open

### routes/guestFoodPreferenceOption.routes.js (4 of 6)

- `GET /api/v1/guest-food-preference-options/:id` — open
- `PUT /api/v1/guest-food-preference-options/:id` — open
- `PATCH /api/v1/guest-food-preference-options/:id/status` — open
- `DELETE /api/v1/guest-food-preference-options/:id` — open

### routes/guestRelationshipOption.routes.js (4 of 6)

- `GET /api/v1/guest-relationship-options/:id` — open
- `PUT /api/v1/guest-relationship-options/:id` — open
- `PATCH /api/v1/guest-relationship-options/:id/status` — open
- `DELETE /api/v1/guest-relationship-options/:id` — open

### routes/module.routes.js (1 of 6)

- `POST /api/v1/modules/:id/permissions` — open

### routes/notificationCategory.routes.js (4 of 6)

- `GET /api/v1/notification-categories/:id` — open
- `PUT /api/v1/notification-categories/:id` — open
- `PATCH /api/v1/notification-categories/:id/status` — open
- `DELETE /api/v1/notification-categories/:id` — open

### routes/public.routes.js (2 of 19)

- `GET /api/v1/public/website-clients/oauth/providers` — open
- `GET /api/v1/public/website-clients/oauth/:provider/callback` — open

### routes/pushNotificationConfig.routes.js (1 of 9)

- `PATCH /api/v1/push-notification-configs/:id/toggle` — open

### routes/vendor.routes.js (16 of 35)

- `POST /api/v1/vendors/client/auth/handoff` — open
- `POST /api/v1/vendors/client/auth/forgot-password` — open
- `POST /api/v1/vendors/client/auth/reset-password` — open
- `POST /api/v1/vendors/client/auth/logout` — client
- `GET /api/v1/vendors/client/auth/me` — client
- `PUT /api/v1/vendors/client/auth/profile` — client
- `PUT /api/v1/vendors/client/auth/change-password` — client
- `GET /api/v1/vendors/client/subscription/plans` — client
- `POST /api/v1/vendors/auth/logout` — open
- `POST /api/v1/vendors/auth/forgot-password` — open
- `POST /api/v1/vendors/auth/reset-password` — open
- `PUT /api/v1/vendors/auth/profile` — vendor
- `POST /api/v1/vendors/auth/change-password` — vendor
- `POST /api/v1/vendors/auth/handoff-token` — vendor
- `GET /api/v1/vendors/auth/activity` — vendor
- `PATCH /api/v1/vendors/clients/:id/status` — vendor

## Backend files nothing reaches (after dropping the fully-unreferenced route files)


## Tables with no reachable code

| Table | Rows | Model | Only mentioned in | Other tables point at it |
|---|---|---|---|---|
