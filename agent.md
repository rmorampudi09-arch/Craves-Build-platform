# CRAVES Mobile Agent Operating Instructions

**Purpose:** Persistent instructions for any AI coding agent or engineer continuing the CRAVES mobile rebuild. Read this file before touching source.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Required branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Primary guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` with 52 embedded reference images.

---

## 1. Mission

Implement the complete CRAVES customer + chef mobile application from the approved reference guide while preserving the existing repository architecture and exact backend/APIM contracts. Work in small authorized phases, integrate real backend behavior, validate each phase at code level, record progress in `build.md`, and stop for user authorization before beginning another phase.

Do not optimize for quickly producing screenshots or an APK. Optimize for a coherent, production-quality application whose UI, state, API integration, security, performance, accessibility, and tests are correct.

---

## 2. Mandatory Reading Order at the Start of Every Work Session

Before implementing anything:

1. Read `agent.md` completely.
2. Read `build.md` to learn the current accepted commit/status and the exact next authorized phase.
3. Read the applicable section of `phases.md`.
4. Read `plan.md` for cross-cutting architecture and acceptance rules.
5. Open the corresponding section/reference image in the **full 183-page** master guide.
6. Inspect the current source files that own the relevant navigation/state/API/theme behavior.
7. Inspect the exact APIM/OpenAPI/backend contract files for the phase before writing a network wrapper or mutation.
8. Confirm the current branch HEAD before making changes.

Never begin from memory alone when the repository or guide can answer the question.

---

## 3. Authority and Conflict Resolution

Use this order:

1. Existing approved backend/APIM/OpenAPI contract, security policy, and repository architecture.
2. 183-page master guide + embedded reference image for UI/UX/behavior.
3. Current approved user instruction.
4. `agent.md`, `plan.md`, `phases.md`, `build.md` for execution/tracking.

If the guide names a logical capability but the exact contract is absent, **do not invent it**. Record the missing capability as a blocker in `build.md` and keep the production integration behind a typed, explicit boundary only when doing so is useful and non-deceptive.

---

## 4. Absolute Prohibitions

The agent MUST NOT:

- modify backend service code, APIM definitions, infrastructure, database migrations, or server pipelines as part of a mobile phase unless the user separately gives explicit authorization,
- invent endpoint URLs, APIM route keys, HTTP methods, path/query parameters, JSON fields, enums, status values, pagination semantics, idempotency behavior, or authentication behavior,
- hardcode production user/order/catalog/payment/location data to make a screen look finished,
- hardcode secrets, environment URLs, tokens, OTPs, passwords, production credentials, private keys, raw card/UPI/bank data, or sensitive chef documents,
- create a duplicate navigation container, API client, state store, query client, theme system, analytics system, secure-storage implementation, or component family when the repository already has one,
- leave empty `onPress` handlers, TODOs, placeholder functions, unreachable routes, fake success flows, mock-only branches, or static-only controls in a phase marked `DONE`,
- claim a screen is pixel-perfect or visually certified without actual device/emulator/reference comparison evidence,
- claim a backend action is end-to-end functional when the exact contract/environment is missing,
- build an APK merely because a phase is finished,
- automatically advance to the next phase after finishing the current one,
- use an older APK/branch/artifact as evidence of current rebuild completion,
- expose private chain-of-thought or sensitive tool output in source/docs/logs.

---

## 5. Phase Authorization Rule

Only implement the phase explicitly authorized by the user.

Typical flow:

1. User says `start next phase`.
2. Read `build.md` and determine the next phase that is actually pending/authorized.
3. Implement only that bounded phase and any strictly necessary shared change.
4. Validate it.
5. Update `build.md`.
6. Report the result.
7. Stop.

Do not pre-implement the next phase “while already there”. If a shared change is necessary for the current phase, make it narrowly and record it.

---

## 6. Repository and Git Discipline

- Work only on `mobile-ui-rebuild-from-scratch` unless the user explicitly changes the branch strategy.
- Fetch/check HEAD before writes.
- Keep commits phase-oriented and clearly named.
- Prefer small logical commits when needed, but the final state of one phase must be easy to identify.
- Do not force-push/rewrite accepted history without explicit reason and authorization.
- Do not casually delete historical backend files/workflows.
- The backend guard baseline is `8a2444cde508ea2fb20cb9822397e55c29bd8c5f` unless `build.md` records an approved replacement.
- After every phase, update `build.md` with start/end commit, changed files, exact contracts, tests, blockers, and next authorization state.

---

## 7. Tool / Access Policy

Tool availability can differ by session. Use the following when they are exposed; never pretend a connector exists if it is not available.

### 7.1 GitHub connector — primary repository tool

Use GitHub access for:

- reading current branch/source,
- locating exact APIM/OpenAPI/backend contract files,
- comparing commits,
- creating/updating mobile files,
- committing phase work,
- reading GitHub Actions workflow runs/jobs/logs,
- validating that only authorized paths changed.

For repository content, prefer the GitHub connector over web search.

### 7.2 File Search / File Library — primary guide/reference tool

Use file search for:

- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`,
- its exact screen section, states, required APIs, smart behaviors, and completion gate,
- previously uploaded reference documents/images when relevant.

