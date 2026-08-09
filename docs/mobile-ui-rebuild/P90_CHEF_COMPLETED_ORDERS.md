# P90 — Chef Completed Orders

Status: **PARTIAL at full Guide completion scope; the mobile Completed surface is implemented to the exact currently authorized Chef/backend boundary.**

## Phase boundary

- Phase start: `a3e29b687f80dc14cd5a45f07652e7854108c094`.
- P90 code end: `ab10161d36d64f692e7708744be6705fc9442979`.
- P91 / Chef Realtime Order Reconciliation was not implemented or started.

## Scope implemented

- Added the typed logical route `ChefOrdersCompleted` to the existing nested Chef Orders stack and registered a dedicated Completed screen.
- Reused the P86 authoritative Chef order projection where `DELIVERED` maps to the `COMPLETED` tab; no second order store, endpoint, lifecycle enum, or client-only completed state was created.
- Added a read-only Completed history surface with current completed count, virtualized delivered-order cards, item summaries, delivery-area summaries, loading skeleton, empty/error/retry states, pull refresh, bounded paging, independent Completed scroll preservation, and existing Chef order-detail navigation.
- Added `View Details` as the only order-level action. The Completed card itself contains no Accept, Reject, Mark Ready, pickup, or other active-order mutation control.
- Enabled Completed status entry from New, Preparing, and Ready. Each entry preserves the source tab scroll offset, updates the shared selected-status state, and navigates through the typed `ChefOrdersCompleted` route.
- Preserved full tab navigation back from Completed to New, Preparing, and Ready.
- Added a focused timestamp helper/test that labels the only exposed list timestamp as **server update age**. The UI does not claim that `updatedAt` is an authoritative delivery timestamp.
- Kept reports, insights, date filtering, and post-delivery calling hidden rather than rendering no-op controls or inventing unsupported contracts.

## Exact contracts available to P90

Chef order contracts:

- `GET /api/v1/chef/orders`
- `GET /api/v1/chef/orders/{orderId}`

The existing Chef list contract includes the server lifecycle status `DELIVERED`, which the established P86 tab architecture maps to `COMPLETED`.

The Chef controller does **not** expose:

- a Completed-only endpoint or status/date query parameters,
- server page/cursor parameters for completed history,
- a dedicated `deliveredAt` field,
- completion reports or completion-metrics endpoints,
- a post-delivery contact authorization/privacy-window contract.

The existing Chef order-detail contract is reused for `View Details`; no new detail endpoint was invented.

## Read-only / truthfulness behavior

Completed records are rendered from server-reported `DELIVERED` orders only. The screen never performs an order mutation.

Because the list response exposes `updatedAt` but not `deliveredAt`, the card says `Server updated …` instead of presenting a fabricated delivery timestamp. Because post-delivery call authorization is not represented by an exact contract, P90 does not expose a Completed `Call Customer` control even though detail data can contain contact information.

Reports/Insights and date-range controls are also omitted until an authoritative completion-metrics/history contract exists. This avoids a static/no-op surface and keeps P90 within the current backend ownership boundary.

## Changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefOrders/domain/chefCompletedOrders.ts`
- `apps/mobile/src/features/chefOrders/domain/chefCompletedOrders.test.ts`
- `apps/mobile/src/features/chefOrders/screens/ChefCompletedOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/screens/ChefNewOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/screens/ChefPreparingOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/screens/ChefReadyOrdersScreen.tsx`

Evidence / ledger:

- `docs/mobile-ui-rebuild/P90_CHEF_COMPLETED_ORDERS.md`
- `build.md`

## Validation / guard state

- Phase-start → code-end compare is one commit ahead and contains exactly the eight `apps/mobile` files listed above.
- No `services/`, `openapi/`, `infra/`, or `apps/api/` source was modified.
- The existing P86 focused tab test already verifies that server `DELIVERED` maps once into the `COMPLETED` count and that Completed retains independent page/scroll state.
- P90 adds focused unit-test source for completed server-update timestamp derivation, including malformed/missing values and future clock skew.
- GitHub Actions validation is **not claimed** for P90. The user confirmed the repository's GitHub Actions monthly limit has been reached and explicitly asked to proceed without Actions for now. No TypeScript, ESLint, Jest, Android bundle, or device result is represented as passing.
- The current connector environment does not provide an executable private-workspace checkout suitable for project-wide local Android/runtime validation, so local repository certification is not claimed.

## Full-Guide blockers retained instead of fabricated

1. **Server-side completed history paging/filtering:** `GET /api/v1/chef/orders` remains a bounded feed without Completed/status/date/page/cursor query parameters. P90 uses the established bounded P86 client projection/page only.
2. **Authoritative delivery timestamp/date range:** the list exposes `updatedAt`, not a dedicated `deliveredAt`; therefore delivery-date filtering and exact delivered timestamps cannot be implemented truthfully.
3. **Completion reports/metrics:** no exact completion reports or metrics endpoint is exposed, so Guide-level completionMetrics/Reports are not synthesized from partial list data.
4. **Insights/Analytics parity:** the Guide requires Completed insights to match authoritative Analytics metrics, but the required completion-metrics contract is absent and the broader Chef Analytics surface is outside P90.
5. **Post-delivery customer contact privacy window:** the backend does not expose an exact Chef authorization/privacy-window signal for after-delivery calling, so Completed does not add a `Call Customer` control.
6. **Item thumbnails/media:** the shared Chef list projection exposes item identity/name/quantity but no authoritative item-media field for completed-card thumbnails.
7. **Reference Image 43 certification:** the Guide text is available, but the embedded reference image is not independently renderable through the current repository/file tooling; pixel-level certification is not claimed.
8. **Android/device and repository CI certification:** GitHub Actions monthly capacity is exhausted and no emulator/device validation was performed in this phase.

## Completion classification

P90 is therefore **PARTIAL**, not DONE. The authorized Completed history/paging/detail flow is implemented as a bounded, read-only projection of real `DELIVERED` orders, including all-tab access and truthful timestamp semantics. Full Guide completion remains blocked by missing server completed-history filtering/paging, authoritative delivery timestamps, completion metrics/reports, post-delivery contact authorization, item media, reference-image certification, and runtime/CI gates.

## Stop boundary

P91 — Chef Realtime Order Reconciliation remains unimplemented and unauthorized after this phase.
