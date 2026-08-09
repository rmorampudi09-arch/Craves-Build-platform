# P82 — Chef Dashboard Contract Model

**Status:** DONE at authorized code/CI scope  
**Guide ref:** 38 — Chef Dashboard  
**Phase start commit:** `2ed18a7bf927b0b86f02fcf9bf3fb305f6ca0ce2`  
**Validated mobile code head:** `dc2bbc4b574863db4d1e806598a4b75e5a2765c5`  
**CI:** workflow run `31303531996`, job `93220074043` — **SUCCESS**

## Implemented boundary

P82 establishes the typed, reconciliation-safe data boundary required by the future Chef Dashboard UI. It does not implement P83 presentation.

- Reuses P81's single Chef operational owner for Chef orders and in-app notifications rather than creating a parallel store or duplicate requests.
- Adds strict mobile parsing for the existing Chef earnings ledger.
- Adds strict mobile parsing for the existing Chef-owned menu-item list.
- Adds a Chef-scoped TanStack Query model for earnings and menu data, with abortable requests, private role-scoped keys, source lifecycle status, bounded stale times, and explicit refresh.
- Derives order, earnings, menu, and notification summaries only from authoritative records.
- Records unavailable dashboard capabilities as typed `BACKEND_CONTRACT_UNAVAILABLE` boundaries instead of displaying fabricated values or treating missing data as zero.

## Exact existing contracts used

### Orders and notifications — reused from P81

- `GET /api/v1/chef/orders`
- `GET /api/v1/notifications/in-app?limit=100`
- Existing notification read behavior remains `PATCH /api/v1/notifications/in-app/{noticeId}/read`; P82 adds no new notification mutation.

### Earnings

- `GET /api/v1/chef/earnings?limit=200`
- Supported ledger statuses: `DRAFT`, `APPROVED`, `SETTLEMENT_PENDING`, `SETTLED`, `REVERSED`.
- Supported order sources: `ON_DEMAND`, `SUBSCRIPTION`.
- The mobile parser validates UUIDs, currency, timestamps, bounded amounts, and server arithmetic: gross minus commission minus tax withheld plus adjustment equals net payable.

### Menu

- `GET /api/v1/kitchens/me/menu-items`
- Supported menu statuses: `DRAFT`, `ACTIVE`, `INACTIVE`.
- Supported food types: `VEG`, `NON_VEG`, `EGG`.
- Supported spice levels: `MILD`, `MEDIUM`, `SPICY`.
- The parser validates item/image identifiers, price/currency, availability, package metadata, public image URLs, and timestamps.

## Reconciliation-safe derived model

The contract model exposes:

- order summary: pending acceptance, active, ready-for-pickup, and active order records;
- earnings by currency: approved net payable, settlement-pending net payable, settled net payable, plus recent ledger entries;
- menu summary: total items, active items, sellable items, active items with a public image;
- notifications: unread count plus recent bounded records.

No independently stored dashboard totals were introduced. Order/notification values reuse the same records that drive P81 Chef badges, preventing a second source of truth.

## Explicit unavailable capabilities

The repository does not currently provide an approved exact contract for the following Reference-38 logical capabilities:

- one Chef dashboard aggregation endpoint;
- authoritative wallet/withdrawable balance, payout destination, withdrawal eligibility, or payout initiation;
- Chef sales analytics aggregate/time-series data;
- Chef recent reviews/read model;
- Chef business insights.

These are represented by typed unavailable states. P83 must not invent wallet, analytics, review, or insight values and must not enable Withdraw without a future approved payout-eligibility contract.

## Files added / changed

- `apps/mobile/src/features/chefDashboard/api/chefDashboardApi.ts`
- `apps/mobile/src/features/chefDashboard/api/chefDashboardApi.test.ts`
- `apps/mobile/src/features/chefDashboard/domain/chefDashboardModel.ts`
- `apps/mobile/src/features/chefDashboard/domain/chefDashboardModel.test.ts`
- `apps/mobile/src/features/chefDashboard/state/useChefDashboardModel.ts`
- `apps/mobile/src/features/chefShell/state/ChefOperationalProvider.tsx` — narrow change exposing P81's already-owned Chef order records to the P82 model.

## Validation

GitHub Actions workflow `.github/workflows/mobile-phase1-ci.yml` completed successfully for validated mobile code head `dc2bbc4b574863db4d1e806598a4b75e5a2765c5`:

- dependency install — success;
- TypeScript strict check — success;
- ESLint — success;
- Jest, including P82 focused contract/domain tests — success;
- production Android JavaScript bundle — success;
- backend/APIM/infrastructure source guard — success.

## Phase boundary

P82 ends at the data/contract/query model. **P83 — Chef Dashboard UI is not implemented by this phase.** No P84+ Chef feature work is included.
