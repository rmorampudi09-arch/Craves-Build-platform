# Craves Chef — Backend Requirements for Complete Frontend UX

> **Purpose:** Backend handoff for completing the Chef experience described in the Chef UX documents/chat and the current Chef web/mobile frontend.
>
> **Checked against:** `web-ui-rebuild-from-scratch` branch and the current Chef-related frontend/backend source present in that branch.
>
> **Important:** This document separates **already implemented backend capability** from **actual missing capability**. Do not rebuild APIs that already exist.

---

## 1. Executive summary

The Chef backend is **not empty**. The repository already contains working backend contracts for:

- authentication/session and verified email
- Chef application submission/review
- KYC document upload/review
- owned kitchen profile
- kitchen weekly schedule and date overrides
- menu CRUD, availability and menu-item images
- Chef orders and Chef accept/reject/ready actions
- Chef acceptance timeout and refund handling
- Chef earnings ledger
- Chef bank onboarding and automatic bank validation
- Chef payout/balance infrastructure
- Chef meal subscription plans, schedules and capacity
- Chef review data
- in-app notifications

The main backend work needed for the **complete Chef UX** is therefore concentrated in these areas:

### P0 — blocks the intended onboarding/product flow

1. **Real multi-step Chef onboarding draft/resume contract**
2. **Date of birth / expanded personal profile fields**
3. **FSSAI compliance module**
4. **Expanded KYC/address-proof document model**
5. **Kitchen media/photo management**
6. **Approved-Chef profile photo management**
7. **Make existing backend contracts available through the required APIM/client boundaries**

### P1 — needed for a complete professional Chef workspace

8. **Chef dashboard aggregate/read model**
9. **Chef analytics**
10. **Expose existing order acceptance deadline**
11. **Expose order status history/timeline**
12. **Customer order note**
13. **Chef notification preferences**
14. **Complete Chef business profile metadata such as cuisines, if the product requires it**
15. **Menu media delete/reorder/primary controls**

### P2 — optional/decision-dependent

16. **Chef platform subscription/membership**
17. **Chef-to-customer chat/contact workflow**
18. **Richer delivery tracking/read model**
19. **Dedicated support/ticket workflow**

---

# 2. Current frontend Chef journey

The intended Chef journey is:

```text
Customer / Login
    ↓
Phone OTP
    ↓
Existing customer OR create account
    ↓
Chef registration
    ↓
Chef name
    ↓
Phone verification
    ↓
Email + email OTP verification
    ↓
Personal details
    ↓
Kitchen details
    ↓
Kitchen location
    ↓
Kitchen photos
    ↓
FSSAI
    ↓
Identity + address proof
    ↓
Bank details
    ↓
Review everything
    ↓
Submit
    ↓
Under review
    ↓
Approved / Rejected
    ↓
Chef Dashboard
```

The frontend must be able to resume at the exact incomplete step.

---

# 3. Existing backend — DO NOT rebuild

## 3.1 Authentication

Existing:

- authenticated Craves identity
- phone-based authentication/OTP
- verified email flow
- Chef role authorization
- HTTP-only session/token boundary on web

The current Chef application service already requires the email to be verified before final application submission.

### Backend action

**No new authentication system is required.**

Only make sure the final Chef onboarding submit endpoint continues to call the authoritative email-verification check.

---

# 4. P0 — Chef onboarding draft/resume

## Current problem

Current `ChefApplicationRequest` contains:

- email
- firstName
- lastName
- addressLine1
- addressLine2
- landmark
- city
- state
- postalCode
- latitude
- longitude

Current application statuses are:

```text
NOT_SUBMITTED
PENDING
APPROVED
REJECTED
```

The current POST operation is effectively a **submit** operation. It creates/updates the application as `PENDING`.

That is not enough for the new eight-step UX where a Chef can:

- fill Step 1
- leave
- return later
- continue from Step 4
- upload documents progressively
- see what is incomplete
- review everything before final submission

## Required backend change

Add a draft state without breaking existing clients.

Recommended:

