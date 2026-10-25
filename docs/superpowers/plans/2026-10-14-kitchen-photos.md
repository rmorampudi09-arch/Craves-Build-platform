# Kitchen Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registration kitchen photos become public on approval, chefs can no longer replace or remove them, and customers see them as a kitchen-page slideshow and as the lead images on the Chefs (Discover) cards.

**Architecture:** user-chef-service serves an approved applicant's two kitchen photos on a new internal route; catalog-service pulls them into two public photo slots (once per kitchen, after creation and at start-up), enforces the lock, and returns `kitchenPhotoUrls`. The mobile app reads `kitchenPhotoUrls` on the kitchen page, Discover and the chef's Kitchen details.

**Tech Stack:** Java 21 / Spring Boot / JdbcTemplate / Flyway / Azure Blob (both services); React Native + TypeScript + zod + TanStack Query + Jest (app).

**Spec:** `docs/superpowers/specs/2026-10-14-kitchen-photos-design.md`

## Global Constraints

- Backend worktree `C:\mavmain`, branch `feat/kitchen-photos` from main `0d3f1912d`. Maven: `JAVA_HOME="C:\Program Files\Java\jdk-21"`, mvn at `C:\Program Files\Apache\maven\mvn\bin`. Database tests run only in GitHub Actions (they assert `GITHUB_ACTIONS`); write them, CI runs them.
- App worktree: create at task 5 from the latest app head that is installed or being built (ask the order-screens session first; today `C:\mdc2` `feat/chef-face-everywhere` plus their 1.33.2 fix). Never build in `C:\mdc` or `C:\mdc2`; use a new worktree `C:\mkp` with its own `npm ci`.
- Only `KITCHEN_PHOTO_1` and `KITCHEN_PHOTO_2` ever leave user-chef-service. Never ID proofs, FSSAI or any other document type.
- Slot 1 = column `kitchen_photo_url`, slot 2 = column `kitchen_photo_2_url`. `kitchenPhotoUrls` = non-null slots in slot order.
- Error code `KITCHEN_PHOTOS_LOCKED` (HTTP 409), message exactly: `Kitchen photos can't be changed. To change one, contact Craves support.`
- user-chef internal header `X-Craves-Internal-Secret` (checked by `InternalRequestAuthorizer`); catalog internal header `X-Craves-Internal-Key` (`InternalCatalogAuthorizer.HEADER_NAME`).
- New catalog settings: `craves.user-chef.internal-base-url: ${CRAVES_USER_CHEF_INTERNAL_BASE_URL:}` and `craves.user-chef.internal-secret: ${CRAVES_USER_CHEF_INTERNAL_SECRET:}`. Blank = import disabled (log once, never throw).
- Imported photos: content type `image/jpeg` or `image/png` only, at most 10 MiB (user-chef's limit). Stored through `MediaStorageService`'s optimiser at `public/kitchens/{kitchenId}/kitchen/{uuid}-registration-{slot}.{jpg|png}`.
- App copy: tiles "Overall kitchen" and "Cooking setup"; locked message as above.

## Review Focus

- An approved application whose kitchen photo document was later removed or rejected: that slot imports nothing (task 1 test `skipsRemovedAndRejectedPhotos`).
- user-chef unreachable or 5xx while a kitchen is created: the kitchen is still created and stays un-imported for the next start (task 3 test `failedFetchLeavesKitchenUnimported`).
- A chef with a self-uploaded slot-1 photo and approved registration photos: registration replaces it and the old blob is deleted after commit (task 3 test `registrationReplacesChefUpload`).
- Old apps (1.31-1.33) still call upload/delete: upload into a full kitchen and every delete get 409 `KITCHEN_PHOTOS_LOCKED` (task 2 tests).
- Two concurrent uploads into one empty slot: the row lock serialises them, the second fills slot 2 or gets 409 (task 2 test `uploadsFillSlotsInOrderThenLock`).

---

### Task 1: user-chef-service internal route for approved kitchen photos

**Files:**
- Create: `services/user-chef-service/src/main/java/in/craves/userchef/web/InternalChefKitchenPhotoController.java`
- Create: `services/user-chef-service/src/main/java/in/craves/userchef/service/RegistrationKitchenPhotoService.java`
- Test: `services/user-chef-service/src/test/java/in/craves/userchef/web/InternalChefKitchenPhotoControllerTest.java`
- Test: add cases to `services/user-chef-service/src/test/java/in/craves/userchef/onboarding/ChefOnboardingDatabaseTest.java`
- Modify: `services/user-chef-service/README.md` (one line under the internal routes)

**Interfaces:**
- Produces: `GET /internal/v1/chef-kitchen-photos/{slot}?identityId={uuid}` → 200 body = image bytes, `Content-Type` = stored type, `Cache-Control: no-store`; 404 `KITCHEN_PHOTO_NOT_FOUND`; 400 when slot is not 1 or 2; 401/403 per `InternalRequestAuthorizer.requireValid`.
- Produces: `Optional<BlobDocumentStorageService.StoredDocumentBytes> RegistrationKitchenPhotoService.approvedKitchenPhoto(UUID identityId, int slot)`.

- [ ] **Step 1: Write failing controller tests** (plain JUnit + Mockito, controller called directly like other web unit tests): `rejectsMissingSecret` (authorizer throws → no service call), `returnsPhotoBytesWithStoredTypeAndNoStore` (asserts body bytes, `image/png`, `no-store`), `notFoundWhenServiceEmpty` (ApiException code `KITCHEN_PHOTO_NOT_FOUND`, status 404), `rejectsSlotThree` (400, no service call).
- [ ] **Step 2: Run** `mvn -f services/user-chef-service/pom.xml test -Dtest=InternalChefKitchenPhotoControllerTest` → FAIL (class missing).
- [ ] **Step 3: Implement** the controller (`@RequestMapping("/internal/v1/chef-kitchen-photos")`, same shape as `InternalCustomerAddressController`) and the service. The service query: newest `chef_application` row for `identity_id` with `status='APPROVED'`, joined to `chef_kyc_document` on `application_id` with `document_type='KITCHEN_PHOTO_'||slot`, `removed_at IS NULL`, `status <> 'REJECTED'`; then `BlobDocumentStorageService.downloadKycDocument(container, blobName, originalFileName, contentType, fileSizeBytes)`.
- [ ] **Step 4: Add DB tests** in `ChefOnboardingDatabaseTest`: `servesApprovedApplicantsKitchenPhoto` (approve the fixture application, expect slot 1 bytes), `hidesPhotosOfPendingApplication`, `skipsRemovedAndRejectedPhotos`, `neverServesNonKitchenDocuments` (an `FSSAI_LICENSE` row for the same application is not reachable through any slot).
- [ ] **Step 5: Run** the controller test → PASS; `mvn -f services/user-chef-service/pom.xml test` → no new failures (DB tests skip locally).
- [ ] **Step 6: Commit** `feat(user-chef): internal route serves an approved chef's two kitchen photos`.

### Task 2: catalog photo slots, lock and support clear

**Files:**
- Create: `services/catalog-service/src/main/resources/db/migration/V10__kitchen_photo_slots.sql`
- Modify: `web/ApiDtos.java` (`KitchenProfileResponse`, `PublicKitchenSummaryResponse`), `web/DiscoveryDtos.java` (`NearbyKitchenSummaryResponse`), `service/CatalogService.java` (row mappers ~574/605, `uploadKitchenPhoto`, `deleteKitchenPhoto`, `setKitchenPhoto`), `service/NearbyDiscoveryService.java` (~224/562), `web/PublicCatalogController.java` (sanitisers ~97/128), `web/NearbyDiscoveryController.java` (~139), `web/KitchenController.java` (cache invalidation), `web/InternalCatalogController.java`, `service/MediaStorageService.java`
- Test: `web/KitchenControllerChefApiTest.java`, `web/PublicCatalogControllerPrivacyTest.java`, `web/NearbyFinanceCacheTest.java` (constructor arity), `service/ChefCatalogDatabaseTest.java`

**Interfaces:**
- Produces: column `kitchen_profile.kitchen_photo_2_url TEXT`, `kitchen_profile.kitchen_photos_imported_at TIMESTAMPTZ` (V10, `SET LOCAL lock_timeout = '5s'`, `ADD COLUMN IF NOT EXISTS`).
- Produces: `List<String> kitchenPhotoUrls` as a new record component directly after `kitchenPhotoUrl` in `KitchenProfileResponse`, and as the last component of `PublicKitchenSummaryResponse` and `NearbyKitchenSummaryResponse`. Never null (empty list).
- Produces: `CatalogService.clearKitchenPhotoSlot(UUID kitchenId, int slot)` and `DELETE /api/v1/catalog/internal/kitchens/{kitchenId}/photos/{slot}` (internal key) → 204.
- Produces: `MediaStorageService.storeKitchenImage(UUID kitchenId, String fileName, byte[] data, String contentType) -> StoredMedia` (folder `public/kitchens/{kitchenId}/kitchen/`, goes through `store`).

- [ ] **Step 1: Write failing tests.** `KitchenControllerChefApiTest`: `deleteKitchenPhotoIsLocked` (409 `KITCHEN_PHOTOS_LOCKED`, exact message); `internalClearRequiresKey` (no key → 401/403); `internalClearReturns204`. `ChefCatalogDatabaseTest`: `uploadsFillSlotsInOrderThenLock` (first upload → slot 1, second → slot 2, third → 409, `kitchenPhotoUrls` has 2 entries in order); `clearSlotEmptiesItAndDeletesBlobAfterCommit` (verify `media.deleteByPublicUrl(oldUrl)`); `chefPhotoStillWorks` (setChefAvatar unaffected). `PublicCatalogControllerPrivacyTest`: sanitised kitchen and list keep `kitchenPhotoUrls`.
- [ ] **Step 2: Run** `mvn -f services/catalog-service/pom.xml test -Dtest=KitchenControllerChefApiTest,PublicCatalogControllerPrivacyTest` → FAIL.
- [ ] **Step 3: Implement.** V10 migration; DTO components and every constructor call (listed above, plus tests); selects add `kp.kitchen_photo_2_url`; `uploadKitchenPhoto(KITCHEN)` locks the row (`FOR UPDATE`), writes the first null slot, else throws `ApiException.conflict("KITCHEN_PHOTOS_LOCKED", <message>)`; `deleteKitchenPhoto(KITCHEN)` throws the same; `KitchenController.uploadPhoto` invalidates discovery after success; internal clear sets the slot null and deletes the old blob after commit, then invalidates discovery.
- [ ] **Step 4: Run** `mvn -f services/catalog-service/pom.xml test` → PASS (DB tests skip locally).
- [ ] **Step 5: Commit** `feat(catalog): two kitchen photo slots, locked for chefs, cleared by support`.

### Task 3: catalog imports registration photos

**Files:**
- Create: `config/UserChefClientProperties.java` (`@ConfigurationProperties(prefix = "craves.user-chef")`: `internalBaseUrl`, `internalSecret`)
- Create: `service/UserChefKitchenPhotoClient.java`
- Create: `service/KitchenPhotoImporter.java`
- Modify: `resources/application.yml` (settings from Global Constraints), `service/CatalogService.java` (`upsertMyKitchen`: after commit of a newly inserted kitchen, `importer.importInBackground(kitchenId)`), `README.md` (settings + route), `docs/release/2026-10-13-chef-app-backend-runbook.md` (new "Kitchen photos" section, see step 6)
- Test: `service/KitchenPhotoImporterTest.java`, `service/UserChefKitchenPhotoClientTest.java`, add to `service/ChefCatalogDatabaseTest.java`

**Interfaces:**
- Consumes: task 1 route; task 2 columns, `storeKitchenImage`, `kitchenPhotoUrls`.
- Produces: `Optional<UserChefKitchenPhotoClient.Photo> fetch(UUID identityId, int slot)` where `record Photo(byte[] data, String contentType)`; empty on 404; throws `IllegalStateException` on unconfigured, network error or non-404 failure.
- Produces: `KitchenPhotoImporter.importKitchen(UUID kitchenId) -> boolean changed`, `importInBackground(UUID kitchenId)`, and an `@EventListener(ApplicationReadyEvent.class)` backfill that runs `importKitchen` in one background thread for every kitchen with `kitchen_photos_imported_at IS NULL` (oldest first, at most 500 per start).

- [ ] **Step 1: Write failing tests.** `UserChefKitchenPhotoClientTest` (MockRestServiceServer or a stub `RestClient`): sends `X-Craves-Internal-Secret` and `identityId`; 404 → empty; 500 → throws; blank settings → throws without a request; content type outside jpeg/png or body over 10 MiB → throws. `KitchenPhotoImporterTest` (mocked client, media, JdbcTemplate or the DB test): `registrationReplacesChefUpload` (both slots set to the stored registration URLs, old slot-1 blob deleted after commit, `imported_at` set, discovery invalidated); `noRegistrationPhotosMarksImported` (both 404 → slots untouched, `imported_at` set); `failedFetchLeavesKitchenUnimported` (client throws → nothing written, `imported_at` stays null); `alreadyImportedIsSkipped` (no client call); `onlyOneSlotPresent` (slot 1 set, slot 2 kept as it was).
- [ ] **Step 2: Run** `mvn -f services/catalog-service/pom.xml test -Dtest=UserChefKitchenPhotoClientTest,KitchenPhotoImporterTest` → FAIL.
- [ ] **Step 3: Implement.** The client reads `craves.user-chef.*` (header `X-Craves-Internal-Secret`, path `/internal/v1/chef-kitchen-photos/{slot}?identityId=`, connect timeout 5 s, read timeout 30 s). The importer looks up `identity_id` for the kitchen, fetches slots 1 and 2 (all fetches succeed or nothing is written), stores each with `storeKitchenImage(kitchenId, "registration-" + slot + ext, ...)`, then in one transaction locks the row, writes the fetched slots, sets `kitchen_photos_imported_at = now()`, and deletes replaced blobs after commit. When nothing changed, it still sets `imported_at`. `importInBackground` uses a single-thread executor and logs failures at WARN without the identity id. A blob stored for a transaction that then fails is deleted (`deleteQuietly`).
- [ ] **Step 4: Run** the two tests → PASS; full `mvn -f services/catalog-service/pom.xml test` → PASS.
- [ ] **Step 5: Add a DB test** `ChefCatalogDatabaseTest.newKitchenImportsRegistrationPhotos` (stub client returns two PNGs; upsert a new kitchen; wait for the background import; `kitchenPhotoUrls` has 2 entries).
- [ ] **Step 6: Runbook.** Add a "Kitchen photos" section to the runbook. Release order: deploy user-chef-service first, then on catalog set `CRAVES_USER_CHEF_INTERNAL_BASE_URL` (same value as order-service's) and `CRAVES_USER_CHEF_INTERNAL_SECRET` (a secretRef to the same secret user-chef reads as `CRAVES_INTERNAL_SERVICE_SECRET`) together with the catalog image. Verify: catalog log line "kitchen photo backfill imported N of M"; `GET /api/v1/catalog/kitchens/{id}` shows `kitchenPhotoUrls`. Support clear: one curl to the catalog FQDN with `X-Craves-Internal-Key`. Rollback: image only; columns stay.
- [ ] **Step 7: Commit** `feat(catalog): import approved registration kitchen photos once per kitchen`.

### Task 4: backend PR

- [ ] **Step 1:** `git push -u origin feat/kitchen-photos`; open a PR against main titled "Kitchen photos: registration photos go public on approval, locked for chefs", listing the release order from task 3 step 6. Do not merge or deploy; the user does.

### Task 5: customer app, kitchen page slideshow and Discover lead images

**Files:**
- Modify: `apps/mobile/src/features/kitchenProfile/api/kitchenProfileApi.ts`, `.../kitchenProfile/screens/CustomerKitchenProfileScreen.tsx` (~94, ~511), `.../chefDiscovery/api/nearbyChefDiscoveryApi.ts`, `.../chefDiscovery/screens/DiscoverHomeChefsScreen.tsx` (where `imageUrls` is built for `KitchenPhotoStrip`)
- Test: `.../kitchenProfile/kitchenProfileApi.test.ts`, `.../chefDiscovery/api/nearbyChefDiscoveryApi.test.ts`, `.../chefDiscovery/chefDiscoveryPresentation.test.ts` (or the screen test that builds `imageUrls`)

**Interfaces:**
- Consumes: `kitchenPhotoUrls: string[]` on `GET /api/v1/catalog/kitchens/{id}`, `/api/v1/discovery/kitchens` and the legacy `/api/v1/catalog/kitchens`.
- Produces: `kitchenPhotos: string[]` (https only, order kept) on the customer kitchen profile model and on `NearbyKitchen`.

- [ ] **Step 1: Write failing tests:** profile mapping keeps https photos in order, drops `http:` and junk, and gives `[]` when the field is absent (old server); nearby and legacy mapping the same; Discover strip `imageUrls` = kitchen photos then dish photos, without duplicates.
- [ ] **Step 2: Run** `npx jest <those files>` → FAIL.
- [ ] **Step 3: Implement.** zod `kitchenPhotoUrls: z.array(z.string()).optional()`; map through the existing https normaliser. The kitchen page renders `KitchenImageCarousel` (`imageUrls=kitchenPhotos`, `width`=window width, `height=PHOTO_SPACE_HEIGHT`, `kitchenName`, `active`=screen focused, `onPress` no-op) in place of the empty photo `View` when `kitchenPhotos.length > 0`; otherwise the empty `View` stays. Discover prepends kitchen photos.
- [ ] **Step 4: Run** the tests, then `npx tsc --noEmit -p .` (0 errors) → PASS.
- [ ] **Step 5: Commit** `feat(mobile): kitchen photo slideshow on the kitchen page and kitchen photos first on Discover`.

### Task 6: chef app, locked kitchen photo tiles

**Files:**
- Modify: `apps/mobile/src/features/chefProfile/api/chefProfileApi.ts`, `.../chefProfile/screens/ChefEditProfileScreen.tsx` (Photos section ~287-303, photo sheet ~482-492, `runPhoto` error copy ~190-197), `apps/mobile/android/app/build.gradle`, `.../chefProfile/screens/ChefProfileScreen.tsx` + its test (version), `apps/mobile/KUSHIRAVI_VERSION.md`
- Test: `.../chefProfile/api/chefProfileApi.test.ts`, `.../chefProfile/screens/ChefEditProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `kitchenPhotoUrls` on `GET /api/v1/kitchens/me`; 409 `KITCHEN_PHOTOS_LOCKED` from upload/delete.
- Produces: `kitchenPhotoUrls: string[]` on `ChefKitchenProfile`.

- [ ] **Step 1: Write failing tests** in `ChefEditProfileScreen.test.tsx`: two tiles "Overall kitchen" and "Cooking setup"; a filled tile shows its photo and tapping it shows the locked message without opening a sheet; an empty tile opens a sheet with "Take a photo" and "Choose from gallery" and no "Remove photo"; an upload answered 409 `KITCHEN_PHOTOS_LOCKED` shows the locked message; with no `kitchenPhotoUrls` field the tiles show "Coming soon" as today.
- [ ] **Step 2: Run** `npx jest src/features/chefProfile` → FAIL.
- [ ] **Step 3: Implement** the tiles and sheet; remove the Remove row and `removePhoto` for KITCHEN; map the 409 to the locked message.
- [ ] **Step 4: Version.** Bump to `1.34.0`; versionCode = the next free code after the latest build (ask the order-screens session). Add a KUSHIRAVI_VERSION entry naming the backend PR and that the app is harmless before the deploy (no field means the old look).
- [ ] **Step 5: Run** `npx jest` (full) and `npx tsc --noEmit -p .` → PASS (rerun alone any suite that fails only under full-suite load).
- [ ] **Step 6: Commit** `feat(mobile): 1.34.0 kitchen photos locked for chefs, shown to customers`.
