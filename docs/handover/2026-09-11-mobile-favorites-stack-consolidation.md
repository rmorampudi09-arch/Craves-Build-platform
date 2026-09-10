# Craves Mobile Favorites P1A–P3 Consolidation

Date: 2026-09-11

## Status

The complete reviewed Favorites mobile stack has been consolidated bottom-up into the active `mobile-ui-rebuild-from-scratch` branch.

Merge order used to preserve the stacked dependency chain:

1. PR #278 (P3 Your Usual / Order Like Last Time) into the P2 branch.
2. PR #275 (P2 favorite home-chef and kitchen relationships / Cooking Today, now including P3) into the P1B branch.
3. PR #271 (P1B enriched Saved, now including P2 and P3) into the P1A branch.
4. PR #267 (P1A optimistic/offline Saved, now including P1B, P2 and P3) into `mobile-ui-rebuild-from-scratch`.

## Customer experience now consolidated

- optimistic dish save/remove;
- offline pending-intent persistence and safe replay;
- latest-intent collapse for repeated offline toggles;
- account-switch/logout isolation for private favorite state;
- enriched Saved cards backed by Catalog truth;
- visible unavailable/retired/missing-item states rather than silent deletion;
- favorite dishes, home chefs and kitchens as separate relationships;
- authoritative `Your favorites are cooking today` from Catalog schedules/current menus;
- explicit in-app notification preference rather than automatically opting a customer in;
- `Your usual` ranking from the customer’s private completed-order history;
- `Order Like Last Time` using the existing server-side atomic reorder path;
- explicit cart-replacement confirmation;
- current-Catalog validation before replacing the cart;
- same-kitchen recovery when a historic basket can no longer be recreated exactly;
- previous totals clearly labeled as historical, never represented as current pricing;
- no fabricated spice/oil/portion preference recall.

## Existing owning-service dependencies

The corresponding clean backend and APIM integrations were already merged into `main` through PRs #265, #283, #284, #285 and #286. Web dish Favorites was merged through PR #292.

## Safety boundaries

- No pricing, commission, delivery-radius, tax, FSSAI or refund rule was introduced.
- No Azure resource, APIM operation, Firebase project, mobile signing key, app-store configuration or production provider setting was changed by the mobile stack merges.
- Automatic availability-notification dispatch remains fail-closed until the product owner supplies an approved global notification cap and quiet-hour policy and the Notification Service runtime path is certified.
- Historical order information is used only inside the authenticated customer scope.
- Current Catalog and Order services remain authoritative for availability, basket validity and current totals.

## Validation already completed on the source PRs

Each source PR completed its dedicated GitHub Actions validation before consolidation, including locked dependency installation, TypeScript regression checks, ESLint, focused Jest/contract tests, Android production JavaScript bundle generation, source-scope guards and reviewed source artifacts.

A final exact-head validation of the consolidated active mobile branch is still required because a successful stacked-source run is not the same as validating the final merged branch and native release candidate.

## Required final certification

1. Run the active mobile branch CI/Android release-candidate pipeline on the exact consolidated head.
2. Confirm no new TypeScript, lint, test or Android bundle failure.
3. Test online save/remove and persistence after app restart/refetch.
4. Test offline toggles, replay after reconnect and latest-intent collapse.
5. Test logout/account switching so one customer cannot see or replay another customer’s pending favorite state.
6. Test Saved enrichment and current availability against production-like Catalog data.
7. Test favorite chef/kitchen relationships and Cooking Today.
8. Test Your Usual and reorder with an empty cart, a non-empty cart and an unavailable historic item.
9. Validate TalkBack, large text, slow network and small-screen behavior.
10. Validate the exact signed Android and iOS release candidates before store promotion.

## Manual work deliberately minimized

No source-file copying or conflict resolution should be performed manually. Human work is limited to exact-device/customer-experience acceptance and, later, app-store/Firebase signing-console actions that cannot be automated safely.
