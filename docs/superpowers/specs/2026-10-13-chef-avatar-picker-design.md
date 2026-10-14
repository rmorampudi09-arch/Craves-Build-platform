# Chef profile picture: pick a drawn face, never a real photo

Date: 2026-10-13. Status: approved by the user on 2026-10-13. Mockup at `design-review/chef-avatar/index.html` (Downloads main worktree; `board.png` next to it).

## Why

Home chefs don't want their face public. Their name is fine to show (the public kitchen data already includes `displayName` and `kitchenName`); their face is not. So chefs never upload a profile photo. They pick one of 18 drawn faces, and customers see that face as the chef's profile picture, next to the chef's real name.

## Goals

1. Right after the chef application is approved, the chef must pick a face before the chef workspace opens.
2. The chef can change it later from Profile → Kitchen details → "Your photo".
3. Customers see the picked face on the kitchen page, the Discover chefs cards and the Home top-kitchen cards.

## Non-goals

- Order screens (`CustomerOrderCard`, `CustomerOrderDetailScreen`): their data comes from order-service, which has no chef photo. They keep the empty circle.
- craves.in (customer-web-next): it doesn't read `chefPhotoUrl` anywhere today and stays unchanged.
- The kitchen photo: it stays a real photo upload, exactly as built in 1.31.0.
- Faces for customers' own profiles.

## Anti-goals (fail even if it "works")

- A real chef photo is shown to customers anywhere.
- Changing one chef's face deletes the shared face file, so it disappears for every other chef who picked it.
- A chef gets stuck on the picker with no way into their workspace (kitchen missing, kitchen paused, server error).

## The faces

- 18 square drawn portraits, source `C:\Users\chakr\.codex\.chatgpt-projects\g-p-6a4b8cad9a248191a14b694eaa18f413\output\portraits-matched\portrait-01.png` … `portrait-18.png` (1254×1254 PNG, ~3 MB each, no name text). Order 01–12 women, 13–18 men.
- Ids are `chef-avatar-01` … `chef-avatar-18`, same order. The names on the user's original sheet (Anitha, Priya, …) are never shown to anyone.
- Two copies, both JPEG (avoids any WebP doubts on older devices):
  - **Hosted**: 512×512, served like dish photos at `<publicBaseUrl>/public/chef-avatars/chef-avatar-NN.jpg`. The 18 files are committed in the backend branch under `docs/release/chef-avatars/` so the release runbook can upload them from the Cloud Shell checkout.
  - **Bundled in the app**: 256×256, used only to draw the picker grid (instant, works offline, no extra endpoint).

## Server (catalog-service, added to open PR #493, branch `feat/chef-app-backend`, worktree `C:\mchefapi`)

1. **New call** `PUT /api/v1/kitchens/me/chef-avatar`, body `{"avatarId":"chef-avatar-04"}`, chef only, returns the chef's kitchen like the photo calls do. It accepts only the 18 ids (fixed list in code); anything else is 400. It saves `<publicBaseUrl>/public/chef-avatars/<id>.jpg` into `kitchen_profile.chef_photo_url`. Same kitchen and paused-kitchen rules as the existing photo upload.
2. **Block real chef photos**: `POST /api/v1/kitchens/me/photos?kind=CHEF` returns 400 with a clear code. `kind=KITCHEN` is unchanged. `DELETE /photos/CHEF` stays (sets null).
3. **Never delete shared faces**: `MediaStorageService.deleteByPublicUrl` ignores any blob under `public/chef-avatars/`. This protects every caller, including the replace-old-photo cleanup in `CatalogService.setKitchenPhoto`.
4. **Send the face in the customer lists**: add `chefPhotoUrl` to `DiscoveryDtos.NearbyKitchenSummaryResponse` (`GET /api/v1/discovery/kitchens`, what Discover and Home use) and to `PublicKitchenSummaryResponse` (the legacy `/api/v1/catalog/kitchens` list), including their privacy `sanitize` copies. The full public kitchen profile already sends it.
5. **Cache**: saving a face clears the discovery cache, the same way the profile save does (`discoveryCacheService.invalidateAllDiscovery()`).
6. **Gateway**: the new route is published by `scripts/apim/configure-chef-app-routes-apim.sh` with the other chef routes (or confirmed covered by an existing wildcard on `api/v1/kitchens/me`).
7. **Runbook** (`docs/release/2026-10-13-chef-app-backend-runbook.md`): add "upload the 18 faces to the media container under `public/chef-avatars/` with the long cache header" before the catalog deploy, plus a check that one face URL answers 200.
8. Tests: allowed id saves the right URL; unknown id 400; CHEF upload 400; KITCHEN upload still works; switching faces never deletes a `public/chef-avatars/` blob; both lists carry `chefPhotoUrl`.

