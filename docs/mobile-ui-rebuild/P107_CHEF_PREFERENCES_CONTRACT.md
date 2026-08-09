# P107 — Chef Preferences Contract

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P107 only  
**Guide reference:** 52 — Chef App Preferences  
**Status:** **COMPLETED at the P107 contract-boundary scope; full Guide-52 persistence/runtime capabilities remain blocked where exact contracts do not exist.**

## 1. Scope reviewed

P107 was executed after re-reading the controlling rebuild documents (`plan.md`, `phases.md`, `agent.md`, `build.md`), the P106 evidence/boundary, current mobile settings code, and the full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` Reference 52.

Reference 52 requires these preference states:

- language;
- currency;
- notification preferences;
- appearance mode;
- default preparation time;
- Auto Accept Orders;
- reminder interval;
- data/storage settings;
- save state.

The required integration capabilities are Chef preferences read/update, push notification registration, feature flags, currency/language metadata, and storage/cache management. The Guide additionally requires cross-Chef-shell propagation for language/currency/appearance, OS permission reconciliation for notifications, explicit confirmation/eligibility/new-orders-only semantics for Auto Accept, and protection of authentication and unsynced drafts during storage actions.

P107 is a contract phase only. P108 owns the Chef App Preferences UI.

## 2. Current repository finding

No exact approved production contract was found that can truthfully persist and apply the Guide-52 Chef preferences end to end.

In particular, the current mobile/backend boundary does not establish:

1. authenticated Chef preferences read/update;
2. Chef notification-preference persistence reconciled with push registration and OS permission state;
3. app-wide Chef localization propagation;
4. app-wide Chef currency preference/metadata propagation;
5. app-wide Chef appearance/theme propagation;
6. authoritative default-preparation-time options/persistence;
7. Auto Accept Orders persistence, eligibility, and safe new-orders-only activation;
8. reminder-interval persistence/metadata;
9. Chef storage/cache management that proves auth tokens and unsynced drafts are protected;
10. a Chef App Preferences privacy/security settings contract.

Customer Settings is not reused to manufacture Chef persistence. Customer-scoped settings ownership and prior device-local behavior do not establish the server/role/runtime semantics required by Guide 52.

## 3. Implemented P107 boundary

Added `apps/mobile/src/features/chefPreferences/domain/chefPreferencesContract.ts` with:

- exact Guide-52 preference state keys;
- an explicit privacy capability required by the P107 acceptance language;
- explicit role/domain ownership for every preference capability;
- required integration-mechanism metadata for every capability;
- `CHEF_PREFERENCES_CONTRACT_UNAVAILABLE` as the common fail-closed code;
- `persistence: 'undefined'` and `uiExposure: 'blocked'` while persistence is not established;
- a complete-contract guard and unavailable-capability query;
- a write boundary that returns `allowed: false` for every unsupported preference;
- explicit exclusion of Customer Settings as a Chef persistence source;
- Auto Accept safety policy requiring confirmation, eligibility, and new-orders-only scope;
- notification policy requiring server preference state, push registration, OS-permission reconciliation, and system-settings recovery when blocked;
- storage safety policy requiring explicit confirmation while preserving authentication and unsynced drafts;
- a typed `ChefPreferencesSaveState` for the future P108 integration without fabricating a successful save model.

No endpoint URL, option catalogue, language code, currency, preparation-time value, reminder interval, feature flag value, preference payload, storage key, or successful mutation was invented.

## 4. Focused tests

Added `apps/mobile/src/features/chefPreferences/domain/chefPreferencesContract.test.ts` covering:

- all eight Guide-52 preference state keys plus the explicit privacy boundary;
- explicit owner and required mechanism coverage for every capability;
- fail-closed persistence/UI/write behavior;
- exact required API-boundary names without an invented Chef preferences endpoint;
- Customer Settings exclusion from Chef preference ownership;
- Auto Accept confirmation/eligibility/new-orders-only safety;
- notification OS-permission/system-settings reconciliation requirements;
- storage protection for authentication and unsynced drafts;
- absence of fabricated runtime endpoint, local-storage key, currency, or locale values.

Focused Jest source is committed, but Jest execution is not claimed from this connector-only phase. GitHub Actions are intentionally not used as a pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.

## 5. Files changed for P107

- `apps/mobile/src/features/chefPreferences/domain/chefPreferencesContract.ts`
- `apps/mobile/src/features/chefPreferences/domain/chefPreferencesContract.test.ts`
- `docs/mobile-ui-rebuild/P107_CHEF_PREFERENCES_CONTRACT.md`
- `build.md`

No screen, route, navigator, Profile row, P108 UI, customer UI, backend, APIM, OpenAPI, database, infrastructure, dependency, provider, secret, or unrelated Chef flow is changed by P107.

## 6. Phase gate / stop state

P107's contract boundary is complete and explicit, but the `phases.md` stop/go rule remains active: **do not proceed to the P108 UI while Chef settings persistence is undefined.**

Therefore:

- **P107 — Chef Preferences Contract: COMPLETED at authorized contract-boundary scope.**
- **P108 — Chef App Preferences UI: NOT STARTED / NOT AUTHORIZED while persistence remains undefined.**

This phase deliberately stops at that boundary instead of disguising missing production persistence with device-local state or fake success.
