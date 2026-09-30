# Craves Chef Backend — Frontend Gap & Implementation Specification

Date: 2026-09-30
Target frontend: Chef web workspace on `web-ui-rebuild-from-scratch`
Purpose: give backend engineering a concrete list of contracts the Chef UX needs, while distinguishing existing backend capability from genuine missing capability.

## 1. Executive summary

The Chef frontend is not waiting for a full backend rewrite. The repository already provides substantial Chef capability:

- Auth/session and verified-email enforcement
- Chef application create/read/resubmission
- KYC evidence upload and per-document admin review
- Approved-Chef kitchen profile
- Kitchen weekly schedule, accepting-orders state and date overrides
- Menu CRUD, per-item availability and menu image upload
- Chef order list/detail plus accept/reject/ready-for-pickup
- Chef earnings ledger
- Automatic bank onboarding
- Chef-owned meal plans, schedules and capacity
- Chef-owned reviews backend
- In-app notification inbox

The missing work is mostly **product-level Chef contracts around those foundations**, not replacement of those services.

## 2. P0 — Chef onboarding / compliance

### 2.1 Resumable onboarding draft

Current application submission is effectively a submit/resubmit operation. The request contains name, verified email, address and coordinates. It does not represent the requested 8-step onboarding state.

Add a Chef onboarding aggregate, preferably owned by User/Chef Service:

`/api/v1/chef/onboarding`

GET response:

- applicationId
- currentStep
- completionPercent
- status: NOT_STARTED | IN_PROGRESS | READY_FOR_SUBMISSION | PENDING_REVIEW | REJECTED | APPROVED
- sections with completion state
- lastSavedAt
- blockingIssues[]
- serverVersion

PUT/PATCH section-specific draft endpoints or one versioned draft endpoint.

Required section model:

1. PERSONAL
2. CONTACT_VERIFICATION
3. KITCHEN
4. LOCATION
5. KITCHEN_PHOTOS
6. FSSAI
7. IDENTITY_ADDRESS_PROOF
8. BANK

Rules:

- autosave must be idempotent;
- draft must survive browser/app restart;
- server owns completion state;
- final submit validates every required section;
- rejected applications reopen only the required repair sections;
- approved applications are immutable except explicitly supported post-approval profile changes;
- never calculate completion from frontend-only state.

### 2.2 FSSAI compliance contract

The requested Chef flow explicitly asks for FSSAI number/details, certificate/proof and an option to apply with Craves.

No dedicated current web FSSAI contract exists.

Create:

`/api/v1/chef/compliance/fssai`

GET:
- status: NOT_SUBMITTED | NUMBER_SUBMITTED | DOCUMENT_UPLOADED | UNDER_REVIEW | VERIFIED | REJECTED | APPLICATION_REQUESTED
- fssaiNumber masked/display-safe as appropriate
- licenseType/category
- certificate metadata
- rejectionReason
- verifiedAt
- expiresAt when legally applicable
- renewalState

POST/PUT:
- FSSAI number
- license/category data
- certificate upload reference
- consent/source

POST `/apply`:
- records that Chef requested Craves-assisted FSSAI application
- idempotency key
- request status

Do not hard-code legal eligibility rules in the frontend. Backend owns validation and status.

### 2.3 Identity + address proof model

The current application evidence flow has six backend enum values, while the application uploader currently presents the four required application evidence slots. The requested product flow needs explicit identity/address choices such as Aadhaar, PAN, voter ID/address proof.

Create a compliance-document catalogue instead of overloading the existing application evidence enum:

- AADHAAR
- PAN
- VOTER_ID
- PASSPORT where product/legal approves it
- ADDRESS_PROOF
- APPLICANT_PHOTO
- OTHER_APPROVED

Every document needs:

- documentId
- type
- side where applicable
- masked identifier
- upload metadata
- status
- rejectionReason
- submittedAt
- reviewedAt
- expiresAt if applicable
- replacementAllowed
- version
- audit reference