```text
NOT_STARTED
IN_PROGRESS
PENDING
APPROVED
REJECTED
```

### Recommended APIs

```http
GET  /api/v1/chef/application
PUT  /api/v1/chef/application/draft
POST /api/v1/chef/application/submit
```

Keep the existing POST route temporarily if backward compatibility is required, but introduce a clearly separated final-submit operation.

### GET response must expose

```json
{
  "id": "...",
  "status": "IN_PROGRESS",
  "currentStep": 4,
  "completionPercent": 50,
  "canSubmit": false,
  "missingRequirements": [
    "KITCHEN_PHOTOS",
    "FSSAI",
    "ADDRESS_PROOF"
  ],
  "personal": {},
  "kitchen": {},
  "compliance": {},
  "documents": [],
  "bank": {}
}
```

Do not calculate this separately in each frontend.

### Required behavior

- Draft save must be idempotent.
- Partial fields must be allowed while status is `IN_PROGRESS`.
- Final submit must validate every mandatory requirement.
- Final submit changes state to `PENDING`.
- Rejected applications can return to `IN_PROGRESS` for correction.
- Approved applications remain locked except for explicitly supported post-approval profile changes.
- The response must tell the frontend exactly which section needs correction.

---

# 5. P0 — Personal details: DOB

## Current gap

The current Chef application has no date-of-birth field.

The intended Chef registration UX explicitly includes personal details and DOB.

## Required DB field

Add to Chef application/profile:

```text
date_of_birth DATE
```

## API

Add:

```text
dateOfBirth
```

to the application request/response.

### Validation

Backend must own the final validation.

Frontend may provide immediate validation, but the backend must reject invalid values.

Do not make the frontend responsible for age/compliance decisions.

---

# 6. P0 — FSSAI compliance module

This is the largest current backend gap.

## Current state

There is no dedicated Chef FSSAI entity/API in the current Chef web contract.

The intended UX requires:

### Branch A — Chef already has FSSAI

Chef provides:

- FSSAI number
- FSSAI certificate/document

### Branch B — Chef wants Craves to help apply

Chef chooses:

- Apply with Craves

Craves then creates an application/work item that can be processed by the responsible operations/compliance team.

## Required domain

Create a dedicated FSSAI/compliance record rather than storing the FSSAI number as an arbitrary application string.

Recommended entity:

```text
chef_fssai_record
```

Minimum fields:

```text
id
chef_identity_id
application_id
mode
fssai_number
certificate_document_id
status
rejection_reason
reviewed_by
reviewed_at
created_at
updated_at
```

### Mode

```text
EXISTING_FSSAI
APPLY_WITH_CRAVES
```

### Status

At minimum:

```text
NOT_STARTED
SUBMITTED
UNDER_REVIEW
VERIFIED
REJECTED
```

If the business requires expiry/renewal tracking, add:

```text
valid_from
valid_until
renewal_status
```

Do not add regulatory rules in the frontend. Final regulatory validation must be owned by the backend/compliance workflow.

## APIs

Recommended:

```http
GET  /api/v1/chef/compliance/fssai
PUT  /api/v1/chef/compliance/fssai
POST /api/v1/chef/compliance/fssai/document
POST /api/v1/chef/compliance/fssai/apply-with-craves
```

Admin/compliance:

```http
GET  /api/v1/backoffice/chef-compliance/{applicationId}
POST /api/v1/backoffice/chef-compliance/{recordId}/approve
POST /api/v1/backoffice/chef-compliance/{recordId}/reject
```

## Important

Do not automatically mark FSSAI as verified merely because a number was entered.

The UI needs separate states for:

- number entered
- document uploaded
- submitted
- under review
- verified
- rejected

---

# 7. P0 — Expanded KYC and address proof

## Current state

The current application document contract supports:

```text
APPLICANT_PHOTO
GOVERNMENT_ID_FRONT
GOVERNMENT_ID_BACK
TAX_ID_CARD
AADHAAR_CARD
PAN_CARD
```

But the current application service requires these four:

```text
APPLICANT_PHOTO
GOVERNMENT_ID_FRONT
GOVERNMENT_ID_BACK
TAX_ID_CARD
```

The intended Chef UX needs explicit choices around:

- Aadhaar
- PAN
- Voter ID
- address proof

## Required change

Do not continue using ambiguous `GOVERNMENT_ID_FRONT/BACK` as the only semantic definition.

Add a clear document classification.

Recommended:

```text
IDENTITY
ADDRESS
TAX
PROFILE
FSSAI
KITCHEN
```

and a document type such as:

```text
AADHAAR
PAN
VOTER_ID
OTHER_GOVERNMENT_ID
ADDRESS_PROOF
APPLICANT_PHOTO
FSSAI_CERTIFICATE
```

If Aadhaar/Voter ID is front/back, retain side information separately instead of creating confusing combinations.

## Required response

Every document needs:

```text
id
category
documentType
side
status
uploadedAt
reviewedAt
reviewReason
```

### Status

```text
REQUIRED
UPLOADED
UNDER_REVIEW
APPROVED
REJECTED
```

The frontend should be able to show:

- Required
- Uploaded
- Under review
- Approved
- Replacement required

## Resubmission

Current document replacement is blocked once the Chef application is approved.

That is correct for the current onboarding flow, but a separate post-approval compliance-document maintenance route is required if approved Chefs must later renew/change documents.

---

# 8. P0 — Kitchen photos

## Current gap

The existing Catalog kitchen profile contains:

- kitchen name
- display name
- description
- phone
- email
- address
- coordinates
- status

It does **not** contain a Chef kitchen-photo collection.

The intended onboarding requires kitchen photos showing the real cooking environment, including the overall kitchen and essential cooking/storage areas.

## Ownership

Kitchen media should belong to **Catalog Service**, because Catalog owns the public kitchen/catalog representation.

Do not put kitchen media into User/Chef Service unless architecture explicitly changes ownership.

## Required table

Recommended:

```text
catalog_schema.kitchen_media
```

Fields:

```text
id
kitchen_id
media_type
blob_reference
content_type
file_size_bytes
sort_order
is_primary
status
created_at
updated_at
```

### Media types

Start with product-defined categories such as:

```text
KITCHEN_OVERVIEW
COOKING_AREA
STOVE_AREA
STORAGE_AREA
OTHER
```

The exact mandatory categories should remain configurable rather than hard-coded in the mobile/web UI.

## APIs

```http
GET    /api/v1/kitchens/me/media
POST   /api/v1/kitchens/me/media
PATCH  /api/v1/kitchens/me/media/{mediaId}
DELETE /api/v1/kitchens/me/media/{mediaId}
PUT    /api/v1/kitchens/me/media/order
```

Response:

```json
{
  "id": "...",
  "mediaType": "KITCHEN_OVERVIEW",
  "publicUrl": "https://...",
  "sortOrder": 1,
  "primary": true,
  "status": "ACTIVE"
}
```

## Public projection

Customer-facing kitchen discovery/profile must eventually be able to receive approved kitchen media without exposing:

- blob container
- blob name
- private storage metadata
- identity IDs

---

# 9. P0 — Chef profile photo

## Current gap

The existing applicant photograph is an onboarding document.

That is **not** the same as an editable Chef profile photo.

The current mobile Chef profile explicitly identifies profile-photo upload/remove as unavailable.

## Required API

Recommended User/Chef Service contract:

```http
GET    /api/v1/chef/profile/media
POST   /api/v1/chef/profile/media
DELETE /api/v1/chef/profile/media/{mediaId}
```

Response should expose only the safe public image URL and metadata required by the UI.

Do not reuse the locked KYC applicant-photo endpoint for normal profile editing.

---

# 10. P0 — APIM/client boundary verification

Several backend capabilities exist in source but are not necessarily exposed through the exact frontend/client route required.

This must be checked before creating duplicate backend APIs.

## Existing source-level capabilities to expose/verify

### Kitchen schedule

