# Chef Backend Connections Implementation Plan

> **Pipelines changed 27 Oct 2026.** Azure DevOps pipeline #14 `Craves (14)` named below is turned off on purpose: do not run, re-enable or recreate it. Use #23 `Craves-Chef-Onboarding-Release` instead (built from GitHub `main`). Current list: `docs/runbooks/production-environment.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the redesigned chef app every server capability it shows: publish the existing chef routes on the mobile gateway and add the missing fields and endpoints.

**Architecture:** Additive changes only, one task per service, each with its own Flyway migration and tests; one APIM script publishes every route the chef app calls on `apim-craves-prodlow-kmqgfy`. Nothing is deployed by this plan: deploys and the APIM script are run by the user (production writes are blocked for Claude); Task 7 writes their exact runbook.

**Tech Stack:** Java 21, Spring Boot, Flyway, Maven (JDK `C:\Program Files\Java\jdk-21`, Maven under `C:\Program Files\Apache\maven`), Azure CLI + APIM management REST (bash scripts).

**Spec:** `docs/superpowers/specs/2026-10-13-chef-app-api-additions.md` (field names, paths, rules). Design context: the approved chef redesign board `C:\Users\chakr\Downloads\Craves-Build-platform-KUSHIRAVI-app-build\design-review\chef-workspace\`.

## Global Constraints

- Work in `C:\mchefapi`, branch `feat/chef-app-backend` from `origin/main` 1ddfd1c1f. Do not push; do not run anything against Azure.
- Additive and backward compatible: existing clients (craves.in web, admin, current app 1.30.0) keep working unchanged. New request fields are optional; an absent/null field keeps the stored value.
- Each service's next free Flyway version is found from `src/main/resources/db/migration` on this branch (order-service is at V36). Never edit an applied migration.
- Do not touch `services/auth-service` or `services/integration-service`: production runs patches that are not on main (central OTP; Pidge coordinate routing + Borzo handoff). Courier data for `deliveryPartner` is stored by order-service when the delivery event carries it; integration sending it is out of scope.
- Every task: `mvn -q -pl services/<svc> -am test` (or the service's own `mvnw`) green before reporting.
- Chef endpoints authorize exactly like their neighbours in the same controller (CHEF role, own kitchen only).

## Review Focus

1. Old web PUT `/kitchens/me` without the new fields → cuisines/areas/social links/photos untouched. Test in Task 3.
2. `handed-over` called twice or in the wrong status → idempotent 200 the second time; 409 `ORDER_STATUS_CONFLICT` outside READY_FOR_PICKUP. Test in Task 2.
3. Archived dish → absent from public kitchen menus, discovery, chef list, and rejected at checkout. Test in Task 3.
4. `role` param absent → notification endpoints behave exactly as today. Test in Task 4.
5. Checkout note with 501 chars or only whitespace → trimmed; >500 rejected 400 with the existing validation shape. Test in Task 2.

---

### Task 1: Publish chef app routes on the mobile gateway

**Files:**
- Create: `scripts/apim/configure-chef-app-routes-apim.sh`, `azure-pipelines-chef-app-routes-apim.yml`
- Test: `scripts/release/validate-apim-assets.sh` passes; add the new script to whatever list that validator reads.

**Interfaces:** Model on `scripts/apim/configure-support-assistant-apim.sh` (kmqgfy, `CONFIRM_APIM_WRITE=true`, subscription/tenant guard, `configure_api()` + `operation()` helpers with `rewrite-uri`, Bearer-presence check policy, `Cache-Control: no-store`, read-back + unauthenticated probe expecting 401). Container apps: catalog `ca-craves-catalog-service-prodlo`, order `ca-craves-order-service-prodlow`, user-chef `ca-craves-user-chef-service-prod`, notification `ca-craves-notification-service-p`, subscription (find its FQDN in existing subscription APIM scripts). Add operations to the API that already owns each path prefix (find by `az apim api list --query "[?path=='…']"`; create only for a new prefix). Routes: every route in the spec's last section plus the new ones (`POST /chef/orders/{id}/handed-over`, `POST|DELETE /kitchens/me/photos…`, `GET|PUT /kitchens/me/settings`, `DELETE /kitchens/me/menu-items/{menuItemId}`). Referral routes are excluded (the live referral API points at the wrong backend per `docs/referrals/CHEF_ACTIVATION_20261012.md`; list them in the script header as follow-up).

- [ ] **Step 1:** Write the script with a `DRY_RUN=true` mode that prints every API/operation/backend it would write; run `DRY_RUN=true bash scripts/apim/configure-chef-app-routes-apim.sh` → prints the full route table, makes no `az` call.
- [ ] **Step 2:** Pipeline yml copied from `azure-pipelines-support-assistant.yml` shape (manual, confirm boolean default false). Run `bash scripts/release/validate-apim-assets.sh` → pass.
- [ ] **Step 3:** Commit `feat(apim): publish chef app routes for mobile on kmqgfy`.

### Task 2: Order service — deadline, note, history, partner, handed over

**Files:** `services/order-service/...`: `web/ApiDtos.java` (OrderResponse), `OrderService.java` (mapping at ~693-714), `web/ChefOrderController.java`, checkout persistence for `CheckoutRequest.note`, delivery-status consumer (`DeliveryStatusModels.java` + its handler), new migration `V37__chef_order_details.sql` (`orders.customer_note varchar(500)`, `orders.delivery_partner_name/phone/photo_url`, `orders.delivery_partner_pickup_eta_at timestamptz`, `orders.chef_handed_over_at timestamptz` — use the real table name). Tests next to the existing order-service tests.

**Interfaces:** exactly the spec's order section. `statusHistory` only on `GET /chef/orders/{id}`. `DeliveryStatusChangedData` gains optional `courierName`, `courierPhone`, `courierPhotoUrl`, `pickupEtaAt`; when present they overwrite the stored partner fields. `POST /api/v1/chef/orders/{id}/handed-over` → 200 OrderResponse; 409 `ORDER_STATUS_CONFLICT` unless READY_FOR_PICKUP (or already handed over → 200, unchanged timestamp).

- [ ] **Step 1:** Failing tests: chef detail JSON contains `chefAcceptanceExpiresAt` equal to the stored expiry; checkout with note "  Less spicy  " stores and returns "Less spicy"; 501-char note → 400; detail `statusHistory` ordered oldest-first; delivery event with courier fields fills `deliveryPartner`; event without them leaves it unchanged; handed-over twice → same timestamp; handed-over in PREPARING → 409; customer-facing responses unchanged (no `deliveryPartner` phone leaks to other chefs — kitchen ownership check reused).
- [ ] **Step 2:** Implement; `mvn test` for order-service → green.
- [ ] **Step 3:** Commit `feat(order): chef order deadline, customer note, status history, delivery partner, handed over`.

### Task 3: Catalog — kitchen photos, cuisines, areas, social links, settings, dish archive

**Files:** `services/catalog-service/...`: `web/ApiDtos.java` (KitchenProfileRequest/Response, `MenuItemStatus` + `ARCHIVED`), `web/KitchenController.java`, `CatalogService.java`, `MediaStorageService.java` (`uploadKitchenImage(kitchenId, kind, file)` → blob `public/kitchens/{kitchenId}/{kind}/{uuid}-{name}`, same optimise/size rules as dishes), new migration (`kitchen.chef_photo_url`, `kitchen.kitchen_photo_url`, `kitchen.cuisines text[]` or jsonb, `kitchen.service_areas`, `kitchen.social_links jsonb`, `kitchen.auto_accept_orders boolean default false`, `kitchen.default_prep_minutes int null`), every query that lists menu items for customers/discovery/chef excludes `ARCHIVED`; internal kitchen API used by order-service exposes `autoAcceptOrders` + `defaultPrepMinutes` (find it via `scripts/apim/configure-catalog-internal-kitchen-apim.sh`).

**Interfaces:** exactly the spec's catalog section; cuisines/serviceAreas: ≤ 10 entries, each 1–40 chars trimmed; social links must be `https://` URLs ≤ 200 chars; `defaultPrepMinutes` 5–120.