Secure file contents remain server-side/blob storage. Browser responses must never expose blob container/name or reviewer identity.

### 2.4 Document review lifecycle

The current document review lifecycle is useful but must be expanded for the complete onboarding UX.

Recommended status:

`REQUIRED -> UPLOADED -> UNDER_REVIEW -> APPROVED | REJECTED -> REPLACEMENT_REQUIRED`

Add:

- per-document review reason;
- review history;
- replacement version;
- expiry/renewal where applicable;
- final application readiness evaluation.

Final Chef approval must not be based on a frontend count. Backend must expose:

`GET /api/v1/chef/onboarding/readiness`

with:

- ready: boolean
- blockingSections[]
- blockingDocuments[]
- complianceBlockingReasons[]
- bankReady
- kitchenReady
- finalSubmitAllowed

## 3. P0 — Kitchen identity and media

### 3.1 Kitchen photos

Current Catalog kitchen profile does not provide kitchen-photo management.

The requested flow needs:

- kitchen exterior/entrance
- cooking/stove area
- storage area
- preparation/workspace
- hygiene/cleanliness view
- optional additional photos

Create Catalog-owned kitchen media:

`GET /api/v1/kitchens/me/media`
`POST /api/v1/kitchens/me/media`
`PUT /api/v1/kitchens/me/media/{mediaId}`
`DELETE /api/v1/kitchens/me/media/{mediaId}`
`PUT /api/v1/kitchens/me/media/order`

Metadata:

- id
- category
- publicUrl
- sortOrder
- primary
- moderationStatus
- rejectionReason
- createdAt
- updatedAt

Upload policy must be backend-configured:

- MIME types
- max file size
- max image count
- image dimensions
- content-safety/moderation state

Store actual blobs privately; only safe HTTPS public/CDN URLs are returned.

### 3.2 Chef profile photo

Current mobile contract explicitly identifies profile-photo upload/remove as unavailable.

Create an approved-Chef profile media contract:

`GET /api/v1/chef/profile/media`
`POST /api/v1/chef/profile/photo`
`DELETE /api/v1/chef/profile/photo`

Return only safe public/CDN metadata.

## 4. P0 — Chef dashboard aggregate

The current Chef web dashboard composes separate sources. There is no approved dashboard aggregate.

Add:

`GET /api/v1/chef/dashboard`

Suggested response:

- chef display identity
- application/verification state
- kitchen status
- acceptingOrders
- availableNow
- today's order count
- pending acceptance count
- preparing count
- ready-for-pickup count
- today's gross/order value
- chef payable summary if finance contract permits
- active menu count
- available menu count
- rating summary
- unread notification count
- recent orders
- recent reviews
- onboarding blocking items

Important:

- backend computes all business metrics;
- no frontend summing ledger/order rows;
- use one authenticated CHEF-owned read model;
- avoid exposing private customer identifiers;
- define timezone explicitly.

## 5. P0 — Order detail completeness

Current Chef OrderResponse already supports the core workflow, but the Chef detail contract is missing several UX-required fields.

Add to the Chef-specific response:

- chefAcceptanceRequestedAt
- chefAcceptanceExpiresAt
- databaseNow/serverNow
- customerOrderNote, if this is approved for Chef visibility
- status timeline or dedicated endpoint
- safe payment-method label only if product approves Chef visibility
- action availability/reason
- delivery/fulfilment status where owned by Order/Delivery integration

Dedicated timeline endpoint:

`GET /api/v1/chef/orders/{orderId}/timeline`

Return:

- event
- status
- timestamp
- actorType
- safe note

Do not expose internal customer IDs, checkout/provider references or unrestricted operational payloads.

### Order action model

Every action should return authoritative:

- current status
- next allowed actions
- action rejection reason when unavailable
- updatedAt
- correlationId

The existing accept/reject/ready APIs remain the source of truth.

## 6. P1 — Real-time Chef order updates