```http
GET    /api/v1/kitchens/me/schedule
PUT    /api/v1/kitchens/me/schedule
GET    /api/v1/kitchens/me/schedule/overrides/{serviceDate}
PUT    /api/v1/kitchens/me/schedule/overrides/{serviceDate}
DELETE /api/v1/kitchens/me/schedule/overrides/{serviceDate}
```

This already exists in Catalog Service.

### Bank onboarding

```http
GET  /api/v1/chef-onboarding/bank
POST /api/v1/chef-onboarding/bank
```

Already implemented. Do not build another bank API.

### Chef earnings

```text
/api/v1/chef/earnings
```

Backend source exists. The mobile contract currently treats the route as unavailable because an approved mobile APIM operation is not present.

### Chef reviews

Backend review data exists, but the current web Chef workspace does not have a dedicated `/api/chef/reviews` BFF route.

This is a frontend/BFF integration gap, not a reason to duplicate the review backend.

---

# 11. P1 — Chef dashboard aggregate

## Current state

The dashboard can currently obtain its information from multiple backend surfaces.

The desired dashboard needs:

- Chef identity
- verification state
- kitchen status
- accepting-orders state
- today's orders
- today's earnings
- active menu count
- rating
- review count
- action-required items
- onboarding/compliance completion

## Recommended API

```http
GET /api/v1/chef/dashboard
```

Example:

```json
{
  "chef": {
    "displayName": "..."
  },
  "verification": {
    "status": "APPROVED"
  },
  "kitchen": {
    "status": "ACTIVE",
    "acceptingOrders": true,
    "availableNow": true
  },
  "orders": {
    "new": 2,
    "preparing": 3,
    "ready": 1,
    "completedToday": 8
  },
  "earnings": {
    "today": "...",
    "currency": "INR"
  },
  "menu": {
    "activeItems": 12,
    "availableItems": 10
  },
  "rating": {
    "average": 4.8,
    "reviewCount": 120
  },
  "actionsRequired": []
}
```

This should be an aggregation/read model, not cross-service database access.

---

# 12. P1 — Accepting orders must use authoritative availability

The Catalog backend already supports:

- acceptingOrders
- pausedUntil
- pauseReason
- weekly windows
- date overrides
- evaluated availability

The authoritative availability response includes:

```text
kitchenActive
scheduleConfigured
acceptingOrders
paused
openBySchedule
availableNow
```

The Chef dashboard should use this instead of deriving availability locally.

Recommended frontend-facing operation:

```http
GET /api/v1/kitchens/me/schedule
```

and optionally:

```http
GET /api/v1/kitchens/me/availability
```

if a direct evaluated-state endpoint is required.

---

# 13. P1 — Chef order acceptance deadline

## Current state

The database already has:

```text
chef_acceptance_requested_at
chef_acceptance_expires_at
chef_acceptance_initial_recorded_at
```

The acceptance timeout workflow already exists.

## Missing

These fields are not exposed in the Chef `OrderResponse`.

## Required response additions

```text
chefAcceptanceRequestedAt
chefAcceptanceExpiresAt
databaseNow
```

The frontend must calculate the countdown from server timestamps.

Do not use the device clock as the authoritative deadline.

---

# 14. P1 — Chef order status timeline

## Current state

Order Service already writes `order_status_history`.

## Missing

There is no approved Chef-facing history read contract.

## Required API

```http
GET /api/v1/chef/orders/{orderId}/timeline
```

Response:

```json
{
  "events": [
    {
      "status": "PAID",
      "at": "...",
      "actor": "SYSTEM"
    },
    {
      "status": "CHEF_ACCEPTED",
      "at": "...",
      "actor": "CHEF"
    },
    {
      "status": "PREPARING",
      "at": "...",
      "actor": "CHEF"
    }
  ]
}
```

Only expose information authorized for the Chef.

---

# 15. P1 — Customer order note

The Chef order contract currently does not expose the customer's checkout/order note.

If the Chef UX requires a note such as:

```text
Less spicy
No onions
Please pack separately
Birthday order
```

then the backend must:

1. capture the note at checkout
2. store it in the immutable order snapshot
3. expose it in Chef OrderResponse
4. preserve it for audit/history

Recommended field:

```text
customerOrderNote
```

Do not make the Chef fetch the customer's private checkout record directly.

---

# 16. P1 — Delivery information for Chef

Current order statuses already include:

```text
READY_FOR_PICKUP
OUT_FOR_DELIVERY
DELIVERED
```

The Chef UI can therefore display the lifecycle, but a richer delivery panel requires an authorized read model.

If required:

```http
GET /api/v1/chef/orders/{orderId}/delivery
```

Potential safe fields:

```text
deliveryStatus
providerDisplayName
trackingReference
courierAssigned
pickedUpAt
deliveredAt
lastUpdatedAt
```

Do not expose provider credentials or internal delivery integration identifiers.

---

# 17. P1 — Menu management gaps

Core menu CRUD already exists.

Current MenuItem fields already include:

- item name
- description
- category
- food type
- price
- currency
- serves count
- preparation time
- spice level
- package weight
- thermobox requirement
- availability
- status
- images

## Missing/limited capabilities identified by the Chef frontend contract

### Delete/duplicate

No approved delete/duplicate menu-item mutation is currently exposed.

If required:

```http
DELETE /api/v1/kitchens/me/menu-items/{menuItemId}
POST   /api/v1/kitchens/me/menu-items/{menuItemId}/duplicate
```

### Media management

Current menu media supports upload.

Add if required:

```http
DELETE /api/v1/kitchens/me/menu-items/{menuItemId}/images/{imageId}
PUT    /api/v1/kitchens/me/menu-items/{menuItemId}/images/order
PATCH  /api/v1/kitchens/me/menu-items/{menuItemId}/images/{imageId}/primary
```

### Draft workflow

Current MenuItem status supports `DRAFT`.

A separate draft API is not required unless the UX needs autosave/validation beyond the existing MenuItemRequest.

---

# 18. P1 — Chef reviews

## Current state

Review backend capability exists.

The customer review/rating system is not missing at the service level.

## Frontend integration needed

Recommended safe Chef-facing endpoint:

```http
GET /api/v1/chef/reviews
```

or an authenticated BFF over the existing review backend.

Response:

```json
{
  "summary": {
    "averageRating": 4.8,
    "reviewCount": 120,
    "distribution": {
      "5": 100,
      "4": 15,
      "3": 4,
      "2": 1,
      "1": 0
    }
  },
  "reviews": []
}
```

Chef reviews should be read-only.

---

# 19. P1 — Notifications

## Current state

The platform already has an in-app notification system and Chef-specific events such as document rejection/approval notifications.

## Missing for a complete Chef settings experience

A dedicated Chef notification-preference contract.

Recommended:

```http
GET /api/v1/chef/preferences/notifications
PUT /api/v1/chef/preferences/notifications
```

Categories can include:

```text
NEW_ORDER
ORDER_STATUS
PAYMENT
PAYOUT
DOCUMENT_REVIEW
FSSAI
SUBSCRIPTION
SYSTEM
```

Do not make notification preferences part of the order database.

---

# 20. P1 — Chef business profile metadata

Current kitchen profile contains:

- kitchen name
- display name
- description
- contact
- address
- location
- status

The mobile Chef business-information contract identifies missing:

- cuisine metadata
- service-area management
- complete approved-Chef document maintenance
- payout setup status

## Cuisine

If required by product:

```http
GET /api/v1/chef/profile/cuisines
PUT /api/v1/chef/profile/cuisines
```

Use a controlled taxonomy rather than arbitrary frontend strings.

## Service area

If Chef-specific service-area control is required, define it explicitly.

Do not confuse:

- kitchen GPS location
- discovery radius
- delivery serviceability
- Chef-configured service area

These are different concepts.

---

# 21. Payout/bank status — important distinction

## Already implemented

Bank onboarding is already a real backend capability.

Current contract:

```http
GET  /api/v1/chef-onboarding/bank
POST /api/v1/chef-onboarding/bank
```

