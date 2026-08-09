# P108 — Chef App Preferences UI

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P108 only  
**Guide reference:** 52 — Chef App Preferences  
**Status:** **PARTIAL at full Guide-52 completion scope; the real routed UI boundary is implemented, while persistence/runtime capabilities remain fail-closed exactly as established by P107.**

## 1. Scope reviewed

P108 was executed only after re-reading the controlling rebuild documents (`plan.md`, `phases.md`, `agent.md`, `build.md`), the P107 evidence/contract, the current Chef Profile/navigation implementation, and the full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` Reference 52.

Reference 52 requires Chef preference surfaces for language, currency, notifications, appearance, default preparation time, Auto Accept Orders, reminder interval, data/storage, and save state. It also requires the logical route `ChefAppPreferences`, Profile entry, shared Chef navigation/header behavior, and safe propagation/persistence semantics.

P107 established that the repository does not currently expose an approved authenticated Chef preferences persistence/runtime contract. P108 therefore does not manufacture device-local success, fake option catalogues, or customer-scoped persistence.

## 2. Implemented P108 boundary

P108 adds a real Profile-owned Chef App Preferences destination while retaining every unsupported mutation as explicit unavailable state.

Implemented:

- typed `ChefAppPreferences` route in the existing Chef Profile stack;
- Profile -> App preferences navigation using the existing Chef shell rather than a parallel navigator;
- real `ChefAppPreferencesScreen` using project design tokens, safe-area handling, `ChefHeader`, existing notification surface, and the existing Chef bottom navigation supplied by the nested Profile stack;
- Guide-52 presentation groups for Notifications, Language & region, Recipes/order preferences, Privacy, Reminder interval, Data & storage, and Appearance;
- visible language, currency, notification, Auto Accept, default preparation time, privacy, reminder, storage, and system-appearance controls without inventing persisted values;
- a typed P108 UI boundary derived directly from P107 capability/write boundaries;
- every unsupported control is `explain-only`, carries the exact P107 blocker reason, exposes no fake value, and has `writeAllowed: false`;
- explicit unavailable toggle treatment for Auto Accept Orders and system appearance rather than a misleading interactive switch;
- an explanatory modal that can be dismissed via Close, backdrop press, or Android back/request-close without creating a local preference draft;
- user-facing explanation that no local fallback or placeholder save is used;
- source tests for Guide-52 structure, fail-closed writes/values, modal open/close behavior, appearance/system-theme boundary, and absence of fabricated language/currency/preparation/reminder values.

## 3. Safety retained from P107

P108 deliberately does **not**:

- reuse Customer Settings as Chef preference persistence;
- create an AsyncStorage/MMKV Chef preference key;
- invent a Chef preferences APIM endpoint;
- hard-code language codes, currency values, preparation-time options, or reminder intervals;
- simulate successful notification preference writes;
- enable Auto Accept without server-backed eligibility, confirmation, persistence, and new-orders-only semantics;
- change the Chef shell theme locally without an app-wide appearance runtime contract;
- expose destructive storage/cache clearing while authentication or unsynced drafts could be at risk;
- add a Save button that cannot actually persist authoritative state.

The current Chef account, order state, operational counters, and edit-profile draft state are not mutated by the P108 screen.

## 4. Validation

- The changed TypeScript/TSX source was syntax-validated locally with the available TypeScript compiler (`transpileModule`) after reconstruction from the branch sources.
- Focused Jest source is committed for the P108 UI boundary. Full repository Jest/typecheck/build execution is not claimed from this connector-only run.
- GitHub Actions are intentionally not used as a P108 acceptance signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.
- Reference-image visual certification is **not** claimed: the implementation guide text is available, but the embedded image payload is not retrievable in this execution context. The screen therefore remains PARTIAL at full Guide completion scope.

## 5. Files changed for P108

Code:

- `apps/mobile/src/features/chefPreferences/domain/chefPreferencesUiBoundary.ts`
- `apps/mobile/src/features/chefPreferences/domain/chefPreferencesUiBoundary.test.ts`
- `apps/mobile/src/features/chefPreferences/screens/ChefAppPreferencesScreen.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/features/chefProfile/screens/ChefProfileScreen.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P108_CHEF_APP_PREFERENCES_UI.md`
- `build.md`

No customer UI, backend, APIM, OpenAPI, database, infrastructure, dependency, provider, secret, or P109 work is included.

## 6. Retained blockers / completion gate

P108 cannot be marked complete against the Guide while the P107 integration blockers remain unresolved:

1. authenticated Chef preferences read/update;
2. push registration + OS notification-permission reconciliation;
3. app-wide Chef localization propagation;
4. authoritative currency metadata + Chef shell currency propagation;
5. app-wide Chef appearance/theme propagation;
6. authoritative default-preparation-time options/persistence;
7. Auto Accept persistence, eligibility, confirmation, and new-orders-only activation;
8. authoritative reminder-interval metadata/persistence;
9. safe Chef storage/cache management protecting auth and unsynced drafts;
10. Chef preference privacy/security contract;
11. reference-image visual verification and full Android/device validation.

Therefore:

- **P108 — Chef App Preferences UI: PARTIAL at full Guide-52 completion scope; exact safe UI boundary implemented.**
- **P109 onward: NOT STARTED / NOT AUTHORIZED in this run.**

Stop after P108.
