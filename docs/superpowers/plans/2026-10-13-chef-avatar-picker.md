# Chef Profile Picture (Drawn Faces) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chefs pick one of 18 drawn faces as their profile picture (never a real photo), right after approval and later in Kitchen details; customers see it on the kitchen page, Discover and Home.

**Architecture:** catalog-service stores the picked face as the existing `kitchen_profile.chef_photo_url` (a shared hosted JPEG under `public/chef-avatars/`), refuses real chef-photo uploads, never deletes shared faces, and adds `chefPhotoUrl` to both public kitchen lists. The app bundles small copies of the faces for the picker, gates the chef workspace on "no face yet", and renders the URL in three customer places with an initials fallback.

**Tech Stack:** Spring Boot 3 / JDK 21 / JdbcTemplate / MockMvc (catalog-service); React Native 0.85, TypeScript, TanStack Query, zod, Jest (apps/mobile).

**Spec:** `C:\mavatar\docs\superpowers\specs\2026-10-13-chef-avatar-picker-design.md`

## Global Constraints

- Backend work: worktree `C:\mavatarapi`, branch `feat/chef-avatar-backend` (from `6e307d08d`, PR #493 head), module `services/catalog-service`. App work: worktree `C:\mavatar`, branch `feat/chef-avatar` (from `b4b8db727`, 1.31.1), module `apps/mobile`. Never edit `C:\mchefapi`, `C:\mchef` or `C:\mscratch` (other sessions use them). Do not push. Nothing against Azure.
- Face ids are exactly `chef-avatar-01` … `chef-avatar-18`, in the order of the source files `C:\Users\chakr\.codex\.chatgpt-projects\g-p-6a4b8cad9a248191a14b694eaa18f413\output\portraits-matched\portrait-01.png` … `portrait-18.png`.
- Hosted face URL: `<publicBaseUrl>/public/chef-avatars/<id>.jpg`. All face files are JPEG.
- The names on the user's sheet (Anitha, Priya, …) never appear in code, copy or accessibility labels.
- The kitchen photo (`KITCHEN`) upload, delete and UI stay exactly as they are.
- Backend tests: PowerShell, `$env:JAVA_HOME='C:\Program Files\Java\jdk-21'`, in `services\catalog-service` run `& 'C:\Program Files\Apache\maven\bin\mvnd.cmd' -o -q test` (there is no root pom and no `mvn`). `ChefCatalogDatabaseTest` is skipped locally (`CRAVES_CATALOG_DISPOSABLE_DATABASE`) and runs in GitHub CI; still keep it compiling and correct.
- App tests: in `C:\mavatar\apps\mobile`, `npx jest <paths>` and `npx tsc --noEmit`. `node_modules` is a junction to `C:\mchef\apps\mobile\node_modules`; do not run `npm install`.
- App copy, verbatim: "Choose your profile picture", "Customers see this picture with your name on your kitchen page. You can change it any time.", "Continue", "Try again", "Not now", "We couldn't save your picture. Please try again.", "Your picture", "Change your picture", "Cancel", "Save", "Picture saved". Face accessibility label: `Picture N` (N = 1…18).

## Review Focus

1. A chef switches from face A to face B: A's shared file must survive for everyone else (Task 1, `sharedChefAvatarsAreNeverDeleted`).
2. The app talks to a server that doesn't send `chefPhotoUrl` yet: no picker, the Kitchen details tile shows "Coming soon" (Task 5 `undefined photo → open`, Task 6 keeps `PhotoTile`'s `url === undefined` behaviour).
3. The face save fails (route not on the gateway yet → 404, 5xx, offline): "Not now" must get the chef into the workspace (Task 5 `failed save shows Not now`).
4. A suspended kitchen with no face: straight into the workspace, since its details can't be changed (Task 5 decision table).
5. A face URL that is `http:` or fails to load: the customer sees initials, never a broken box (Task 7 `CustomerChefFace` tests).

---

### Task 1: Server — save a face, refuse real chef photos, never delete shared faces

**Files:**
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/service/MediaStorageService.java`
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/service/CatalogService.java` (`uploadKitchenPhoto` ~l.144, new method beside it)
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/web/ApiDtos.java`
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/web/KitchenController.java` (photo routes ~l.67-82)
- Test: `services/catalog-service/src/test/java/in/craves/catalog/service/MediaStorageServiceTest.java`
- Test: `services/catalog-service/src/test/java/in/craves/catalog/web/KitchenControllerChefApiTest.java`
- Test: `services/catalog-service/src/test/java/in/craves/catalog/service/ChefCatalogDatabaseTest.java`