- [ ] **Step 1:** Failing tests: old-shape PUT keeps stored cuisines/areas/social/photos; photo upload stores and returns `kitchenPhotoUrl`; DELETE photo clears it; settings round-trip and validation (4 → 400, 121 → 400); DELETE dish → 204, item absent from chef list and public menu, checkout of it rejected; another chef's dish → 404.
- [ ] **Step 2:** Implement; catalog `mvn test` green.
- [ ] **Step 3:** Commit `feat(catalog): kitchen photos, cuisines, areas, social links, chef settings, dish archive`.

### Task 4: Notification service — role filter

**Files:** `services/notification-service/...`: `api/AppNotificationController.java`, `NotificationRepository` (`findAppNotices`, `findAppNoticesPage`, unread count, read-all), tests.

- [ ] **Step 1:** Failing tests: identity with one CHEF and one CUSTOMER notice → `role=CHEF` returns only the chef one on list, page, unread-count; `read-all?role=CHEF` leaves the customer one unread; no `role` → both (today's behaviour); invalid role → 400.
- [ ] **Step 2:** Implement (`AND recipient_role = :role` when present); tests green.
- [ ] **Step 3:** Commit `feat(notification): optional role filter for in-app notifications`.

### Task 5: Subscription service — active subscriber count

**Files:** `services/subscription-service/...` chef plan list/detail responses + repository count query; tests.

- [ ] **Step 1:** Failing test: plan with 2 ACTIVE, 1 PAUSED, 1 CANCELLED subscriptions → `activeSubscriberCount` 2 (decide PAUSED from the service's own status meaning and state it in the test name).
- [ ] **Step 2:** Implement with one grouped count query (no N+1); tests green.
- [ ] **Step 3:** Commit `feat(subscription): active subscriber count on chef plans`.

### Task 6: Order service — auto-accept

**Files:** `services/order-service/...` the place an order enters `CHEF_ACCEPTANCE_PENDING` (`ChefAcceptanceService` / initial notification service), catalog internal client; tests.

**Interfaces:** when the kitchen's `autoAcceptOrders` is true, accept immediately through the same code path as `POST /chef/orders/{id}/accept` with prep time = order's computed prep time, else `defaultPrepMinutes`, else 15. Catalog unreachable → leave the order pending (never fail checkout). Chef still gets the new-order notification, with title "New order accepted automatically".

- [ ] **Step 1:** Failing tests: auto-accept on → status CHEF_ACCEPTED with prep time from dishes; catalog error → stays pending; off → pending.
- [ ] **Step 2:** Implement; order-service tests green.
- [ ] **Step 3:** Commit `feat(order): kitchens can auto-accept orders`.

### Task 7: Release runbook

**Files:** Create `docs/release/2026-10-13-chef-app-backend-runbook.md`.

Content: per service, in order (catalog → notification → subscription → order → APIM script): the Cloud Shell single-line commands from the repo's working route (`az acr build -r cravesrm09prodlow6bf632 …`, `deploy-single-service-preserve-runtime.sh` with preflight, except order-service which uses `az containerapp update --image` because of its plain secrets), the migration each applies, the rollback (previous image tag lookup command), and a smoke check (curl through api.craves.in expecting 401 unauthenticated, then the app). Catalog may instead go through the `Craves (14)` pipeline with `operation=catalog`.

- [ ] **Step 1:** Write it; every command single-line; commit `docs(release): chef app backend runbook`.
