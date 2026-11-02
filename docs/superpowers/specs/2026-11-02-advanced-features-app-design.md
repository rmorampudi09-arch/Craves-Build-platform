# Craves app: the ready advanced features (design)

Date: 2 Nov 2026 · App baseline: 1.36.12 (112), branch `KUSHIRAVI-app-build` at 3244e10cb · Work folder `C:\madv`, branch `feat/advanced-features-app`

Approved designs: canvas https://claude.ai/artifact/XBNk7ggN1grqfEqDa7ufZs (each "Today" board is a phone screenshot of 1.36.11; each "New" board is that screen with the feature added). Screenshots: `design-review/new-features/phone-today/`.

## Intent

The backend gained 22 "advanced features" modules on 31 Oct – 1 Nov (`services/advanced-features-service`, all routes under `https://api.craves.in/api/v1/advanced/`). The owner wants the Craves app (customer + chef; never the rider app) to use the ones that work end to end today, and nothing that would have to show "coming soon". Each feature lands inside the screen where it naturally belongs in the current app, in the current look, so it feels like it was always there.

## Goals

- Ship 7 features, one per app version, each with its chef side and customer side together, each installed and checked on the owner's phone (Xiaomi `GURKT4DYYPUW7DX8`) before the next starts.
- Every new element matches the existing screen it joins (spacing, chips, cards, red, Outfit) as drawn on the canvas.
- A feature whose backend is off, empty or failing is invisible, never broken and never "coming soon".

## Non-goals

- The rider app or anything under rider flavor code.
- Features waiting on backend work (dish options/add-on pricing, meal hours, remember-my-choices, batches/holds, coupons, party orders, office meals, order changes and refunds, AI search) or on staff setup (partner offers, disputes, smart-search phrases, cancel/refund policies).
- Lock-screen order tracking (needs a notification library plus an Android foreground service, and the Apple push key for iPhone): later round.
- Sharing a list by link (needs a `craves.in/l/<token>` web page and Android App Links; the app only handles `craves://` today): later round. Lists stay private.
- Changing existing "coming soon" text that is not part of these features (sort by Most popular/Rating/Delivery time; Privacy "Other devices").

## Anti-goals (would make this a failure even if it works)

- Any new "coming soon", disabled teaser, or empty section shown to customers.
- Showing a customer's taste data, lists or saves to chefs or other customers.
- Turning on personalised ranking without the customer's explicit consent.
- Breaking checkout, cart, or the existing Filter & Sort results.

## Approaches considered

- **A. One feature per version, chef + customer together (picked by the owner).** Matches how the app has been built and phone-checked since October; data a chef enters (labels, allergens, busy time) can be tested end to end in both modes before moving on; can stop after any version.
- B. Two releases (customer 1.37.0, then chef 1.37.1): fewer installs, but customer screens would show nothing until the chef release.
- C. One release: fastest, hardest to check, one bug blocks all.

## Shared decisions (apply to every version)

- **API:** authenticated calls use the existing `apiClient` (`apps/mobile/src/core/http/apiClient.ts`, bearer from `tokenMemory`); public reads may use `publicApiClient` (`core/http/transport`). Paths come from `contracts/openapi/advanced/*-v1.yaml` on `main`; read the contract before writing each client. Follow the feature-folder pattern (`features/<name>/api`, `domain`, `screens`, `components`) and the existing query/dedupe helpers used by neighbouring features.
- **Availability gate:** on launch and on resume, read `GET /api/v1/advanced/features` (public; returns `[{id, enabled, available}]`). A feature renders only if its id is `enabled && available`. If the call fails, treat every advanced feature as off for that session. One small shared module, cached in memory.
- **Failure rule:** any advanced call that fails hides that one section silently (no toast, no error card), except actions the user started (save, join, publish), which show the app's usual inline error.
- **No new libraries** unless a version below says so.
- **Versions:** each version bumps `versionCode`/`versionName` in `android/app/build.gradle` and the `CUSTOMER_APP_VERSION` / `CHEF_APP_VERSION` constants (both currently lag; set them to the new version).
- **Tests:** Jest unit tests for each new API client mapper and domain rule (hide rules, gating, counts), plus a render test for each new section's shown/hidden states, next to the code like existing `*.test.ts(x)`.
- **First check (before any 1.36.13 code):** confirm the app's own signed-in token is accepted by an authenticated advanced route (e.g. `GET /taxonomy/chef/menu-items/{id}` as the chef). No authenticated advanced call has been tried from the app yet.
- **Testing on live:** use the owner's chef kitchen "Relangi mavayya kitchen" and its "Ravi's test" dish. After each check, turn busy time off and remove test labels and test allergens.
- **Release per version:** build the release APK from `C:\madv\apps\mobile` (short path; real `node_modules`, never a junction), sign with the existing debug keystore flow, install on the phone, owner checks it, then commit. Pushing to GitHub happens only when the owner says so.