**Interfaces:**
- Produces: `MediaStorageService.CHEF_AVATAR_FOLDER = "public/chef-avatars/"` (static final String); `String MediaStorageService.chefAvatarUrl(String avatarId)`; `CatalogService.CHEF_AVATAR_IDS` (`List<String>`, the 18 ids); `KitchenProfileResponse CatalogService.setChefAvatar(CravesPrincipal principal, String avatarId)`; `ApiDtos.ChefAvatarRequest(String avatarId)`; route `PUT /api/v1/kitchens/me/chef-avatar` body `{"avatarId":"chef-avatar-04"}` → `KitchenProfileResponse`. Error codes `CHEF_AVATAR_UNKNOWN` (400) and `CHEF_PHOTO_UPLOAD_DISABLED` (400).

- [ ] **Step 1: Write the failing tests**

`MediaStorageServiceTest` (same setup as `aReplacedOrDeletedKitchenPhotoRemovesOnlyTheBlobOfItsOwnPublicUrl`, base `https://media.craves.example/`):
```java
@Test void sharedChefAvatarsAreNeverDeleted() {
    storage.deleteByPublicUrl("https://media.craves.example/public/chef-avatars/chef-avatar-04.jpg");
    verify(storage, never()).deleteQuietly(anyString());
}
@Test void chefAvatarUrlUsesThePublicMediaBase() {
    assertEquals("https://media.craves.example/public/chef-avatars/chef-avatar-04.jpg", storage.chefAvatarUrl("chef-avatar-04"));
}
```
`KitchenControllerChefApiTest`:
```java
@Test void chefAvatarPutPassesTheIdAndClearsTheDiscoveryCache() throws Exception {
    when(catalog.setChefAvatar(chef, "chef-avatar-04")).thenReturn(kitchen());
    mvc.perform(put("/api/v1/kitchens/me/chef-avatar").contentType(MediaType.APPLICATION_JSON).content("{\"avatarId\":\"chef-avatar-04\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.chefPhotoUrl").value("https://cdn.example/chef.jpg"));
    verify(cache).invalidateAllDiscovery();
}
@Test void chefAvatarPutRejectsABlankId() throws Exception {
    mvc.perform(put("/api/v1/kitchens/me/chef-avatar").contentType(MediaType.APPLICATION_JSON).content("{\"avatarId\":\" \"}"))
        .andExpect(status().isBadRequest());
    verify(catalog, never()).setChefAvatar(any(), any());
}
@Test void removingTheChefPhotoClearsTheDiscoveryCache() throws Exception {
    when(catalog.deleteKitchenPhoto(chef, KitchenPhotoKind.CHEF)).thenReturn(kitchen());
    mvc.perform(delete("/api/v1/kitchens/me/photos/CHEF")).andExpect(status().isOk());
    verify(cache).invalidateAllDiscovery();
}
```
`ChefCatalogDatabaseTest`: in `setup()` add `when(media.chefAvatarUrl(any())).thenAnswer(i -> "https://media.example/public/chef-avatars/" + i.getArgument(0) + ".jpg");`. Add:
```java
@Test void aChefPicksASharedFaceAndCanSwitchIt() {
    assertEquals("https://media.example/public/chef-avatars/chef-avatar-04.jpg", catalog.setChefAvatar(owner, "chef-avatar-04").chefPhotoUrl());
    assertEquals("https://media.example/public/chef-avatars/chef-avatar-17.jpg", catalog.setChefAvatar(owner, "chef-avatar-17").chefPhotoUrl());
    verify(media).deleteByPublicUrl("https://media.example/public/chef-avatars/chef-avatar-04.jpg"); // MediaStorageService ignores shared faces
    assertNull(catalog.getMyKitchen(stranger).chefPhotoUrl());
}
@Test void unknownFacesRoleAndKitchenAreChecked() {
    assertEquals("CHEF_AVATAR_UNKNOWN", rejected(() -> catalog.setChefAvatar(owner, "chef-avatar-19")).getCode());
    assertEquals("CHEF_AVATAR_UNKNOWN", rejected(() -> catalog.setChefAvatar(owner, "../kitchens/x")).getCode());
    assertNull(catalog.getMyKitchen(owner).chefPhotoUrl());
    assertEquals("CHEF_ROLE_REQUIRED", rejected(() -> catalog.setChefAvatar(new CravesPrincipal(chef, "", Set.of("CUSTOMER")), "chef-avatar-01")).getCode());
    assertEquals("KITCHEN_PROFILE_REQUIRED", rejected(() -> catalog.setChefAvatar(new CravesPrincipal(UUID.randomUUID(), "", Set.of("CHEF")), "chef-avatar-01")).getCode());
}
@Test void realChefPhotosAreRefused() {
    assertEquals("CHEF_PHOTO_UPLOAD_DISABLED", rejected(() -> catalog.uploadKitchenPhoto(owner, KitchenPhotoKind.CHEF, file)).getCode());
    verify(media, never()).uploadKitchenImage(any(), eq(KitchenPhotoKind.CHEF), any());
}
```
Existing tests that upload `KitchenPhotoKind.CHEF` (`oldShapePutKeeps…` l.77, `photoUploadStoresTheUrlPerKind…` l.158, `photoRoutesAreChefOnlyAndNeedAKitchen` l.176/179) switch the chef photo to `catalog.setChefAvatar(owner, "chef-avatar-01")` (or `KITCHEN` where the test is about the upload route); their other assertions stay.

