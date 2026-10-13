# Chef app API additions (contract shared by the mobile redesign and the backend plan)

All fields are additive and optional for clients. Mobile parsers accept them when present and hide the related UI when absent. Paths are as seen through api.craves.in.

## Order service — chef order responses (`GET /api/v1/chef/orders`, `GET /api/v1/chef/orders/{id}`, accept/reject/ready responses)
- `chefAcceptanceExpiresAt: string | null` — ISO-8601 instant from the existing `chef_acceptance_expires_at` column.
- `customerNote: string | null` — the checkout note (`CheckoutRequest.note`), max 500 chars, now persisted.
- `statusHistory: {status: OrderStatus; at: string}[]` — detail response only, oldest first, from `order_status_history`.
- `deliveryPartner: {name: string | null; phone: string | null; photoUrl: string | null; pickupEtaAt: string | null} | null` — latest courier reported by the delivery provider.
- `chefHandedOverAt: string | null`.
- New action: `POST /api/v1/chef/orders/{id}/handed-over` (no body) → `OrderResponse`; allowed only in `READY_FOR_PICKUP`; records `chefHandedOverAt`; does not change status (the provider moves it to `OUT_FOR_DELIVERY`); idempotent.

## Catalog service — kitchen (`GET/PUT /api/v1/kitchens/me`)
- Response adds `chefPhotoUrl: string | null`, `kitchenPhotoUrl: string | null`, `cuisines: string[]`, `serviceAreas: string[]`, `socialLinks: {instagram: string | null; facebook: string | null; youtube: string | null; website: string | null}`.
- PUT accepts the same optional `cuisines`, `serviceAreas`, `socialLinks`; a field that is absent or null keeps its stored value (craves.in sends PUT without them).
- `POST /api/v1/kitchens/me/photos?kind=CHEF|KITCHEN` multipart field `file` (JPEG/PNG/WebP, ≤ 8 MiB) → kitchen response. `DELETE /api/v1/kitchens/me/photos/{kind}` → kitchen response.
- `GET /api/v1/kitchens/me/settings` / `PUT` body `{autoAcceptOrders: boolean, defaultPrepMinutes: number | null}` (5–120) → same shape.
- `DELETE /api/v1/kitchens/me/menu-items/{menuItemId}` → 204; archives the dish (status `ARCHIVED`), hidden from every customer and chef list.

## Notification service
- Optional query `role=CHEF|CUSTOMER` on `GET /api/v1/notifications/in-app`, `GET /in-app/page`, `GET /in-app/unread-count`, `PATCH /in-app/read-all`; filters on `recipient_role`. Absent = today's behaviour.

## Subscription service
- Chef plan responses add `activeSubscriberCount: number`.

## Existing routes the APIM script publishes for mobile (no code change)
catalog: `/kitchens/me/schedule` (GET, PUT), `/kitchens/me/schedule/overrides/{serviceDate}` (GET, PUT, DELETE), `/kitchens/me/menu-items/availability` (PATCH), menu-item image DELETE and set-primary PUT; order: `/chef/orders/page`, `/chef/scheduled-orders` (GET) and its response PUT, `/chef/reviews`, `/chef/reviews/kitchens/{kitchenId}/summary`; user-chef: `/support/cases` (POST, GET), `/support/cases/{caseId}` (GET), `/support/cases/{caseId}/messages` (POST); notification: `/notifications/in-app/page`, `/in-app/unread-count`, `/in-app/read-all`, `/notifications/preferences` (GET), `/notifications/preferences/{channel}` (PUT); plus every new route above.