## The versions

### 1.36.13 · Cuisine and diet labels (backend module M04 taxonomy)

Chef side, `features/chefMenu/screens/ChefDishFormScreen.tsx`: under "More details (optional)", after "Needs hot box", add **Cuisine** (up to 3; the first chosen is the main one; chips like the Category chips) and **Diet** (up to 6 chips). Vocabulary from `GET /taxonomy/vocabulary` (cuisines are a tree; show the top-level and regional terms the owner sees on the canvas, with "More…" opening the full list). Load current labels with `GET /taxonomy/chef/menu-items/{menuItemId}`; save with `PUT` on the same path when the form's "Save changes" is pressed (one save, same button); clearing all uses `DELETE`. New dishes: labels save after the dish exists (needs its id).

Customer side, `features/discoveryFilters/screens/CustomerFilterSortScreen.tsx`: replace the "Cuisine filters are coming soon" card with cuisine chips; add the six diet rows (Jain, No onion no garlic, Satvik, Vegan, Fasting (vrat), Halal) under Vegetarian / Non-vegetarian / Egg. Applying: get matching ids from `GET /taxonomy/menu-items?cuisine=…&diet=…` and keep only nearby results whose menu-item id is in that set (a region includes every cuisine under it; diets are all-of). **Hide rule:** show the cuisine chips and the new diet rows only when `browseDishTags` returns at least one dish for the term (checked once per screen open with a light request per visible term, or one lookup over the nearby dishes via `POST /taxonomy/menu-items/lookup`); today zero dishes are labelled, so the section stays hidden until chefs label dishes.

### 1.36.14 · Ingredients and allergens (M03 food facts)

Chef side, same dish form: a section "Ingredients & allergens (optional)" with "It contains" chips (FSSAI list from `GET /food-facts/vocabulary`), "May contain" chips, and an Ingredients text field. Nutrition per serving is left out of this version (simpler form; can be added later). Load with `GET /food-facts/chef/menu-items/{id}`; on Save, `PUT` (draft) then `POST …/submit` so it publishes at once as "declared by the chef". **The chef must confirm allergens (owner's decision, food safety):** "It contains" has a "None of these" chip; if the chef filled any part of the section, the facts are not submitted until at least one allergen or "None of these" is chosen, and the section shows "Choose the allergens, or None of these" inline (the rest of the dish still saves). Other plausibility warnings from the response are shown inline and never block saving.

Customer side, `features/dishDetail/screens/CustomerDishDetailLegacyScreen.tsx`: an "INGREDIENTS & ALLERGENS" card under the Prep time / Serves / Spice / Pack card, styled like the "PREPARED BY" card, with the disclaimer line returned by the API. An empty allergen list reads "The chef says it has none of the listed allergens". **Hide rule:** card renders only when `GET /food-facts/menu-items/{id}` returns facts (404 means none: hide).

### 1.36.15 · Busy time (M07, load part only)

Chef side, `features/chefDashboard/components/KitchenStatusSheet.tsx`: above "Pause new orders for", a "Busy? Add cooking time" row of chips Off / +10 / +20 / +30 min, saved with `PUT /kitchen-capacity/chef/load` (`extraPrepMinutes`, `until`). `until` = 9:00 pm today if before 8:00 pm, otherwise 3 hours from now (never past 24 h, the API cap). The header pill on chef Home (`ChefDashboardScreen.tsx`) shows amber "Open · busy, +N min" while active.

Customer side, `features/kitchenProfile/screens/CustomerKitchenProfileScreen.tsx`: read `GET /kitchen-capacity/kitchens/{kitchenId}/load`; when `extraPrepMinutes > 0`, add it to the time pill (e.g. 10–30 becomes 30–50 min) and show the amber line "Busy kitchen: food takes about N min longer right now". Dish times on that page add the same minutes. Home and search cards are unchanged in this version.

### 1.36.16 · Saved upgrades (M17 saved feed)

`features/favorites/screens/CustomerFavoritesScreen.tsx`: keep Dishes / Home chefs tabs and the calls they make today (their cards need photo, veg mark, time and rating, which `/saved-feed` lacks); add `GET /saved-feed` on top for familiarity, unavailable recovery and regulars. Dishes tab: saved dishes (available first) with "You ordered it N times" from familiarity (only when N ≥ 2); a dish Catalog no longer shows appears as the grey "Not cooking today" card with its kitchen's next-open text and up to 3 dishes that kitchen offers now (nothing is added to the cart automatically). Home chefs tab: saved kitchens, then "Your regulars" (up to 10 kitchens ordered from but not saved) each with a Save button (existing favourite-kitchen API). If `/saved-feed` fails, fall back to today's screen exactly.

### 1.36.17 · Lists, private only (M01 food lists)

Saved gets a third tab **Lists**: the person's lists (`GET /food-lists`), New list, open a list, rename/delete, remove a dish. A dish joins a list from a small list icon beside the heart and share icons on the dish sheet (the heart keeps working exactly as today), which opens an "Add to a list" sheet. Limits from the API (50 lists, 200 dishes) show as the API's message. No share button in this version.

### 1.36.18 · Group order (M02)

Entry points: "Order with friends" button on the kitchen page under the info pills (start a group), and a "Group orders" row in Profile (between Saved and Meal plans) that opens a screen with "Join with a code" and any open group from `GET /group-orders`, so people can get back to a group after leaving its screen. No deep link in this version.

Host: `POST /group-orders` for that kitchen → screen with join code, Copy / Share (Android share sheet with the code and a plain sentence, no link), time left, people and their dishes, Remove person, Lock switch, and "Review and pay" which calls `POST /group-orders/{id}/checkout` with `applyToCart=true` and then opens the existing cart; if the host's cart has other dishes the app asks before sending `replaceCart=true`. Joiner: enter the code → the group screen showing their own dishes.

**Picking dishes (owner's decision):** a dish picker inside the group screen ("Add dishes from <kitchen>" opens a sheet listing that kitchen's available dishes with photo, name, price and − / +), writing with `PUT/DELETE /group-orders/{id}/my-items/{menuItemId}`. The normal kitchen page, cart-add path and kitchen-switch popup are not touched. Each person's row shows their dishes or "No dishes yet" (there is no ready flag in the API, so the canvas's "Done / Choosing" labels and "I'm done" button are dropped). Host pays; the "settle your share directly" line stays.