- [ ] **Step 2: Run tests to verify they fail**

Run (PowerShell, `services\catalog-service`): `& 'C:\Program Files\Apache\maven\bin\mvnd.cmd' -o -q test`
Expected: compile errors for `chefAvatarUrl`, `setChefAvatar`.

- [ ] **Step 3: Implement**

- `MediaStorageService`: `CHEF_AVATAR_FOLDER`; `chefAvatarUrl(id)` = `publicBaseUrl() + "/" + CHEF_AVATAR_FOLDER + id + ".jpg"`; `deleteByPublicUrl` returns without deleting when the blob name starts with `CHEF_AVATAR_FOLDER` (comment: shared by every chef who picked that face).
- `CatalogService`: `CHEF_AVATAR_IDS` = `chef-avatar-01`…`chef-avatar-18` (built with `String.format("chef-avatar-%02d", n)`); `@Transactional setChefAvatar`: `requireChef` → id not in `CHEF_AVATAR_IDS` → `ApiException.badRequest("CHEF_AVATAR_UNKNOWN", "Pick one of the Craves pictures")` → `requireMyKitchenId` → `setKitchenPhoto(principal, kitchenId, KitchenPhotoKind.CHEF, mediaStorageService.chefAvatarUrl(id))`. `uploadKitchenPhoto`: right after `requireChef`, `kind == CHEF` → `ApiException.badRequest("CHEF_PHOTO_UPLOAD_DISABLED", "Chefs choose a Craves picture instead of uploading a photo")`.
- `ApiDtos`: `public record ChefAvatarRequest(@NotBlank @Size(max = 40) String avatarId) {}`.
- `KitchenController`: `@PutMapping("/chef-avatar")` with `@Valid @RequestBody ChefAvatarRequest`, calls the service then `discoveryCacheService.invalidateAllDiscovery()`; `deletePhoto` also calls `invalidateAllDiscovery()` when `kind == CHEF`.

- [ ] **Step 4: Run tests to verify they pass**

Run the same command. Expected: BUILD SUCCESS, no failures (DB test class skipped locally).

- [ ] **Step 5: Commit**

```bash
git add services/catalog-service/src
git commit -m "feat(catalog): chefs pick a shared Craves face; real chef photos refused; shared faces never deleted"
```

### Task 2: Server — customer kitchen lists carry `chefPhotoUrl`

**Files:**
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/web/DiscoveryDtos.java` (`NearbyKitchenSummaryResponse` l.22)
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/service/NearbyDiscoveryService.java` (kitchen SELECT ~l.214, `mapKitchen` ~l.560)
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/web/NearbyDiscoveryController.java` (`sanitize` ~l.133)
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/web/ApiDtos.java` (`PublicKitchenSummaryResponse` l.165)
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/service/CatalogService.java` (`mapPublicKitchen` ~l.590; its SQL already selects `kp.*`)
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/web/PublicCatalogController.java` (`sanitizeKitchenSummary` ~l.127)
- Test: `services/catalog-service/src/test/java/in/craves/catalog/web/PublicCatalogControllerPrivacyTest.java`, `.../web/NearbyFinanceCacheTest.java`, new `.../web/NearbyDiscoveryControllerPrivacyTest.java` only if no existing test runs `NearbyDiscoveryController.sanitize`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: JSON field `chefPhotoUrl` (string or null) on every kitchen in `GET /api/v1/discovery/kitchens` and in the legacy public kitchen list. Both records get `String chefPhotoUrl` as their **last** component.