## App (version 1.32.0)

Branch (my call): a new local branch `feat/chef-avatar` started from `fix/chef-support-chat-referrals` at b4b8db727 (1.31.1, PR #499, base `KUSHIRAVI-app-build`), in its own worktree. 1.31.1 is what's on the phone, and #499 touches the same files (`ChefRootNavigator.tsx`, `ReadState.tsx`, `ChefProfileScreen.tsx`); starting from `KUSHIRAVI-app-build` at fef555695 would drop support chat and referral Join from the phone. Local commits only; nothing is pushed without asking.

1. **Faces list + grid**: one module holding the 18 ids with their bundled images, and one grid component (3 columns, round faces, the picked one gets a red ring and a tick). Used by both screens below. The current pick is found by matching the id at the end of `chefPhotoUrl`.
2. **Picker after approval** ("Choose your profile picture" / "Customers see this picture with your name on your kitchen page. You can change it any time." / Continue, grey until a face is picked; no Skip). It sits between role isolation and the chef tabs in `app/navigation/ChefRootNavigator.tsx`:
   - kitchen still loading → keep the existing "Preparing Chef workspace" state;
   - `chefPhotoUrl === null` → show the picker; on save, update the kitchen cache and continue to the tabs;
   - kitchen failed to load (e.g. chefs approved on the old form who have no kitchen), kitchen paused, or `chefPhotoUrl` missing from the response (an older server) → go straight to the tabs. Never block.
   - Save fails → inline error with "Try again" and a "Not now" that opens the workspace; the picker shows again on the next chef-mode open. (My call: no Skip in the normal case, but a server problem must never lock a chef out of orders.)
   This covers newly approved chefs and chefs approved earlier: anyone with no face sees it once on the next chef-mode open.
3. **Kitchen details** (`ChefEditProfileScreen`): the "Your photo" tile shows the face and opens a sheet "Change your picture" with the same grid, Cancel and Save. No camera, gallery or Remove for this tile. The kitchen photo tile is unchanged.
4. **Customer screens**: add optional `chefPhotoUrl` to the public kitchen profile schema/mapper and to the nearby-kitchen schemas (`nearbyChefDiscoveryApi.ts`, both current and legacy). Show it in:
   - `CustomerKitchenProfileScreen`: the 92 dp avatar and the small header avatar;
   - `DiscoverHomeChefsScreen` kitchen card avatar;
   - `HomePromoAndKitchens` top-kitchen card (`CustomerChefAvatar imageUrl`, chef-hat overlay hidden when there's a face).
   If the URL is missing or the image fails to load, keep today's initials (or the grey circle on Home).
5. The chef Profile tab card already shows `chefPhotoUrl`; no change.
6. Tests: the gate's four branches; grid selection; Kitchen details sheet saves the right id; customer avatar falls back to initials.

## Release order

1. Backend changes land in PR #493 → merge → user uploads the 18 faces → catalog deploy → gateway route (the runbook already puts APIM last).
2. App 1.32.0 is installed after the gateway route is live. Before the catalog deploy it is harmless (the field is missing, so no picker). Between the catalog deploy and the gateway route the save would fail, and "Not now" is what keeps chefs moving in that window.

## Left to the builder

Exact error codes and copy for the 400s, component and file names, the sheet's height, image cache/loading behaviour, and how to keep the cached kitchen in sync after a save (reuse `synchronizeChefProfileAfterSave`).