Important: several similarly named guides may exist. The complete project source is the **183-page version containing all 52 embedded reference images**. The 75-page file covers only the 19 customer implementation units and must not silently replace the full guide when planning the complete app.

### 7.3 Container / local execution — validation and file inspection

When available, use a container for:

- checking local copies/artifacts,
- text/file inspection,
- applying/testing patches on a checked-out source copy,
- deterministic non-network transformations.

Do not treat a local stale copy as newer than GitHub HEAD.

### 7.4 Python — analysis only unless user-visible output is explicitly needed

Use Python for deterministic analysis such as data/file comparison. Do not use it as a substitute for the real React Native test/build toolchain.

### 7.5 Web access — external official documentation only when needed

Use web research only for genuinely external, current documentation such as React Native/Firebase/Cashfree/library behavior when the repository does not answer the question.

Never use public web search as a substitute for the project’s exact APIM/OpenAPI contract. A generic Firebase/Cashfree example does not authorize changing CRAVES request/response models.

### 7.6 Image/reference tooling

Reference images from the guide are authoritative for visual QA. If visual certification is requested, use an actual emulator/device/screenshot workflow or approved image comparison process. Do not infer pixel fidelity from source code alone.

### 7.7 CI access

Use the repository’s implementation CI during phases. Inspect actual run conclusions and failing step/log evidence. Do not say CI passed without checking the relevant run.

---

## 8. Current Code-Level Validation Policy

During normal implementation phases run/require:

- dependency install from lockfile,
- TypeScript strict check,
- ESLint,
- Jest/focused tests,
- production Android JavaScript bundle generation,
- backend/APIM/infrastructure source guard.

Current workflow: `.github/workflows/mobile-phase1-ci.yml` (the filename is historical; its purpose is now general mobile implementation CI).

**Do not add Gradle/APK packaging to every phase.**

A complete release APK/AAB belongs only to the final release phase after functional/visual/security/performance/regression gates are complete.

---

## 9. API Contract Workflow — Required Before Every Integration

For each network-backed feature:

1. Search the repository for the exact capability/route definition.
2. Open the APIM/OpenAPI/source model actually used by the backend.
3. Record:
   - route key/name,
   - HTTP method,
   - path,
   - path/query/header parameters,
   - request body schema,
   - response schema,
   - status/error semantics,
   - pagination/cursor rules,
   - idempotency/version requirements,
   - auth/role requirements.
4. Compare with existing mobile typed clients/models.
5. Reuse existing models/wrappers when correct.
6. Add a typed wrapper only for an exact known contract.
7. Add focused contract/model tests where valuable.
8. Record the exact contract source in `build.md`.

If step 2 fails, do not guess step 3.

---

## 10. Architecture Rules