- [ ] **Step 1: Write the failing tests**

- `PublicCatalogControllerPrivacyTest`: the summary built at l.74 gets `"https://media.example/public/chef-avatars/chef-avatar-04.jpg"` as its last argument; assert the sanitized list response still has that `chefPhotoUrl` while latitude/longitude are null.
- Nearby: a test that runs the controller's privacy `sanitize` on a kitchen with `chefPhotoUrl` set and asserts the field survives and latitude/longitude become null. `NearbyFinanceCacheTest` l.38 gets the extra constructor argument.

- [ ] **Step 2: Run tests to verify they fail** — same mvnd command; expected compile errors on the new constructor arity.

- [ ] **Step 3: Implement** — add the record component, `kp.chef_photo_url` to the nearby kitchen SELECT, `rs.getString("chef_photo_url")` in both mappers, and pass it through both `sanitize` copies.

- [ ] **Step 4: Run tests to verify they pass** — BUILD SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add services/catalog-service/src
git commit -m "feat(catalog): nearby and public kitchen lists include the chef picture"
```

### Task 3: Server release — face files, gateway route, runbook

**Files:**
- Create: `docs/release/chef-avatars/chef-avatar-01.jpg` … `chef-avatar-18.jpg`
- Modify: `scripts/apim/configure-chef-app-routes-apim.sh` (`ROUTES`, after `chef-app-delete-kitchen-photo`)
- Modify: `docs/release/2026-10-13-chef-app-backend-runbook.md`
- Modify: `services/catalog-service/README.md` (photo routes section)

**Interfaces:**
- Consumes: route and folder from Task 1.

- [ ] **Step 1: Make the 18 hosted faces** (Git Bash, from `C:\mavatarapi`):

```bash
SRC="C:/Users/chakr/.codex/.chatgpt-projects/g-p-6a4b8cad9a248191a14b694eaa18f413/output/portraits-matched"; mkdir -p docs/release/chef-avatars
for i in $(seq -w 1 18); do ffmpeg -loglevel error -y -i "$SRC/portrait-$i.png" -vf scale=512:512:flags=lanczos -q:v 3 "docs/release/chef-avatars/chef-avatar-$i.jpg"; done
```
Expected: 18 files, each 512×512 JPEG under 150 KB (`file docs/release/chef-avatars/*`).

- [ ] **Step 2: Gateway route** — add `'kitchen|chef-app-put-chef-avatar|PUT|/chef-avatar|json'`. Run `bash -n scripts/apim/configure-chef-app-routes-apim.sh`; expected: no output.

- [ ] **Step 3: Runbook** — in the catalog step, before the catalog deploy: upload the faces with `az storage blob upload-batch` from `docs/release/chef-avatars` to the media container under `--destination-path public/chef-avatars`, `--content-type image/jpeg`, `--content-cache-control "public, max-age=31536000, immutable"`, using the storage account/container that step 1.1 already reads; then `curl -sI <public media base>/public/chef-avatars/chef-avatar-01.jpg` must show `200` and `image/jpeg`. Bump the route count in the table (28 → 29), add `PUT /api/v1/kitchens/me/chef-avatar` wherever the runbook lists the new routes or 401 probes, and note that real chef-photo uploads now answer 400 `CHEF_PHOTO_UPLOAD_DISABLED`. README: one paragraph on the faces route and the refusal.

- [ ] **Step 4: Commit**

```bash
git add docs/release/chef-avatars scripts/apim/configure-chef-app-routes-apim.sh docs/release/2026-10-13-chef-app-backend-runbook.md services/catalog-service/README.md
git commit -m "chore(release): chef faces, gateway route and runbook steps for chef pictures"
```

### Task 4: App — face list, face grid, save call

**Files:**
- Create: `apps/mobile/src/assets/chef-avatars/chef-avatar-01.jpg` … `chef-avatar-18.jpg` (256×256)
- Create: `apps/mobile/src/features/chefProfile/domain/chefAvatars.ts`, `chefAvatars.test.ts`
- Create: `apps/mobile/src/features/chefProfile/components/ChefAvatarGrid.tsx`, `ChefAvatarGrid.test.tsx`
- Modify: `apps/mobile/src/features/chefProfile/api/chefProfileApi.ts` (beside `uploadPhoto`), `chefProfileApi.test.ts`
- Modify: `api/apim-api/contracts/mobile-main-source-only.v1.json` (beside `chefProfile.uploadPhoto`)

**Interfaces:**
- Produces: `interface ChefAvatar { id: string; image: ImageSourcePropType }`; `CHEF_AVATARS: readonly ChefAvatar[]` (18, in id order, each `image` a literal `require('../../../assets/chef-avatars/chef-avatar-NN.jpg')`); `chefAvatarIdFromUrl(url: string | null | undefined): string | null`; `chefProfileApi.setAvatar(avatarId: string, signal?: AbortSignal): Promise<ChefKitchenProfile>`; `<ChefAvatarGrid selectedId={string | null} onSelect={(id: string) => void} disabled?={boolean} />`.

- [ ] **Step 1: Make the bundled faces** (Git Bash, from `C:\mavatar\apps\mobile`): same loop as Task 3 Step 1 with `scale=256:256` and output `src/assets/chef-avatars/chef-avatar-$i.jpg`. Expected: 18 files, each under 40 KB.

- [ ] **Step 2: Write the failing tests**

```ts
// chefAvatars.test.ts
it('lists the 18 faces in order', () => {
  expect(CHEF_AVATARS.map(a => a.id)).toEqual(Array.from({length: 18}, (_, i) => `chef-avatar-${String(i + 1).padStart(2, '0')}`));
});
it('finds the face id at the end of a hosted URL', () => {
  expect(chefAvatarIdFromUrl('https://media.craves.in/public/chef-avatars/chef-avatar-04.jpg')).toBe('chef-avatar-04');
  expect(chefAvatarIdFromUrl('https://media.craves.in/public/chef-avatars/chef-avatar-19.jpg')).toBeNull();
  expect(chefAvatarIdFromUrl('https://media.craves.in/public/kitchens/k1/chef/abc.jpg')).toBeNull();
  expect(chefAvatarIdFromUrl(null)).toBeNull();
  expect(chefAvatarIdFromUrl(undefined)).toBeNull();
});
// chefProfileApi.test.ts (follow the file's httpClient mock)
it('saves a face with PUT /api/v1/kitchens/me/chef-avatar', async () => {
  // expect httpClient.put called with ('/api/v1/kitchens/me/chef-avatar', {avatarId: 'chef-avatar-04'}, {signal: undefined})
  // and the parsed kitchen returned
});
// ChefAvatarGrid.test.tsx
it('offers 18 faces, marks the picked one and reports a tap', () => {
  // render with selectedId 'chef-avatar-04'; 18 elements labelled 'Picture 1'…'Picture 18';
  // 'Picture 4' has accessibilityState.selected true, others false; pressing 'Picture 17' calls onSelect('chef-avatar-17')
});
```

- [ ] **Step 3: Run tests to verify they fail** — `npx jest src/features/chefProfile/domain/chefAvatars.test.ts src/features/chefProfile/components/ChefAvatarGrid.test.tsx src/features/chefProfile/api/chefProfileApi.test.ts`; expected: module not found / `setAvatar` not a function.

- [ ] **Step 4: Implement** — grid: 3 columns of round faces in a wrapping row (no FlatList; 18 items), each a `Pressable` with `accessibilityRole="radio"`, the picked face gets a ring in the chef kit's accent red and a white-bordered tick badge (`Icon name="check"`), `disabled` dims and blocks taps. `chefAvatarIdFromUrl` matches `/\/(chef-avatar-\d{2})\.jpg(?:[?#].*)?$/` and returns the id only if it's in `CHEF_AVATARS`. `setAvatar` mirrors `deletePhoto`'s style (`parseKitchenResponse(await httpClient.put(...))`). Contract entry `chefProfile.setAvatar`: method `PUT`, path `/api/v1/kitchens/me/chef-avatar`, requestModel `{avatarId}`, responseModel `ChefKitchenProfile`, requestValidator `CHEF_AVATARS id`, responseValidator `parseKitchenResponse`, availabilityFlag `CHEF_KITCHEN_PHOTOS_AVAILABLE`, reason like its neighbours.

- [ ] **Step 5: Run tests to verify they pass** — same jest command, plus `npm run check:p119`; expected: all pass, P119 prints no `[P119]` errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/assets/chef-avatars apps/mobile/src/features/chefProfile api/apim-api/contracts/mobile-main-source-only.v1.json
git commit -m "feat(mobile): chef face list, face grid and the save call"
```

### Task 5: App — picker right after approval

**Files:**
- Create: `apps/mobile/src/features/chefProfile/domain/chefAvatarGate.ts`, `chefAvatarGate.test.ts`
- Create: `apps/mobile/src/features/chefProfile/components/ChefAvatarGate.tsx`, `ChefAvatarGate.test.tsx`
- Modify: `apps/mobile/src/app/navigation/ChefRootNavigator.tsx` (final return, ~l.263) and `ChefRootNavigator.test.tsx` if it breaks

**Interfaces:**
- Consumes: `CHEF_AVATARS`, `ChefAvatarGrid`, `chefProfileApi.setAvatar` (Task 4); `useChefKitchen()` (`src/features/chefProfile/state/useChefKitchen.ts`); `synchronizeChefProfileAfterSave(queryClient, identityId, updated)`; `canEditChefKitchenProfile(kitchen)` (`domain/chefEditProfileForm.ts`, false only for `SUSPENDED`).
- Produces: `type ChefAvatarGateStep = 'wait' | 'ask' | 'open'`; `chefAvatarGateStep(input: {status: 'pending' | 'error' | 'success'; kitchen: ChefKitchenProfile | null; dismissed: boolean}): ChefAvatarGateStep`; `<ChefAvatarGate>{children}</ChefAvatarGate>`.

- [ ] **Step 1: Write the failing tests**

```ts
// chefAvatarGate.test.ts — kitchen(overrides) builds a minimal ChefKitchenProfile
it.each([
  ['loading', {status: 'pending', kitchen: null, dismissed: false}, 'wait'],
  ['kitchen failed to load', {status: 'error', kitchen: null, dismissed: false}, 'open'],
  ['no face, active', {status: 'success', kitchen: kitchen({chefPhotoUrl: null, status: 'ACTIVE'}), dismissed: false}, 'ask'],
  ['no face, draft (just approved)', {status: 'success', kitchen: kitchen({chefPhotoUrl: null, status: 'DRAFT'}), dismissed: false}, 'ask'],
  ['no face, suspended', {status: 'success', kitchen: kitchen({chefPhotoUrl: null, status: 'SUSPENDED'}), dismissed: false}, 'open'],
  ['older server, field missing', {status: 'success', kitchen: kitchen({chefPhotoUrl: undefined}), dismissed: false}, 'open'],
  ['has a face', {status: 'success', kitchen: kitchen({chefPhotoUrl: 'https://m/public/chef-avatars/chef-avatar-01.jpg'}), dismissed: false}, 'open'],
  ['chef chose Not now', {status: 'success', kitchen: kitchen({chefPhotoUrl: null}), dismissed: true}, 'open'],
])('%s', (_, input, step) => expect(chefAvatarGateStep(input as never)).toBe(step));
```
`ChefAvatarGate.test.tsx` (mock `chefProfileApi.getKitchen`/`setAvatar`, render inside the providers the other chefProfile screen tests use, children = `<Text>Workspace</Text>`):
- `asks for a face, saves it and opens the workspace`: kitchen `chefPhotoUrl: null` → "Choose your profile picture" shown, "Continue" disabled; press "Picture 4" → "Continue" enabled; press it → `setAvatar('chef-avatar-04')` called once; resolved kitchen has a URL → "Workspace" shown.
- `a failed save shows Not now, which opens the workspace`: `setAvatar` rejects → "We couldn't save your picture. Please try again." and buttons "Try again" + "Not now"; press "Not now" → "Workspace".
- `a chef with a face goes straight in` and `a kitchen that fails to load goes straight in` → "Workspace", picker text absent.

- [ ] **Step 2: Run tests to verify they fail** — `npx jest src/features/chefProfile/domain/chefAvatarGate.test.ts src/features/chefProfile/components/ChefAvatarGate.test.tsx`; expected: module not found.

- [ ] **Step 3: Implement**
- `chefAvatarGateStep`: dismissed → `open`; pending → `wait`; error or no kitchen → `open`; `kitchen.chefPhotoUrl === null && canEditChefKitchenProfile(kitchen)` → `ask`; else `open`.
- `ChefAvatarGate`: reads `useChefKitchen()` (`query.status` maps to the input), keeps `selectedId`, `saving`, `failed`, `dismissed` in state. `wait` → the same centred "Preparing Chef workspace" look as `ChefRootNavigator`'s isolation screen; `ask` → white safe-area screen: title, body, scrollable `ChefAvatarGrid`, footer `ChefActionButton` (label "Continue", or "Try again" after a failure; disabled with no face; busy while saving) and, only after a failure, the error line and a secondary "Not now". Save = `setAvatar` → `synchronizeChefProfileAfterSave(queryClient, identityId, updated)`; the step then becomes `open` on its own.
- `ChefRootNavigator` returns `<ChefToastProvider><ChefAvatarGate><ChefProductNavigator /></ChefAvatarGate></ChefToastProvider>`.

- [ ] **Step 4: Run tests to verify they pass** — the two files plus `npx jest src/app/navigation`; expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/chefProfile apps/mobile/src/app/navigation
git commit -m "feat(mobile): approved chefs choose their profile picture before the workspace opens"
```

### Task 6: App — change the face in Kitchen details

**Files:**
- Modify: `apps/mobile/src/features/chefProfile/screens/ChefEditProfileScreen.tsx` (photo state ~l.170-220, tiles ~l.263, photo sheet ~l.436)
- Test: `apps/mobile/src/features/chefProfile/screens/ChefEditProfileScreen.test.tsx` (CHEF photo tests ~l.129, 361-395)

**Interfaces:**
- Consumes: `ChefAvatarGrid`, `chefAvatarIdFromUrl`, `chefProfileApi.setAvatar` (Task 4); the screen's existing `runPhoto`, `photoUrl`, `synchronizeChefProfileAfterSave`.

- [ ] **Step 1: Write the failing tests** (replace the CHEF camera/gallery/remove cases):
- `the Your picture tile opens the faces with the current one picked`: kitchen `chefPhotoUrl` ends `chef-avatar-04.jpg`; press "Your picture" → "Change your picture" sheet; "Picture 4" selected; no "Take a photo", "Choose from gallery" or "Remove photo" in it.
- `saving a new face`: press "Picture 17", then "Save" → `setAvatar('chef-avatar-17')`; toast "Picture saved"; `uploadPhoto` never called with `'CHEF'`.
- `Cancel keeps the old face`: press "Picture 17", "Cancel" → `setAvatar` not called.
- The existing `Kitchen photo` camera/gallery/remove tests stay green unchanged.

- [ ] **Step 2: Run to verify they fail** — `npx jest src/features/chefProfile/screens/ChefEditProfileScreen.test.tsx`.

- [ ] **Step 3: Implement** — CHEF tile label "Your picture", `onPress` opens a new `ChefSheet` titled "Change your picture" holding `ChefAvatarGrid` (picked = draft id, initialised from `chefAvatarIdFromUrl(photoUrl('CHEF'))`) and a "Cancel" / "Save" row (Save disabled until a face is picked). Save runs through `runPhoto('CHEF', …)` with `setAvatar` and returns "Picture saved". The camera/gallery sheet becomes Kitchen-photo only. `PhotoTile`'s `url === undefined` → "Coming soon" stays as is.

- [ ] **Step 4: Run to verify they pass** — same command; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/chefProfile/screens
git commit -m "feat(mobile): Kitchen details changes the chef picture from the faces, no camera"
```

### Task 7: App — customers see the face

**Files:**
- Create: `apps/mobile/src/features/customerShell/components/CustomerChefFace.tsx`, `CustomerChefFace.test.tsx`
- Modify: `apps/mobile/src/features/kitchenProfile/api/kitchenProfileApi.ts` (schema l.13, `CustomerKitchenProfile` l.99, `mapCustomerKitchenProfile` ~l.254) + its test
- Modify: `apps/mobile/src/features/chefDiscovery/api/nearbyChefDiscoveryApi.ts` (both kitchen schemas l.17-50) + its test
- Modify: `apps/mobile/src/features/kitchenProfile/screens/CustomerKitchenProfileScreen.tsx` (header avatar ~l.460, avatar ~l.509)
- Modify: `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx` (card avatar ~l.145)
- Modify: `apps/mobile/src/features/home/components/HomePromoAndKitchens.tsx` (`TopKitchenCardModel` ~l.68, builder ~l.189, avatar shell ~l.314)

**Interfaces:**
- Produces: `<CustomerChefFace url={string | null | undefined} fallback={React.ReactNode} />` — fills its parent (`StyleSheet.absoluteFill`); parent circles get `overflow: 'hidden'`. `CustomerKitchenProfile.chefPhotoUrl: string | null`; `NearbyKitchen.chefPhotoUrl?: string | null`; `TopKitchenCardModel.chefPhotoUrl: string | null`.

- [ ] **Step 1: Write the failing tests**
- `CustomerChefFace`: `https://…/chef-avatar-04.jpg` renders an `Image` with that uri and no fallback; `http://…` and `null` render the fallback; firing the image's `onError` switches to the fallback.
- `kitchenProfileApi` test: a profile response with `chefPhotoUrl` maps to `chefPhotoUrl`; one without the field maps to `null`.
- `nearbyChefDiscoveryApi` test: a kitchen with `chefPhotoUrl` keeps it; one without still parses.

- [ ] **Step 2: Run to verify they fail** — `npx jest src/features/customerShell src/features/kitchenProfile/api src/features/chefDiscovery/api`.

- [ ] **Step 3: Implement** — schemas `chefPhotoUrl: z.string().nullable().optional()`; mapper `chefPhotoUrl: raw.chefPhotoUrl ?? null`. Kitchen page: both avatars render `CustomerChefFace` with today's initials `Text` as fallback. Discover card: the face goes in an inner clipped circle so the open dot stays visible. Home card: `chefPhotoUrl: kitchen.chefPhotoUrl ?? null` in the model; the shell renders `CustomerChefFace` with today's `CustomerChefAvatar` + chef-hat icon as the fallback.

- [ ] **Step 4: Run to verify they pass** — same command plus `npx jest src/features/kitchenProfile src/features/chefDiscovery src/features/home`; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/customerShell apps/mobile/src/features/kitchenProfile apps/mobile/src/features/chefDiscovery apps/mobile/src/features/home
git commit -m "feat(mobile): customers see the chef's picture on the kitchen page, Discover and Home"
```

### Task 8: App 1.32.0 — version, full checks, APK

**Files:**
- Modify: `apps/mobile/android/app/build.gradle` (versionCode 71 → 72, versionName "1.31.1" → "1.32.0")
- Modify: `apps/mobile/src/features/chefProfile/screens/ChefProfileScreen.tsx` (`CHEF_APP_VERSION`, l.28) and its test
- Modify: `apps/mobile/KUSHIRAVI_VERSION.md` (new "Version 1.32.0 - Chef profile pictures, 2026-10-13" section above 1.31.1: what chefs and customers see, the server dependency and release order from the spec)
- Add: `docs/superpowers/specs/2026-10-13-chef-avatar-picker-design.md`, `docs/superpowers/plans/2026-10-13-chef-avatar-picker.md` (already in the worktree)

- [ ] **Step 1: Bump the version and notes** as listed.
- [ ] **Step 2: Full checks** — in `apps/mobile`: `npx jest --silent` (expected: all suites pass, same count as the baseline plus the new tests), `npx tsc --noEmit` (no output), `npx eslint src --quiet` (no errors), `npm run check:p119` (no `[P119]` lines).
- [ ] **Step 3: Commit**

```bash
git add apps/mobile/android/app/build.gradle apps/mobile/src/features/chefProfile/screens apps/mobile/KUSHIRAVI_VERSION.md docs/superpowers
git commit -m "chore(mobile): 1.32.0 (72) chef profile pictures"
```

- [ ] **Step 4: Build** — PowerShell in `C:\mavatar\apps\mobile`: `cmd /c "powershell -ExecutionPolicy Bypass -File scripts\build-kushiravi-release-apk.ps1 -SkipNpmCi -PhoneOnly > build.log 2>&1"`; expected: the script reports the APK path and versionName 1.32.0. If `adb devices` lists `GURKT4DYYPUW7DX8`, install with `adb -s GURKT4DYYPUW7DX8 install -r <apk>`; otherwise report that the phone is not connected.