It provides masked bank status and automatic validation.

## Existing payout infrastructure

Integration Service already has Chef:

- balance
- payable
- payout allocation
- payout instruction
- manual withdrawal path
- automatic payout worker
- provider outcome handling
- holds
- reconciliation safeguards

## What is actually missing

The mobile Chef contract does not currently have an approved APIM/client contract for all of these surfaces.

Therefore:

**Do not rebuild the payout ledger.**

Instead:

1. expose the required Chef-safe read operations through APIM
2. expose masked bank destination/setup state
3. expose payout history
4. expose withdrawal eligibility
5. preserve all existing financial authorization/idempotency rules

If the product does not want Chef-initiated withdrawals, do not expose a withdrawal button merely because the backend contains an internal withdrawal method.

---

# 22. P2 — Chef platform subscription

Do not confuse two different concepts.

### Existing and implemented

Chef-created **meal subscription plans**:

```text
/chef/subscription-plans
/chef/subscription-plans/{planId}/schedule
/chef/subscription-capacity
```

These are for customers subscribing to the Chef's meals.

### Separate missing capability

Chef platform membership/subscription.

The mobile contract currently marks this as blocked.

If Craves wants:

- Chef membership tiers
- subscription fee
- billing
- membership status
- renewal
- cancellation
- entitlement checks

then this requires a separate product/backend contract.

Do not reuse customer meal-subscription APIs for this.

---

# 23. P2 — Chef preferences

The mobile Chef preferences contract is currently blocked.

If the Chef Settings screen is required, add:

```http
GET /api/v1/chef/preferences
PUT /api/v1/chef/preferences
```

Potential state categories:

```text
language
notification preferences
order sound
order alert behavior
appearance
timezone
```

Only persist preferences that the product actually supports.

---

# 24. P2 — Chat/contact

Current order ownership allows authorized delivery contact data, but there is no separate Chef customer-chat contract.

If chat is required:

```text
conversation
participants
order binding
message
message status
createdAt
readAt
support audit
```

Recommended APIs:

```http
GET  /api/v1/chef/orders/{orderId}/conversation
POST /api/v1/chef/orders/{orderId}/conversation/messages
```

Do not expose raw customer identity IDs to the UI.

---

# 25. Backend ownership map

| Capability | Owner |
|---|---|
| Authentication | Auth Service |
| Chef application | User/Chef Service |
| KYC/compliance | User/Chef Service / Compliance boundary |
| FSSAI | Compliance/User-Chef domain |
| Chef identity/profile | User/Chef Service |
| Kitchen profile | Catalog Service |
| Kitchen schedule | Catalog Service |
| Kitchen media | Catalog Service |
| Menu | Catalog Service |
| Menu media | Catalog Service |
| Orders | Order Service |
| Order timeline | Order Service |
| Delivery lifecycle | Delivery/Order integration |
| Earnings | Integration/Finance |
| Bank onboarding | User/Chef + Integration |
| Payout | Integration/Finance |
| Meal subscriptions | Subscription Service |
| Chef reviews | Order/Review domain |
| Notifications | Notification domain |
| Chef preferences | User/Chef or dedicated preferences domain |

**Do not bypass service ownership by querying another service's database directly.**

---

# 26. Security requirements

Every Chef endpoint must:

- require authenticated identity
- require CHEF role where appropriate
- verify ownership
- never trust a kitchenId supplied by the browser
- never trust a chefId supplied by the browser
- use authenticated identity as the source of ownership
- use idempotency for money/order mutations
- protect document URLs
- never return blob storage credentials
- never return private provider credentials
- return only the minimum customer contact data required for fulfillment
- audit compliance decisions
- audit payout mutations
- keep admin-only review operations separate from Chef operations

---

# 27. APIM requirements

For every new operation:

1. Define OpenAPI contract.
2. Add exact APIM operation.
3. Apply authentication policy.
4. Preserve role/ownership enforcement in the service.
5. Do not rely on APIM alone for authorization.
6. Verify anonymous requests fail.
7. Verify CUSTOMER cannot access Chef operations.
8. Verify Chef A cannot access Chef B.
9. Verify admin-only operations remain admin-only.
10. Verify no sensitive headers/body diagnostics are enabled.