### 1.36.19 · Picked for you + privacy (M18 personalised ranking, M22 consent/export/erase)

Settings → Privacy & security (`features/customerSettings/screens/CustomerSettingsLegacyScreens.tsx`): new "Your data" card with **Picks for you** switch (`GET/PUT /my-taste-data/consent`, `personalization`), **Download my data** (`GET /my-taste-data/export`, saved/shared as a JSON file via the existing document/share flow) and **Delete my taste data** (`DELETE /my-taste-data` with header `X-Confirm-Erase: ERASE`). The confirm step, in the app's existing dialog style, names exactly what goes and what stays (owner's decision): "This deletes your lists, your group orders and your picks setting. Your orders, account and saved dishes stay. This can't be undone."

Home (`features/home/components/HomePromoAndKitchens.tsx`): a "Picked for you" row after "Top kitchens near you", built by sending up to 20 nearby available dishes to `POST /personalized/rank` and showing the top 8 that have a reason, with the reason as the glass pill ("You ordered it before", "From a kitchen you saved"; the API gives reasons, not counts). **Hide rule:** hidden when consent is off, when the response says `personalized: false`, or when no dish has a reason.

### 1.36.20 · Earnings tiles + how much to cook (M15, M16)

`features/chefPayout/screens/ChefEarningsScreen.tsx`: two new tiles under the existing four for the chosen period: "Customers came back" (repeat / unique from `GET /chef-insights/summary`) and "Busiest time" (top India hour). A "How much to cook tomorrow" card opens a new "How much to cook" screen: day chips (today … +6 days), per dish "about N" with the fewest–most bar, "Based on your last 8 <weekday>s", from `GET /demand-forecast/dishes?date=`. Chef Home gets the compact "How much to cook today" card (top 3 dishes) under the Today tiles. **Hide rule:** tiles hide when the summary has no paid orders; the forecast card hides when no dish averages ≥ 1.

## Decided by the owner

- Only ready features; nothing that needs "coming soon" (2 Nov).
- Designs as on the canvas, matched to the real screens (2 Nov).
- Approach A, one feature per version, chef + customer together (2 Nov).
- Rider app untouched.
- Chef must confirm allergens ("None of these" or at least one) before facts publish (2 Nov).
- Group dishes are picked in a picker inside the group screen, not the kitchen page (2 Nov).
- Delete my taste data stays, with a confirm step naming what goes (2 Nov).
- Test on Relangi mavayya kitchen / "Ravi's test", cleaning up after each check (2 Nov).

## My calls (owner can change)

- Lock-screen tracking and list sharing moved to a later round (reasons above).
- Nutrition numbers left out of the chef form in 1.36.14.
- Busy-time end time rule (9 pm today, or 3 h when later than 8 pm).
- Hide rules above, including hiding cuisine/diet filters until labelled dishes exist.
- Group-order joining by code only (no link) in 1.36.18; "Group orders" row in Profile as the way back in.
- Picked for you shows only with consent, which is off by default.
- Filter & Sort opened from the Chefs tab stays as it is in 1.36.13 (kitchen-level cuisine filtering would be new work).
- Adding to a list uses a list icon on the dish sheet; the heart is unchanged.
- Saved keeps its current calls and adds `/saved-feed` on top.

## Left to the builder

Component structure, query caching and dedupe keys, exact copy for errors that match existing ones, test file layout, and how to share the export file using the existing download flow.
