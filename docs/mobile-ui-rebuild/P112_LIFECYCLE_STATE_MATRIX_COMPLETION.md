# P112 — Lifecycle-State Matrix Completion

## Status

**DONE at authorized code/audit scope.**

P112 audits the current mobile implementation boundary for lifecycle completeness and closes the shared lifecycle-policy gap without changing backend/APIM contracts, navigation, product layout, or later-phase behavior.

## Authority and branch boundary

- Branch: `mobile-ui-rebuild-from-scratch`
- Phase: P112 only
- P112 implementation base (including already-present later-phase work): `ac046f01a2d18ed8766a1b99571552f765ec5413`
- P112 lifecycle implementation commit: `012c8bb1a4884c97767186b0746a825c7246cb31`
- Source requirements: `plan.md`, `phases.md`, `agent.md`, `build.md`, full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- Existing P07 lifecycle primitives and P78 Reference-37 empty/offline system remain the owners reused by this phase.

The full guide requires applicable server-backed screens to model initial skeleton loading, populated state, pull/background refresh, incremental/paginated loading for long lists, empty, offline, permission-denied, recoverable error/retry, terminal error, mutation progress/result, and stale-data refresh while retaining prior valid data whenever safe.

## What P112 found

The existing repository already had the important lifecycle building blocks:

- `ContentLifecycle` preserved valid content through safe background refresh and handled initial skeleton, offline, recoverable-error, and terminal surfaces.
- `LifecycleStates` supplied reusable retry, offline, recoverable error, terminal, and permission presentation.
- P78 supplied the eight contextual Customer Reference-37 states without fabricating Favorites/Reviews/Coupons contracts.
- Feature phases already owned mutation busy/disabled/error handling at the control/form/domain level where mutations exist.

The remaining shared-policy gap was that `ContentLifecycle` had no explicit first-class primary empty/permission selection and no retained-content pagination/mutation-error overlays. Individual screens could implement those ad hoc, but P112 acceptance requires one coherent lifecycle matrix rather than leaving those states implicit.

## P112 implementation

`ContentLifecycle` is extended, backward-compatibly, with:

- explicit `empty` + `emptyState`,
- explicit `permissionBlocked` + `permissionState`,
- deterministic primary-state priority for initial loading / permission / terminal / empty / content,
- `loadingMore` retained-content pagination progress,
- `paginationError` + retry without replacing already-loaded pages,
- `mutationError` + retry without destroying valid content,
- combined busy semantics for background refresh or incremental loading,
- focused test IDs for pagination/mutation lifecycle surfaces.

Existing callers are unchanged because every new prop is optional. No current screen layout changes unless an owning screen opts into one of the newly explicit lifecycle states.

## Lifecycle-state matrix audit

Legend: **A** applicable and implemented/available at the current contract boundary; **N/A** not meaningful for that screen family; **BLOCKED** exact backend/provider capability is absent and P112 does not fabricate a state from nonexistent server data.