The current web inbox requires manual refresh.

For a polished Chef experience, add one of:

- Server-Sent Events
- WebSocket
- push notification + lightweight polling

Minimum events:

- NEW_CHEF_ORDER
- ORDER_ACCEPTANCE_REMINDER
- ORDER_ACCEPTANCE_EXPIRED
- ORDER_ACCEPTED
- ORDER_REJECTED
- ORDER_PREPARING
- ORDER_READY_FOR_PICKUP
- DELIVERY_ASSIGNED
- DELIVERY_PICKED_UP
- DELIVERY_IN_TRANSIT
- DELIVERY_DELAYED
- ORDER_DELIVERED
- REFUND_EVENT

Notification delivery remains owned by Notification Service; Order/Delivery Services publish business events.

## 7. P0 — Notifications

The Notification Service already has the authenticated in-app inbox, unread count and read operations.

The missing Chef product layer is reliable category/deep-link semantics.

Every Chef notification should provide:

- notificationId
- category
- title
- body
- createdAt
- readAt
- priority
- actionType
- targetType
- targetId
- deepLink
- requiresAction

Chef categories:

- ORDERS
- PAYMENTS
- DOCUMENTS
- COMPLIANCE
- DELIVERY
- ACCOUNT
- SYSTEM

No notification should contain private delivery address/provider payloads.

## 8. P0 — Earnings / payout contract

The current earnings ledger is valid history, but it is not the complete Chef payout product.

The frontend needs separate authoritative contracts:

### Earnings summary

`GET /api/v1/chef/finance/summary?from=&to=`

- orderTotal
- grossEarnings
- CravesFee
- taxWithheld
- adjustments
- netPayable
- settled
- pending
- outstanding
- currency
- period

### Balance

Existing:

`GET /api/v1/chef/finance/balance`

should be exposed through the correct APIM/BFF path and treated as authoritative.

### Payout history

`GET /api/v1/chef/finance/payouts?cursor=&limit=`

Return masked, Chef-owned payout records:

- payoutId
- amount
- status
- payoutChannel
- providerStatus where safe
- transferReference where safe
- createdAt
- completedAt
- failureReason safe copy

### Withdrawal

Existing backend source already contains:

`POST /api/v1/chef/finance/withdrawals`

The missing requirement is a complete documented public contract including:

- idempotency
- expected balance
- eligibility
- hold state
- minimum/maximum rules
- bank readiness
- request state
- unknown-provider outcome
- retry/reconciliation behavior

Do not expose raw provider credentials or bank identifiers.

### Bank status

The automatic bank-onboarding contract already provides a masked enrollment status. The Chef UI should use that contract rather than creating another bank model.

## 9. P1 — Reviews

The Order Service already has Chef review APIs.

The Chef frontend still needs a web BFF/read model for:

- summary
- rating distribution
- recent published reviews
- pagination
- review dimensions/tags

Required:

`GET /api/chef/reviews`
`GET /api/chef/reviews/summary`

Backend must aggregate only PUBLISHED reviews for public/chef-facing content.

Do not expose customer identity, address, phone, moderation evidence or report information.

## 10. P1 — Menu management completeness

Current menu CRUD/availability/image upload is real.

Missing capabilities identified by the existing mobile contract:

- menu-item detail GET
- search/filter/pagination
- category metadata
- separate visibility semantics if required by UX
- delete
- duplicate
- duplicate-name validation
- media delete
- media reorder
- primary-image mutation
- readable media policy
- publication/synchronization acknowledgement

Recommended:

`GET /api/v1/kitchens/me/menu-items/{id}`
`DELETE /api/v1/kitchens/me/menu-items/{id}`
`POST /api/v1/kitchens/me/menu-items/{id}/duplicate`
`GET /api/v1/menu/categories`
`DELETE /api/v1/kitchens/me/menu-items/{id}/images/{imageId}`
`PUT /api/v1/kitchens/me/menu-items/{id}/images/order`