### Presentation

- Receives typed state/handlers.
- Owns layout/accessibility/visual interaction.
- Must not own transport or secure persistence logic.

### Domain / feature logic

- Owns user-flow rules, validation orchestration, reconciliation, derived state, idempotency guards.

### Data access

- Owns exact typed APIM requests, response mapping, cache/query behavior, normalized errors.

### Platform integration

- Owns Firebase, secure storage, native provider SDK, permissions, deep links, notification registration.

Keep boundaries clear. Screen files may coordinate, but they should not become giant transport/business-rule modules.

---

## 11. State Ownership Rules

### Server/query state

Catalog, chefs, dishes, orders, notifications, reviews, offers, addresses, payment method tokens, analytics, payouts, subscriptions, business documents, support content.

### Global app state

Session/role, cart summary/domain, selected location, shared badges, safe profile summary, app preferences, feature flags, route restoration.

### Local screen state

Focus, open section, unsaved local draft, gallery index, selected chip before Apply, modal visibility.

### Secure state

Refresh credentials only in approved secure storage. Access token remains memory-only.

Do not independently store the same authoritative total/status/count in multiple stores/screens.

---

## 12. Customer Smart-UI Rules

### View Cart

- Zero items: hidden.
- First successful add: show automatically.
- Use Espresso Brown where reference specifies.
- Keep live item count/authoritative total synchronized.
- Remove immediately at zero.
- Never show in Chef role.
- Hide on auth/checkout/payment/full-screen/route-policy immersive screens.

### Customer bottom navigation

Tabs: Home, Chefs, Orders, Profile.

- Active Flame Red state.
- Hide on downward scrolling; reveal upward/top/tab transition.
- Preserve tab stacks/scroll/filter/query state.
- Never overlap View Cart/sticky actions/system gesture areas.

### Cross-screen synchronization

Cart, location, notification badge, favorites, order counts, rewards/profile summary must update relevant screens without manual refresh.

---

## 13. Chef Smart-UI Rules

- Never render customer View Cart/cart state in Chef experience.
- Tabs: Dashboard, Orders, Menu, Analytics, Profile.
- Synchronize order counters, notification badges, active-order cards, menu availability, payout balance, analytics totals, identity/verification state.
- Preserve selected status/date/filter/search/scroll state.
- Derive timers from server timestamps.
- Revalidate order status before mutations.
- Guard accept/reject/ready/pickup/payout/plan-change actions against duplicate submission.
- Use real-time/near-real-time only through the project-supported mechanism; do not invent high-frequency polling.

---

## 14. Required Lifecycle States

For every applicable server-backed screen implement and test:

- initial loading/skeleton,
- populated state,
- background refresh while preserving valid data,
- pull-to-refresh where appropriate,
- pagination/load-more,
- empty state,
- offline/stale cached state,
- permission denied,
- recoverable error + retry,
- terminal/auth/resource error,
- mutation pending/disabled,
- mutation success,
- mutation failure/rollback/reconciliation,
- stale/deleted resource,
- session-expiry refresh/re-auth behavior.

Do not produce infinite retry loops or layout flashes.

---

## 15. Visual Implementation Rules

- Reference image is the visual contract.
- Do not redesign, simplify, or genericize it for convenience.
- Use shared design tokens for values not explicitly visible.
- Match safe-area spacing, hierarchy, typography scale, brand accents, surfaces, card geometry, radius, borders/shadows, icons, image crop/focal point, vertical rhythm, scroll proportion, sticky/floating controls.
- Paired empty/active-cart references must share underlying route/domain logic; do not duplicate whole screens to match two images.
- Use cached/appropriately sized media and skeletons to avoid layout shift.

Final pixel-fidelity certification requires actual device/emulator/reference comparison.

---

## 16. Accessibility / Responsive Rules

Each completed phase must consider:

- Android safe areas/system bars/gesture navigation,
- compact/standard/large phone widths,
- keyboard/IME avoidance,
- dynamic font scaling,
- minimum touch targets,
- screen reader label/role/state,
- focus order,
- contrast,
- disabled reason where needed,
- reduced motion,
- large-screen width constraint if relevant.

Do not defer obvious accessibility defects until final QA if they can be fixed in the phase.

---

## 17. Performance Rules

- Virtualize/paginate unbounded collections.
- Stable keys/IDs.
- Keep pages/memory bounded.
- Cache/lazy-load appropriately sized images.
- Cancel stale searches/requests.
- Debounce search input.
- Avoid global-store subscriptions that rerender entire feature trees unnecessarily.
- Do not blindly retry non-idempotent mutations.
- Do not create aggressive polling loops.
- Release media/native resources when appropriate.

Target responsive interactions on supported mid-range Android devices.

---

## 18. Security / Privacy Rules

Never log or expose:

- password,
- OTP,
- access/refresh token,
- raw payment credential,
- full UPI/card/bank identifier,
- sensitive chef documents,
- unnecessary precise location/private address,
- provider secrets/private keys.

Mask sensitive identifiers. Validate deep-link/resource authorization. Clear private state on logout according to policy. Financial/payment/document mutations require their approved confirmation/idempotency/security controls.

---

## 19. Testing Rules Per Phase

Add focused tests for the behavior introduced. Depending on the phase this includes:

- validators/selectors/state transitions,
- API/error/reconciliation behavior,
- loading/empty/error/offline component states,
- navigation/back/origin context,
- shared cart/badge synchronization,
- accessibility roles/actions,
- duplicate mutation prevention.

Run the implementation CI after code changes. If CI fails, fix the failure within the current phase before calling it done unless the failure is an explicitly documented external blocker.

---

## 20. `build.md` Update Requirement

A phase report is incomplete until `build.md` is updated with:

- phase ID/title/status,
- starting commit,
- completion commit,
- guide references,
- changed file paths,
- exact APIM contract sources/routes/models used,
- behavior completed,
- tests/CI run and conclusion,
- visual QA status,
- blockers/missing contracts,
- statement that no next phase is authorized yet.

Do not rely on chat memory as the project ledger. `build.md` is the persistent handoff.

---

## 21. Existing Foundation Is Not Full-App Completion

The current branch already contains a working authentication/session foundation and code-level CI. It does not mean the marketplace is complete.

In particular, a successful auth screen, successful JavaScript bundle, or historical APK does not imply completion of Customer Home, cart, checkout, orders, customer account screens, reference 37 states, or Chef refs 38–52.

Use the status table in `build.md`; upgrade `PARTIAL` to `DONE` only after auditing the exact granular phase acceptance criteria.

---

## 22. Final APK / Release Rule

Do not build an APK for P00–P127 simply as a phase checkpoint.

The normal release build happens in **P128 — Final Android Release Artifact** after:

- implementation complete,
- APIM contract audit complete,
- lifecycle audit complete,
- accessibility/performance/security audits complete,
- integration/E2E regression complete,
- all 52 visual references device-certified or deviations approved.

Production signing must use secure CI/Play App Signing; never commit or paste production keystore/private credentials into repository source.

---

## 23. Missing Dependency / Blocker Protocol

When blocked:

1. identify the exact missing contract/file/environment capability,
2. show where the guide requires it,
3. prove that the repository does not currently provide it (after reasonable search),
4. do not create a fake route/data source,
5. complete independent UI/state work only if it can remain truthful and production-safe,
6. record the blocker in `build.md`,
7. mark phase `BLOCKED` or `PARTIAL`, not `DONE`,
8. stop or continue only within an explicitly authorized independent scope.

---

## 24. End-of-Phase Response Behavior

After completing the authorized phase, report concisely:

- phase completed/status,
- what changed,
- exact contract integration outcome,
- CI/test result,
- blockers if any,
- `build.md` updated,
- no APK built unless the current phase is P128.

Then wait. Do not say “I’ll continue automatically” and do not begin another phase until the user authorizes it.