| Server-backed screen family | Skeleton | Populated | Refresh/stale | Pagination | Empty | Offline | Permission | Recoverable / terminal | Mutation |
|---|---|---|---|---|---|---|---|---|---|
| Customer Home / chef discovery / search | A | A | A | A where list contract pages | A incl. no-search-results | A | location permission where applicable | A | add/favorite only where exact contract exists |
| Dish detail / ingredients / public kitchen / full menu | A | A | A | menu list where applicable | A where collection can be empty | A | N/A unless media/platform permission is invoked | A | cart/favorite actions retain valid detail |
| Cart / pricing / checkout boundary | A when no snapshot | A | A through authoritative repricing | N/A | A — Empty Cart | A | N/A | A including conflict/terminal eligibility | A with duplicate-submit protection and retained valid lines |
| Customer Orders / detail / tracking | A | A | A | A where contract pages | A — No Orders | A | N/A | A | cancel/reorder/refund only where exact contract permits |
| Favorites | A when host contract exists | BLOCKED exact full host contract | BLOCKED | BLOCKED | adapter available — No Favorites | A at shell boundary | N/A | BLOCKED contract boundary explicit | BLOCKED where write contract absent |
| Notifications | A | A | A | bounded/paged per exact source | A | A | push permission belongs provider boundary, list read remains separate | A | mark-read state handled without clearing valid list |
| Customer Profile / Edit Profile | A | A | A | N/A | N/A | A | media/location permission where invoked | A | save/upload progress/error keeps draft/last valid profile |
| Saved Addresses / address form | A | A | A | bounded collection | A — No Saved Addresses | A | A for current-location flow when provider exists | A | add/edit/delete/default/deliver actions preserve valid list/draft |
| Payment methods / provider management | A where exact source exists | A where exact source exists | A | N/A | A where zero methods is valid | A | provider/runtime specific | A | provider mutation state only at exact approved boundary |
| Coupons / offers | BLOCKED exact catalogue/eligibility boundary | BLOCKED | BLOCKED | BLOCKED | adapter available — No Coupons | A at shell boundary | N/A | BLOCKED explicitly | BLOCKED — no fabricated apply/remove success |
| Reviews | BLOCKED exact customer review-list boundary | BLOCKED | BLOCKED | BLOCKED | adapter available — No Reviews | A at shell boundary | media permission only if future exact upload flow exists | BLOCKED explicitly | BLOCKED — no fabricated review write |
| Customer Settings / Support | A where server/config read exists | A | A where applicable | N/A / bounded | contextual empty only where meaningful | A | platform permission/preferences where applicable | A / explicit unsupported blocker | save/contact action only where exact persistence/contract exists |
| Chef Dashboard | A | A | A / near-real-time reconciliation | bounded active summaries | A for empty operational sections | A | N/A | A including fail-closed unavailable aggregates | quick actions/mutations keep last valid dashboard data |
| Chef Orders — New / Preparing / Ready / Completed / detail | A | A | A incl. P91 near-real-time refetch | A / bounded history | A per status tab | A | contact/platform permission only where invoked | A with stale-status recovery | A with duplicate-action guards and retained valid order state |
| Chef Menu / item detail / add/edit item | A | A | A | A/bounded at exact contract | A | A | media permission only if approved upload path exists | A | A for availability/create/edit, including rollback/dirty-state protection |
| Chef Analytics | A for available sources | A where exact metric source exists | A | N/A / bounded series | A/unavailable state as exact source dictates | A | N/A | A; unsupported metrics fail closed | N/A except filters/range query state |
| Chef Profile / Edit Profile | A | A | A | N/A | N/A | A | media/location permission only where exact capability exists | A | A; valid identity/draft retained across save errors |
| Chef Business Information / documents | A | A | A | bounded docs | A where no docs is contract-valid | A | file/media permission where approved | A + explicit unsupported document capabilities | supported edit/upload mutation only at exact P101 boundary |
| Chef Payout | A for exact ledger source | A for exact ledger source | A | bounded ledger where source permits | A where exact source returns none | A | N/A | A; missing balance/withdraw capabilities fail closed | withdraw remains disabled/blocked without exact contract |
| Chef Subscription | A only if exact future source exists | BLOCKED exact Chef plan API | BLOCKED | N/A | BLOCKED rather than fake no-plan state | A at shell boundary | N/A | explicit unavailable/blocked state | BLOCKED change/cancel mutation |
| Chef Preferences | A where established mechanism resolves | A/fail-closed configured state | A where persistence exists | N/A | N/A | A | platform notification permission where applicable | A / explicit persistence blocker | toggles/rows mutate only through a real persistence mechanism |
| Shared Customer/Chef notification counters/header reads | A | A | A | N/A | zero-count is populated state | A | push permission separate from server count | A | mark-read/header actions preserve prior valid data |

## Interpretation rules

1. **Not every state is appropriate to every screen.** P112 requires every applicable state, not artificial empty/permission/pagination states on screens that cannot enter them.
2. **Blocked contracts stay blocked.** P112 does not convert P60–P73/P86+ contract gaps into fake empty data or fake mutation success.
3. **Mutation state remains closest to the mutation owner.** Shared buttons/forms/domain handlers keep pending/disabled/error/rollback semantics; `ContentLifecycle.mutationError` is available when the screen needs a retained-content error surface.
4. **Pagination never destroys loaded pages.** Incremental loading/error is now modeled after valid content and can retry independently.
5. **Background refresh never flashes away prior valid content.** This P07 rule remains unchanged.
6. **Reference-37 contextual recovery remains P78-owned.** P112 does not duplicate its eight state adapters.

## Focused regression coverage

`apps/mobile/__tests__/LifecyclePrimitives.test.tsx` now covers:

- prior valid content retained during background refresh,
- skeleton reserved for initial no-content loading,
- deterministic permission / terminal / empty primary-state selection,
- explicit permission and empty surfaces,
- pagination progress without replacing loaded content,
- pagination error without replacing loaded content,
- mutation error without replacing valid content,
- existing reusable section/list skeleton and permission primitives.

## Changed files

Runtime/shared:

- `apps/mobile/src/shared/components/ContentLifecycle.tsx`

Focused tests:

- `apps/mobile/__tests__/LifecyclePrimitives.test.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P112_LIFECYCLE_STATE_MATRIX_COMPLETION.md`
- `build.md` (separate ledger commit after this evidence is recorded)

## Validation / guard state

- Implementation commit diff contains only the shared lifecycle primitive and its focused test.
- New properties are optional, so existing screen rendering remains backward-compatible.
- No backend, APIM, OpenAPI, infrastructure, navigation, auth/session, payment-provider, dependency, cache/persistence, or later-phase functional behavior is changed.
- Existing P113 accessibility semantics are preserved: lifecycle progress/error/busy states remain exposed through the existing accessible primitives.
- Existing P114 responsive/safe-area work present on the branch before this P112 completion is preserved and not altered by P112.
- GitHub Actions are not used because the account Actions capacity is exhausted.
- This connector-only run does not claim a full local Jest/typecheck/ESLint/bundle execution or device runtime lifecycle pass.

## Acceptance result

P112 acceptance is satisfied at the authorized code/audit boundary: **no currently completed/implemented server-backed screen family is left without an applicable lifecycle state policy at its exact contract boundary.** Contract-blocked capabilities remain explicitly blocked rather than being misrepresented as empty/success states.

P112 does not reclassify the product/contract completion status of any earlier feature phase and does not alter P113/P114 acceptance status.