Keep listed/menu status separate from today's availability if the product UX requires both.

## 11. P1 — Kitchen operating controls

The Catalog backend already has:

`GET|PUT /api/v1/kitchens/me/schedule`

and date overrides:

`GET|PUT|DELETE /api/v1/kitchens/me/schedule/overrides/{serviceDate}`

Use these existing APIs in the Chef frontend. Do not create a second schedule model.

The schedule response already represents:

- timezone
- acceptingOrders
- pause state
- weekly service windows
- date overrides

## 12. P1 — Chef preferences

No complete Chef preference persistence contract currently exists.

If the final Chef UX includes settings, add:

`GET /api/v1/chef/preferences`
`PUT /api/v1/chef/preferences`

Potential server-owned fields:

- notification preferences
- default preparation time
- auto-accept eligibility/state
- reminder interval
- language
- currency display preference

Auto-accept must have explicit eligibility and new-orders-only semantics. Do not activate it merely because a boolean is present.

## 13. P1 — Chef service areas / cuisine

Current kitchen profile only exposes area name and coordinates. There is no complete Chef-owned service-area contract or cuisine taxonomy.

If these are part of the final Chef UX, add:

`GET|PUT /api/v1/chef/service-areas`
`GET /api/v1/catalog/cuisines`
`GET|PUT /api/v1/chef/cuisines`

The backend owns serviceability semantics. Frontend must not calculate delivery radius or polygon rules.

## 14. P1 — Public Chef/Kitchen presentation

The customer-side kitchen profile currently lacks authoritative Chef portrait/kitchen hero media.

If the customer UI is expected to show:

- Chef portrait
- kitchen hero
- kitchen gallery
- Chef bio
- cuisines
- rating summary

provide a privacy-safe public read model, preferably through Catalog:

`GET /api/v1/public/kitchens/{kitchenId}/profile`

Only publish approved/active information.

## 15. P2 — Analytics

Do not calculate analytics in the frontend.

If the Chef UX requires analytics, add:

`GET /api/v1/chef/analytics?from=&to=&timezone=&compare=`

Required semantics must be defined first for:

- orders
- revenue/earnings
- items sold
- average order value
- rating
- top items
- new vs returning customers
- comparison period
- date buckets
- CSV/report export

The current earnings ledger and orders list do not define these aggregation semantics.

## 16. P2 — Chef platform subscription

Do not reuse customer meal-plan APIs for a Chef purchasing a Craves platform subscription.

The existing Chef subscription APIs represent Chef-owned meal plans sold to customers.

If Craves later introduces Chef platform memberships, create a separate product contract for:

- plan catalogue
- current plan
- eligibility
- price/tax/billing cycle
- entitlements
- upgrade/downgrade
- cancellation
- renewal
- effective dates
- payment provider

## 17. P2 — Support / communication

If the Chef UX includes support/contact/customer communication, define a dedicated contract rather than exposing customer contact data as a communication mechanism.

Potential:

`POST /api/v1/chef/support/tickets`
`GET /api/v1/chef/support/tickets`
`GET /api/v1/chef/support/tickets/{ticketId}`

For customer/order communication, define authorization, retention, moderation and audit rules first.

## 18. Cross-service ownership

| Capability | Owner |
|---|---|
| Identity/session | Auth |
| Chef application/KYC/compliance | User/Chef |
| Kitchen profile/media/schedule/menu | Catalog |
| Chef order lifecycle | Order |
| Delivery lifecycle | Delivery/Integration |
| Earnings/ledger/payout | Integration/Finance |
| Meal plans/capacity | Subscription |
| Notifications | Notification |
| Reviews | Order |
| Dashboard aggregation | Dedicated Chef read model or BFF composition |
| Public kitchen presentation | Catalog |

No service should read another service's PostgreSQL tables directly.

## 19. APIM/BFF requirements

For every new public Chef operation:

1. Add exact upstream endpoint.
2. Add authenticated APIM operation.
3. Verify CHEF role/ownership at service layer.
4. Add same-origin BFF route for browser mutations.
5. Use no-store for private Chef reads.
6. Remove identity IDs, blob storage locators and internal provider data from browser DTOs.
7. Add request size/rate limits.
8. Add correlation ID.
9. Add idempotency for mutations where retries can create financial or workflow side effects.
10. Add contract tests for cross-Chef isolation.

## 20. Database / migration requirements

Every new persisted capability needs:

- Flyway migration
- ownership constraints
- indexes for Chef identity/kitchen
- createdAt/updatedAt
- audit history for compliance/financial mutations
- optimistic version where concurrent editing is possible
- soft-delete where history must survive
- no destructive migration of existing Chef records

## 21. Acceptance tests

### Onboarding
- New user can create draft.
- Every step autosaves.
- Browser restart resumes exact step.
- Missing sections are server-reported.
- FSSAI status is authoritative.
- KYC document replacement is versioned.
- Rejected document exposes reason.
- Approved document cannot be silently overwritten.
- Final submit fails server-side when required evidence is missing.
- Cross-Chef document access is forbidden.

### Kitchen
- Kitchen media upload/delete/reorder is owner-only.
- Invalid image type/size is rejected.
- Schedule changes immediately affect availability.
- Date override wins over weekly schedule.
- Pause/accepting-orders state is authoritative.

### Menu
- Create/edit/list/detail/delete/duplicate obey ownership.
- Availability is independent from listed status where supported.
- Image primary/order mutations persist.
- Duplicate names follow backend policy.

### Orders
- Acceptance countdown comes from server timestamps.
- Expired orders cannot be accepted.
- Timeline is immutable/read-only.
- Action list is server-authoritative.
- Duplicate accept/reject/ready requests are idempotent.
- Cross-Chef order access is denied.

### Finance
- Chef sees only own balance/ledger/payouts.
- Held account cannot withdraw.
- Bank-not-ready state blocks payout.
- Duplicate withdrawal request does not create duplicate payout.
- Provider UNKNOWN state is visible and cannot be blindly retried.
- No raw account number/provider secret appears in API response.

### Notifications
- New order creates one stable notification.
- Reminder/timeout notifications are idempotent.
- Read/read-all remain ownership constrained.
- Deep links resolve to the correct Chef destination.

### Reviews
- Only published reviews are returned to Chef.
- Pagination is stable.
- Customer identity/private evidence never leaks.

## 22. Recommended implementation order

### P0
1. Chef onboarding draft/readiness
2. FSSAI/compliance contract
3. Identity/address proof expansion
4. Kitchen media
5. Chef profile photo
6. Dashboard aggregate
7. Order detail countdown/timeline
8. Notification category/deep-link contract
9. Finance balance/payout APIM + complete Chef contract

### P1
10. Menu media/delete/reorder/detail
11. Reviews BFF/read model
12. Chef preferences
13. Service areas
14. Cuisine taxonomy
15. Public Chef/Kitchen profile
16. Realtime order updates

### P2
17. Analytics
18. Chef platform membership
19. Support/communication

## 23. Important: what NOT to change

Do not rewrite:

- Auth/session/token architecture
- existing Chef order transition rules
- existing kitchen ownership checks
- existing bank encryption/provider validation
- existing finance ledger arithmetic
- existing notification ownership rules
- existing subscription meal-plan model

Extend them with exact contracts and tests.

## 24. Backend handoff result

The backend team can implement this document independently. The frontend can then consume the exact contracts without deriving business state locally.

The highest-value backend work for the requested Chef onboarding UX is **not another dashboard endpoint first**. It is the missing onboarding/compliance/media foundation:

`Onboarding Draft -> FSSAI -> KYC/Address Proof -> Kitchen Media -> Readiness -> Submit -> Review -> Approved Chef`

Once that contract exists, the Chef frontend can implement the complete onboarding flow without fabricating state.
