# Craves Mobile World-Class Feature Consolidation — Handover

Date: 2026-09-10
Status: **source consolidation prepared; runtime and store release remain gated**

## Purpose

This handover records the safe consolidation of the current React Native Craves application and the previously unmerged Favorites 2.0 mobile feature stack into a clean branch based on `main`.

The work deliberately avoids merging the long-diverged `mobile-ui-rebuild-from-scratch` branch wholesale. Instead, only the reviewed `apps/mobile` application tree is imported into a fresh `main`-based branch. This prevents old backend, APIM, pipeline or infrastructure history from overwriting the current production baseline.

## Exact source provenance

Authoritative mobile source branch after the stacked feature merges:

```text
mobile-ui-rebuild-from-scratch
fe51d6e5e2e67da005d4a281197d2e247deadf55
```

Clean consolidation base:

```text
main
42dc4aaf5b9bed1ec9988e097547d0c09f255787
```

Consolidation branch:

```text
feature/mobile-world-class-consolidation-20260910
```

## Stacked mobile PRs integrated in dependency order

The original stacked PR topology was preserved and merged from the deepest child upward:

1. PR #278 — `Your usual` / `Order Like Last Time` into P2.
2. PR #275 — favorite chefs and kitchens, `Cooking Today`, and the incorporated P3 work into P1B.
3. PR #271 — enriched Saved plus the incorporated P2/P3 work into P1A.
4. PR #267 — the complete P1A-P3 stack into `mobile-ui-rebuild-from-scratch`.

This order ensures that no child feature is lost when the root PR reaches the active mobile branch.

## Customer-facing capabilities now present in the mobile source

### P1A — optimistic and offline-safe Saved

- immediate optimistic heart updates;
- rollback for non-retriable failure;
- identity-scoped offline mutation queue;
- latest-intent collapse for repeated offline toggles;
- safe replay after identity hydration and app resume;
- account-switch and logout isolation;
- protection against in-flight replay resurrecting data for the previous account;
- visible pending-sync states.

### P1B — enriched Saved experience

- bounded Catalog batch resolution rather than menu-and-kitchen request fan-out;
- current dish, kitchen, image and schedule-derived presentation;
- truthful `Cooking today`, `Cooking later`, paused and unavailable states;
- unavailable, retired and missing memories remain visible and removable;
- no fabricated `sold out`, stock, health, freshness, serviceability or scarcity claims.

### P2 — relationship workspace

- Saved workspace for dishes, home chefs and kitchens;
- separate follow/save relationships for chefs and kitchens;
- `Your favorites are cooking today` from authoritative Catalog data;
- current menu previews and navigation to today's menu;
- explicit in-app notification preference instead of silently enabling notifications from a heart action;
- inactive and missing relationship tombstones remain removable.

### P3 — habit and safe repeat ordering

- private, identity-scoped repeat candidates;
- deterministic `Your usual` ranking based on first-party order frequency/recency and optional current favorite-kitchen cooking state;
- historical basket summary and explicitly labelled `Previous total`;
- current Catalog validation before cart replacement;
- explicit confirmation before replacing a non-empty cart;
- no silent dish substitution;
- same-kitchen recovery when a historic basket is no longer valid;
- previous spice/oil/portion choices are not fabricated when stable historical option identifiers are unavailable.

## Backend and gateway dependencies already represented on main

The mobile consolidation is paired with the previously merged backend/API foundations:

- PR #265 — Favorites P0 reliability and APIM foundation;
- PR #283 — clean User/Chef relationship persistence;
- PR #284 — clean Catalog Saved and home-feed integration;
- PR #285 — clean Order repeat-candidate integration;
- PR #286 — P2/P3 APIM publication source;
- PR #292 — customer-web dish favorites.

Runtime certification of these routes is still required before describing the complete mobile experience as production-active.

## Paths added by this consolidation

```text
apps/mobile/
.github/workflows/mobile-world-class-consolidation-ci.yml
docs/handover/2026-09-10-mobile-world-class-consolidation.md
```

No backend service, database migration, production APIM policy, Azure resource, payment-provider configuration, delivery-provider configuration or commercial rule is changed by this consolidation.

## Secret and signing boundary

The following files are deliberately excluded from the clean main-based candidate even though they existed on the long-lived mobile branch:

```text
apps/mobile/android/app/google-services.json
apps/mobile/android/app/debug.keystore
```

The app-level `.gitignore` is strengthened to reject:

```text
google-services.json
GoogleService-Info.plist
*.keystore
```

The consolidation CI also fails if Firebase native configuration, Android signing stores, Apple provisioning profiles, certificates or private keys are committed.

## Automated CI gate

Workflow:

```text
.github/workflows/mobile-world-class-consolidation-ci.yml
```

The gate performs:

1. exact candidate checkout;
2. mobile-only scope verification against `main`;
3. Firebase/signing material rejection;
4. locked `npm ci` dependency installation on Node 22.13;
5. strict TypeScript validation;
6. ESLint with zero warnings;
7. the complete Jest suite;
8. production Android JavaScript bundle generation;
9. reviewed source-package generation and artifact upload.

A native signed Android or iOS binary is not produced by this source gate because Firebase console files and owner-controlled signing material must not be stored in source control.

## Runtime status boundary

This consolidation does **not** claim that the following occurred:

- Android or iOS production signing;
- Google Play or Apple App Store upload;
- Firebase Console change;
- APIM write;
- Container App deployment;
- paid Azure resource creation;
- production customer notification activation;
- payment or delivery-provider change;
- real customer transaction.

## Manual certification required before mobile release

### Firebase Console

- confirm the final Android package and iOS bundle identifiers;
- download fresh Android and iOS Firebase native configuration files;
- apply Android API-key restrictions and iOS bundle restrictions where supported;
- confirm Phone Authentication and authorized domains/test identities;
- keep the downloaded files in secure local/CI storage and never commit them.

### Android

- create or select the production upload/signing key in the Google Play Console;
- store the keystore and passwords in the chosen secure CI secret store;
- inject `google-services.json` only during the trusted build;
- run a clean release build and test on at least one lower-end and one current Android device;
- verify background/resume, network loss, notification navigation, logout/account switch and accessibility.

### iOS

- complete Apple Developer enrollment and application registration;
- create distribution certificates and provisioning profiles;
- add `GoogleService-Info.plist` only to the trusted build environment/Xcode target;
- install CocoaPods on macOS and run a clean archive;
- test notification permission, background/resume, Keychain isolation and accessibility on a physical iPhone.

### Product decisions

The automatic Favorites availability notification worker must remain disabled until the owner approves exact values for:

- notification frequency/global cap;
- quiet hours and timezone behavior;
- serviceability requirement before sending;
- push versus in-app channel policy.

No default values are invented in this consolidation.

### Controlled device scenarios

- save/remove online and verify persistence after restart;
- save/remove while offline and verify latest-intent replay;
- expire the session during replay and verify no duplicate mutation;
- switch between two accounts and verify no Saved or repeat-order leakage;
- verify Cooking Today only from current Catalog truth;
- verify inactive/missing favorites remain removable;
- repeat a delivered order with an empty cart;
- repeat with an existing cart and confirm replacement explicitly;
- verify a price change displays the new Cart price rather than the historic total;
- verify an unavailable historic item leaves the current cart unchanged;
- test TalkBack/VoiceOver and large text.

## Azure and deployment notes

The established Azure DevOps service connection is:

```text
Craves-Dev-Service-Connection
```

No new service connection is required for this source consolidation. Any later APIM or Azure deployment must remain behind its existing explicit confirmation parameter. No billable resource is created by this work.

## Rollback

Until the consolidation PR is merged, rollback is simply to close the PR; production is unchanged.

After a future source merge but before store publication, revert the merge commit. Since this module is additive and does not run database migrations or Azure writes, source rollback has no provider or financial side effect.

After a future mobile-store rollout, use staged release controls and retain the previous signed build for store-level rollback. Store rollback is a manual console action.

## Current recommendation

Keep the clean consolidation PR open until:

1. the GitHub consolidation workflow is green on the exact head;
2. the active mobile branch integration workflow is green on `fe51d6e5e2e67da005d4a281197d2e247deadf55`;
3. the production backend/APIM route inventory is verified;
4. Android device certification passes;
5. iOS build/certification is scheduled or explicitly deferred for an Android-first pilot.

Only then merge the clean candidate to `main`. Store publication remains a later, separately controlled release action.