New/changed APIM areas:

```text
Chef application
Chef compliance/FSSAI
Kitchen media
Chef profile media
Chef dashboard
Chef order timeline
Chef reviews
Chef notification preferences
Chef analytics
Chef financial read surfaces
Chef platform subscription (if approved)
```

---

# 28. Database migration requirements

Do not modify existing production columns destructively.

Use additive Flyway migrations.

Expected new areas:

```text
chef_application
    + date_of_birth
    + onboarding/draft state

chef_fssai_record
chef_compliance_document
chef_profile_media
catalog_schema.kitchen_media
chef_notification_preferences
chef_dashboard/read-model tables if needed
chef_analytics/read-model tables if needed
```

For existing KYC:

- preserve old document rows
- introduce the new semantic type/category model
- provide a controlled migration/backfill
- do not silently reinterpret existing documents

---

# 29. Event/notification requirements

The backend should publish events for important Chef lifecycle changes.

Minimum useful events:

```text
CHEF_APPLICATION_SUBMITTED
CHEF_APPLICATION_REJECTED
CHEF_APPLICATION_APPROVED

CHEF_DOCUMENT_UPLOADED
CHEF_DOCUMENT_APPROVED
CHEF_DOCUMENT_REJECTED

CHEF_FSSAI_SUBMITTED
CHEF_FSSAI_APPROVED
CHEF_FSSAI_REJECTED

CHEF_ORDER_RECEIVED
CHEF_ORDER_ACCEPTED
CHEF_ORDER_REJECTED
CHEF_ORDER_READY

CHEF_PAYOUT_CREATED
CHEF_PAYOUT_PROCESSING
CHEF_PAYOUT_PAID
CHEF_PAYOUT_FAILED
```

Every event must be idempotent.

---

# 30. Backend acceptance tests

## Onboarding

- Create new Chef.
- Save Step 1 only.
- Logout.
- Login.
- Resume Step 1.
- Complete Step 2.
- Resume Step 2.
- Upload documents independently.
- Reject one document.
- Replace only rejected document.
- Keep approved documents unchanged.
- Submit only when all mandatory requirements are complete.
- Verify email gate.
- Verify approved application cannot be resubmitted.
- Verify rejected application can be corrected.

## FSSAI

- Existing FSSAI number only -> incomplete.
- Number + certificate -> ready for review.
- Apply-with-Craves -> creates compliance work item.
- Admin approve -> VERIFIED.
- Admin reject -> REJECTED with reason.
- Chef sees exact action required.
- Unauthorized Chef cannot view another Chef's FSSAI.

## Kitchen media

- Upload supported media.
- Reject unsupported content.
- Enforce server size limit.
- Reorder.
- Set primary.
- Delete.
- Verify ownership.
- Verify public projection does not expose private storage metadata.

## Orders

- Chef sees only own orders.
- Acceptance countdown uses server expiry.
- Expired order cannot be accepted.
- Accept is idempotent.
- Reject is idempotent.
- Ready-for-pickup is legal only in correct state.
- Timeline matches status history.
- Customer note is immutable from order snapshot.

## Finance

- Chef sees only own earnings.
- Bank details remain masked.
- Payout authorization remains server-side.
- Withdrawal is idempotent.
- Duplicate request key cannot create a second payout.
- Failed payout does not silently become paid.

---

# 31. Recommended implementation order for backend team

### Phase 1 — unblock Chef onboarding

1. `IN_PROGRESS` application/draft model
2. DOB
3. onboarding completion/missing-requirement response
4. FSSAI module
5. expanded KYC/address-proof semantics
6. kitchen media
7. Chef profile media
8. APIM publication

### Phase 2 — complete Chef workspace

9. dashboard aggregate
10. order deadline response
11. order timeline
12. customer order note
13. Chef reviews read contract
14. notification preferences
15. menu media/delete/reorder
16. cuisine metadata if approved

### Phase 3 — advanced Chef platform

17. analytics
18. payout/mobile APIM surfaces
19. service-area management
20. preferences
21. delivery tracking
22. chat/support
23. Chef platform membership, only if product approves it

---

# 32. What the backend team should NOT build again

Do not duplicate these existing capabilities:

- OTP authentication
- email verification
- Chef role
- Chef application basic CRUD
- KYC storage infrastructure
- document admin review foundation
- kitchen profile
- kitchen weekly schedule
- kitchen availability
- menu CRUD
- menu availability
- menu image upload
- Chef order list/detail
- Chef accept/reject
- Chef ready-for-pickup
- acceptance timeout
- Chef earnings ledger
- automatic bank onboarding
- payout ledger
- meal subscription plans
- meal subscription schedule
- subscription capacity
- notification inbox
- review backend

Extend these where necessary instead of creating parallel versions.

---

# 33. Final backend gap list

## MUST BUILD

- [ ] Chef onboarding draft/resume state
- [ ] DOB
- [ ] onboarding completion/missing requirements API
- [ ] FSSAI entity + APIs
- [ ] FSSAI document storage/review workflow
- [ ] explicit KYC/address-proof semantics
- [ ] Voter ID support if selected by product
- [ ] address-proof support
- [ ] kitchen media entity + APIs
- [ ] Chef profile media entity + APIs
- [ ] required APIM operations

## SHOULD BUILD

- [ ] Chef dashboard aggregate
- [ ] Chef analytics
- [ ] order acceptance expiry in response
- [ ] order timeline endpoint
- [ ] customer order note
- [ ] Chef review read contract/BFF
- [ ] Chef notification preferences
- [ ] menu image delete/reorder/primary
- [ ] menu delete/duplicate if required
- [ ] cuisine taxonomy if required
- [ ] payout/bank status APIM for mobile

## ONLY IF PRODUCT APPROVES

- [ ] Chef service-area management
- [ ] Chef platform membership
- [ ] Chef-to-customer chat
- [ ] delivery tracking panel
- [ ] dedicated support tickets
- [ ] advanced Chef preferences

---

# 34. Definition of backend-complete

The Chef backend should be considered complete for the intended UX only when:

```text
LOGIN
  ↓
PHONE VERIFIED
  ↓
EMAIL VERIFIED
  ↓
CHEF DRAFT CAN RESUME
  ↓
PERSONAL DETAILS COMPLETE
  ↓
KITCHEN COMPLETE
  ↓
LOCATION COMPLETE
  ↓
KITCHEN PHOTOS COMPLETE
  ↓
FSSAI COMPLETE
  ↓
KYC + ADDRESS PROOF COMPLETE
  ↓
BANK STATUS COMPLETE
  ↓
REVIEW API SAYS "READY TO SUBMIT"
  ↓
SUBMIT
  ↓
ADMIN REVIEW
  ↓
APPROVED
  ↓
CHEF DASHBOARD
  ↓
ACCEPT ORDERS
  ↓
MENU
  ↓
ORDERS
  ↓
PREPARING
  ↓
READY
  ↓
DELIVERY
  ↓
EARNINGS
  ↓
PAYOUT
```

At every stage the backend must be the source of truth for state, ownership, validation and authorization.

---

## Source files reviewed

Key frontend/backend sources used for this audit include:

```text
apps/customer-web-next/src/app/chef/**
apps/customer-web-next/src/app/api/chef/**
apps/customer-web-next/src/components/chef-*.tsx
apps/customer-web-next/src/lib/chef-*.ts

services/user-chef-service/**
services/catalog-service/**
services/order-service/**
services/integration-service/**
services/subscription-service/**

contracts/openapi/chef-bank-onboarding-v1.yaml
docs/finance/BANK_ONBOARDING.md
docs/finance/CHEF_LEDGER_IMPLEMENTATION.md
docs/handover/2026-08-05-chef-complete-uiux.md
```

This document is intended to be the backend implementation checklist for the Chef UX branch.
