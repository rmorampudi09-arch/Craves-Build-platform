# CRAVES Mobile Granular Implementation Phases

**Purpose:** This file breaks the full 52-reference CRAVES implementation into deliberately small, reviewable phases. A phase is an engineering checkpoint, not an APK milestone.

**Control rule:** The agent completes exactly one authorized phase (or the explicitly requested bounded set), updates `build.md`, reports the result, and stops. The next phase starts only after the user says to continue/start the next phase.

**APK rule:** No per-phase APK builds. The final Android artifact is created only in Phase P79 after implementation and QA gates are complete.

**Source rule:** The 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` and 52 references define UI/UX behavior. Existing repository architecture and exact APIM/OpenAPI contracts define integration. Never invent a backend contract.

---

## Phase Status Vocabulary

- `NOT STARTED` — no accepted work for this rebuild phase.
- `PARTIAL` — useful code exists, but the phase has not passed its complete acceptance gate.
- `BLOCKED` — exact external/backend dependency is missing or unavailable; blocker must be documented.
- `DONE` — all phase acceptance criteria passed and `build.md` has evidence.
- `QA PENDING` — functional phase is done but final device/reference certification is intentionally deferred to visual QA phases.

---

# A. Governance, Repository, and Foundation

## P00 — Execution Documents and Source Lock

**Scope**
- Create/maintain `plan.md`, `phases.md`, `build.md`, `agent.md`.
- Lock the authoritative guide to the 183-page/52-reference version.
- Record repository, branch, mobile workspace, baseline backend guard, and no-per-phase-APK policy.

**Acceptance**
- Four documents committed to `mobile-ui-rebuild-from-scratch`.
- `build.md` reflects the actual branch state, not historical APK work.
- No product code changed in this phase.

## P01 — Repository Architecture Inventory

**Scope**
- Inspect current mobile source, navigation, store, query provider, theme, HTTP client, secure storage, Firebase, tests, Android native config, CI.
- Identify reusable existing patterns and duplicate/dead architecture.

**Outputs**
- Update `build.md` with architecture map and any cleanup blockers.

**Acceptance**
- No new parallel architecture is introduced.
- Existing app entry/root/navigation/provider ownership is documented.

## P02 — APIM/OpenAPI Contract Inventory

**Scope**
- Locate exact route definitions, route keys, HTTP methods, path/query parameters, request/response JSON, auth requirements, pagination conventions, idempotency headers, error contracts.
- Build a contract-to-feature mapping for Auth, Discovery, Cart, Checkout, Orders, Customer Account, Notifications, Support, Chef Orders/Menu/Analytics/Profile/Business/Payout/Subscription.

**Acceptance**
- Each known mobile capability maps to an exact repository contract.
- Missing contracts are recorded explicitly.
- No endpoint is inferred from naming alone.

## P03 — Runtime Configuration and Environment Boundary

**Scope**
- Verify environment schema, APIM base URL injection, Firebase Android configuration, feature flags/remote config mechanism.
- Ensure no environment secret is committed.

**Acceptance**
- Runtime config fails clearly when required values are missing.
- `.env.example` remains non-secret.
- Production values are externalized.

## P04 — Design Token Baseline

**Guide:** global UI standards.

**Scope**
- Normalize brand colors, warm surfaces, semantic colors, spacing, radius, typography, border/elevation, icon/touch-size tokens.
- Preserve Flame Red `#F62E18` and Espresso Brown `#261A15`.

**Acceptance**
- No screen-specific one-off copy of core brand values where a shared token exists.
- Tokens support safe areas and dynamic type.

## P05 — Shared Motion and Reduced-Motion Baseline

**Scope**
- Define motion durations/easing/spring conventions for press, chip/tab, View Cart, bottom nav, modal, list insertion/removal, skeletons.
- Provide reduced-motion behavior.

**Acceptance**
- Motion never blocks auth/payment/error navigation.
- Reusable motion primitives do not animate large lists unnecessarily.

## P06 — Shared Interaction Primitives

**Scope**
- Buttons, icon buttons, pressable cards, inputs, validation messages, chips, segmented controls, badges, loading indicators.

**Acceptance**
- Minimum touch targets, press feedback, disabled/loading semantics, accessibility roles/states.
- No empty handler abstraction.

## P07 — Shared Screen/Lifecycle Primitives

**Scope**
- Safe-area screen shell, keyboard avoidance, section/list skeletons, recoverable error banner, terminal state, offline notice, permission state, retry control.

**Acceptance**
- Components can keep prior valid data visible during safe background refresh.
- No generic full-screen spinner is forced on every query.

## P08 — Query/Store Provider and Cache Rules

**Scope**
- Confirm TanStack Query/current server-state layer, Redux/current global-state layer, cache key strategy, private-cache clearing, bounded paging conventions.

**Acceptance**
- Server collections are not duplicated as arbitrary global arrays.
- Cache keys include relevant user/location/filter/entity context.

## P09 — Typed HTTP Client Foundation

**Scope**
- Bearer injection, correlation IDs, normalized errors, timeouts, cancellation, retry policy, request dedupe compatibility.

**Acceptance**
- No screen calls Axios/fetch directly unless an explicitly approved special flow requires it.
- Raw backend stack traces are not exposed to users.

## P10 — Session Token Security Foundation

**Scope**
- Access token process memory.
- Refresh token secure storage.
- Refresh rotation, single in-flight refresh, clear-on-failure/logout.

**Acceptance**
- No access token in AsyncStorage/general storage.
- No refresh token in logs/routes.
- Unit tests cover token-memory/secure-store behavior.

## P11 — Root Navigation and Typed Route Policy

**Scope**
- Typed root route model for Auth, Customer, Chef, Transactional, Modal domains.
- Route policy for bottom nav/View Cart visibility.
- Deep-link allowlist boundary.

**Acceptance**
- No large mutable domain objects in route params.
- Auth/customer/chef roots are role-separated.

---

# B. Authentication and Account Resolution

## P12 — Role Selection UI and State

**Guide refs:** 1–4 shared authentication context.

**Scope**
- Customer/Chef role choice, role-aware copy/art, state persistence only where safe.

**Acceptance**
- Correct role is carried into phone/email flows.
- Bottom nav/View Cart hidden.

## P13 — Customer Phone Sign-In Visual State

**Guide ref:** 1.

**Scope**
- Pixel-faithful Customer phone sign-in composition.
- Country code/phone validation, keyboard, CTA/loading/error states.

**API**
- Firebase/native phone verification + exact backend session exchange later in auth chain.

**Acceptance**
- No fake OTP success.
- Duplicate submission guarded.

## P14 — Chef Phone Sign-In Visual State

**Guide ref:** 2.

**Scope**
- Role-aware Chef visual state using shared auth logic.

**Acceptance**
- No duplicated auth transport logic.
- Chef role remains explicit through OTP/account resolution.

## P15 — Customer Email/Password Sign-In

**Guide ref:** 3.

**Scope**
- Customer visual, email normalization, secure password input, submit/validation/error states.

**Acceptance**
- Uses actual Firebase/product auth path and exact CRAVES session requirements.
- Account-existence disclosure rules respected.

## P16 — Chef Email/Password Sign-In

**Guide ref:** 4.

**Scope**
- Chef role visual state and role-preserving navigation.

**Acceptance**
- Shares authentication engine with Customer, no duplicate API stack.

## P17 — OTP Verification, Resend, Expiry, Rate Limit

**Scope**
- OTP entry, native verification, resend countdown/eligibility, expiry/rate-limit errors, focus behavior.

**Acceptance**
- No OTP logging.
- No duplicate verify/resend.
- Correct recovery on invalid/expired codes.

## P18 — Password Recovery Flow

**Scope**
- Forgot-password input, submission, recovery-sent state, safe error copy.

**Acceptance**
- Does not reveal account existence beyond approved provider behavior.
- Navigation/back behavior is safe.

## P19 — Firebase → CRAVES Session Exchange

**Scope**
- Exchange verified Firebase identity using exact Auth Service contract.
- Persist token pair according to P10.

**Acceptance**
- Correlation ID/timeouts/error mapping.
- Exchange failure leaves no half-authenticated state.

## P20 — Session Restore and Silent Refresh

**Scope**
- Startup refresh, token rotation, wrong-root flash prevention, stale/invalid refresh credential handling.

**Acceptance**
- One refresh in flight.
- Startup failure has actionable recovery.

## P21 — Identity, Role, and Onboarding Resolution

**Scope**
- `/me`/approved exact identity endpoint mapping.
- Determine Customer/Chef authorization and onboarding/account status.

**Acceptance**
- No client-only trust of selected role.
- Backend role/status is authoritative.

## P22 — Customer Registration/Profile Completion

**Scope**
- Required profile completion after auth when account does not yet satisfy customer profile requirements.

**Acceptance**
- Exact profile request/response model.
- Field-level validation/server mapping.

## P23 — Chef Application/Onboarding Status

**Scope**
- Existing chef application retrieval, application submission if required, pending/rejected/approved status routing.

**Acceptance**
- Backend status authoritative.
- No simulated approval.

## P24 — Logout, Revoke, and Role-State Cleanup

**Scope**
- Logout/revoke, token clearing, private cache clearing, role-specific state cleanup, return to Auth root.

**Acceptance**
- No back-loop into authenticated screens.
- Customer/chef private data not retained improperly.

---

# C. Customer Shell and Shared Customer Infrastructure

## P25 — Customer Root Shell and Bottom Tabs

**Scope**
- Home, Chefs, Orders, Profile typed bottom tabs.
- Active Flame Red state and safe-area layout.

**Acceptance**
- Tab stacks/state can be preserved.
- No placeholder is marked complete as a product screen.

## P26 — Customer Bottom-Nav Scroll Hide/Reveal

**Scope**
- Hide smoothly on downward feed scrolling, reveal on upward scroll/top/tab return.

**Acceptance**
- Does not intercept taps while hidden.
- Does not overlap Android gesture area/sticky CTAs.

## P27 — Shared Customer Header/Location/Notification Badge

**Scope**
- Location display/selector entry, notification bell/badge, shared header variants.

**API**
- Exact location/serviceability and notification-count capabilities.

**Acceptance**
- Location/badge changes propagate to all required customer surfaces.

## P28 — Authoritative Cart Domain Skeleton

**Scope**
- Typed cart snapshot/version, line identity, totals, quantity state, coupon/address/quote dependencies, mutation state.

**Acceptance**
- One authoritative cart domain only.
- No local per-screen cart copies.

## P29 — Shared View Cart Overlay

**Guide refs:** customer active-cart variants.

**Scope**
- Hidden at zero, animated appearance after first successful add, Espresso Brown, live count/total, route-policy visibility.

**Acceptance**
- Disappears immediately at zero.
- Never in Chef/auth/checkout/payment.

## P30 — Cart Add/Remove/Quantity Reconciliation

**Scope**
- Exact line mutation contracts, optimistic policy only where safe, rollback, stale-response protection.

**Acceptance**
- Quantity selectors/dish cards/View Cart/cart badge/totals synchronize.
- Duplicate taps protected.

---

# D. Customer Discovery

## P31 — Home Feed Data Contract and Query Model

**Guide refs:** 5, 6.

**Scope**
- Exact home-feed/category/cuisine/location query mapping, pagination, cache keys.

**Acceptance**
- No hardcoded production feed.
- Location change invalidates correctly.

## P32 — Customer Home — Empty Cart

**Guide ref:** 5.

**Scope**
- Reference-faithful Home composition with empty cart state.

**Acceptance**
- Plus/favorite/search/category/chef/dish actions are real.
- View Cart absent.
- Loading/empty/error/offline states connected.

## P33 — Customer Home — Active Cart

**Guide ref:** 6.

**Scope**
- Same Home implementation under active cart state.

**Acceptance**
- View Cart/badge/quantities/total synchronized.
- No duplicate screen architecture for ref 6.

## P34 — Nearby Chef Discovery Contract

**Guide refs:** 7, 8.

**Scope**
- Exact nearby/serviceability/kitchen summary contract mapping, pagination, location dependencies.

**Acceptance**
- No customer-profile list or fake chef data substituted for nearby-chef contract.

## P35 — Discover Home Chefs — Empty Cart

**Guide ref:** 7.

**Scope**
- Chef discovery reference UI, search/filter/navigation/card interactions.

**Acceptance**
- View Cart absent.
- Real kitchen/profile navigation.

## P36 — Discover Home Chefs — Active Cart

**Guide ref:** 8.

**Scope**
- Active-cart variant through shared screen logic.

**Acceptance**
- Cart state synchronized with dish add actions and overlay.

## P37 — Search Query Orchestration

**Scope**
- Search input state, debounce, cancellation, query restoration, pagination, stale-result protection.

**API**
- Exact dish/chef search routes and models.

**Acceptance**
- Obsolete searches cannot overwrite current results.
- Query preserved through detail/back.

## P38 — Filter and Sort

**Guide ref:** 17.

**Scope**
- Sort radios, cuisine chips, diet checkboxes, Reset, sticky Apply.
- Separate draft vs applied filters.

**Acceptance**
- No repeated server search while changing draft unless contract/product explicitly supports live preview.
- Back unsaved behavior follows product rule.
- Bottom nav/View Cart hidden per focused route policy.

## P39 — Dish Detail Data Contract

**Guide ref:** 13.

**Scope**
- Detail/media/chef/ingredients/reviews/availability/price/favorite contracts.

**Acceptance**
- Exact model mapping and cache/entity keys.
- Missing review/media capabilities explicitly blocked if absent.

## P40 — Dish Detail UI and Interactions

**Guide ref:** 13.

**Scope**
- Gallery, favorite/share, chef card, facts, ingredient preview, reviews preview, sticky price/CTAs.

**Acceptance**
- Add to Cart revalidates availability/quantity/kitchen compatibility/current price.
- Buy Now uses approved dedicated checkout intent and does not corrupt existing cart.
- Back restores source list position.

## P41 — Dish Ingredients

**Guide ref:** 14.

**Scope**
- Full ingredients view, dietary/allergen/content interaction exactly per reference/contracts.

**Acceptance**
- Back returns to Dish detail with state preserved.
- Lifecycle states complete.

## P42 — Customer-Facing Kitchen Profile Contract

**Guide ref:** 15.

**Scope**
- Kitchen identity, verification, biography, rating, serviceability, menu summaries, favorite where supported.

**Acceptance**
- Uses exact kitchen/chef public contract, not chef-owner private profile endpoint.

## P43 — Customer-Facing Kitchen Profile UI

**Guide ref:** 15.

**Scope**
- Reference composition, trust indicators, bio, featured dishes, actions.

**Acceptance**
- Add/favorite/open menu interactions real.
- Preserve profile state/scroll on return.

## P44 — Kitchen All Dishes

**Guide ref:** 16.

**Scope**
- Complete menu list/categories/filter/add-to-cart behavior.

**Acceptance**
- Virtualized/paginated as contract requires.
- Cart/favorite quantities synchronized with all discovery surfaces.

---

# E. Customer Commerce, Checkout, and Orders

## P45 — Cart Screen Data and Pricing Model

**Guide ref:** 18.

**Scope**
- Authoritative cart, line pricing, subtotal, taxes/fees, coupon, delivery/address dependencies, checkout eligibility.

**Acceptance**
- Final totals are server-authoritative.
- No discount/tax computation invented locally.

## P46 — Cart and Bill Summary UI

**Guide ref:** 18.

**Scope**
- Line items, quantity, remove, bill summary, offer/address entries, checkout CTA.

**Acceptance**
- Emptying cart globally removes View Cart.
- Mutation errors preserve valid lines and reconcile current server cart.

## P47 — Address Selection for Commerce

**Scope**
- Select/change delivery address from Cart/Checkout using exact address/serviceability contracts.

**Acceptance**
- Origin context preserved.
- Changing address refreshes serviceability/fee/ETA without duplicating cart.

## P48 — Delivery Quote/Reprice Orchestration

**Scope**
- Exact quote/reprice endpoint(s), dependency invalidation for address/cart/coupon.

**Acceptance**
- Stale quote cannot be used for checkout.
- Background progress does not destroy valid cart state.

## P49 — Checkout Session Creation

**Scope**
- Exact checkout-intent/session contract, idempotency, authoritative eligibility revalidation.

**Acceptance**
- Duplicate CTA taps cannot create duplicate checkout/order side effects.

## P50 — Payment Eligibility and Provider Handoff

**Scope**
- Cashfree/project-approved provider integration, payment eligibility, tokenized methods, provider launch.

**Acceptance**
- No raw card/UPI credentials in app state/logs.
- Transactional screen is immersive.

## P51 — Payment Success/Failure/Cancel Recovery

**Scope**
- Provider callback/deep-link result, backend verification, cancellation, retry/recovery.

**Acceptance**
- Client does not declare success before authoritative verification.
- Existing cart/order state reconciles safely.

## P52 — Customer Orders Contract and Pagination

**Guide refs:** 9, 10.

**Scope**
- Exact list/status/summary pagination and cache model.

**Acceptance**
- Counts and order state derive from authoritative server data.

## P53 — My Orders — Empty Cart

**Guide ref:** 9.

**Scope**
- Reference UI/order tabs/cards/actions without active View Cart.

**Acceptance**
- Open order/reorder/tracking navigation real.

## P54 — My Orders — Active Cart

**Guide ref:** 10.

**Scope**
- Same Orders route under active cart state.

**Acceptance**
- View Cart synchronized; reorder/cart conflict uses approved product flow.

## P55 — Order Detail, Timeline, and Tracking

**Scope**
- Exact order detail/timeline/tracking contract and child routes required by guide interactions.

**Acceptance**
- Stale/deleted/unauthorized order handled clearly.
- Polling only if approved and backoff-bounded; prefer event mechanism where available.

## P56 — Reorder and Cancellation/Refund Eligibility

**Scope**
- Exact reorder-validation and cancel/refund-eligibility actions.

**Acceptance**
- Revalidate before mutation.
- No client-assumed refund eligibility.

---

# F. Customer Profile and Engagement

## P57 — Customer Profile/Rewards Contract

**Guide refs:** 11, 12.

**Scope**
- Profile summary, rewards, counts, related account metadata.

**Acceptance**
- Safe global summary only; full profile stays query state.

## P58 — Customer Profile — Empty Cart

**Guide ref:** 11.

**Scope**
- Reference profile/rewards composition and navigation rows.

**Acceptance**
- View Cart absent; all rows navigate to real routes or show explicit contract blocker.

## P59 — Customer Profile — Active Cart

**Guide ref:** 12.

**Scope**
- Active-cart variant using shared Profile route.

**Acceptance**
- Cart preserved while visiting profile subroutes.

## P60 — Favorites — Empty Cart

**Guide ref:** 19.

**Scope**
- Paginated favorites list, empty cart variant, remove/open/add behavior.

**Acceptance**
- Favorite heart synchronized across all surfaces.

## P61 — Favorites — Active Cart

**Guide ref:** 20.

**Scope**
- Same route with active View Cart/cart quantities.

**Acceptance**
- No duplicate favorite store.

## P62 — Notifications — Empty Cart

**Guide ref:** 21.

**Scope**
- Paginated inbox, category chips, read state, deep-link routing, empty cart variant.

**Acceptance**
- Unread badge synchronizes globally.
- Notification destination allowlisted/authorized.

## P63 — Notifications — Active Cart

**Guide ref:** 22.

**Scope**
- Same route with active View Cart state.

**Acceptance**
- Notification actions do not silently reset cart/tab state.

## P64 — Edit Customer Profile Domain/Form

**Guide refs:** 23, 24.

**Scope**
- Original vs draft, dirty fields, field schema, image validation, partial update, server validation mapping, unsaved-change protection.

**Acceptance**
- Save changed fields only where contract supports it.
- Delete Account is separate protected destructive flow.

## P65 — Edit Customer Profile Active/Empty Visuals

**Guide refs:** 23, 24.

**Scope**
- Both reference variants through one shared route/form.

**Acceptance**
- Active cart remains synchronized/preserved.
- Successful save refreshes profile/header identity surfaces.

## P66 — My Addresses Active/Empty Visuals

**Guide refs:** 25, 26.

**Scope**
- Address list/default/delete/deliver-here actions, both cart states.

**Acceptance**
- Delete confirmation.
- Deliver Here refreshes cart fee/ETA/serviceability.

## P67 — Add/Edit Address and Location Permission

**Scope**
- Form, pincode/geocode/serviceability, current-location permission, duplicate/default rules.

**Acceptance**
- Permission denial is recoverable.
- Unsaved draft protected through child selectors.

## P68 — Payment Methods Active/Empty Visuals

**Guide refs:** 27, 28.

**Scope**
- Tokenized UPI/cards/wallet/COD/net-banking capability display, primary selection, both cart states.

**Acceptance**
- Masked identifiers only.
- Ineligible options disabled/annotated rather than allowed to fail later.

## P69 — Payment Method Add/Manage Provider Flow

**Scope**
- Exact tokenized method setup/manage/delete/set-primary contracts/provider flow.

**Acceptance**
- Raw credentials never stored/logged.
- Removing primary method follows backend/product replacement rules.

## P70 — Coupons/Offers — Empty Cart

**Guide ref:** 29.

**Scope**
- Coupon input, offers/categories, T&C/details, empty cart state.

**Acceptance**
- Eligibility comes from server; no locally hardcoded success/discount.

## P71 — Coupons/Offers — Active Cart

**Guide ref:** 30.

**Scope**
- Apply/remove/replace offer on active cart and reconcile full pricing response.

**Acceptance**
- View Cart count/total/discount/savings synchronize immediately.
- Invalidation after address/payment changes surfaced clearly.

## P72 — My Reviews — Empty Cart

**Guide ref:** 31.

**Scope**
- Exact review-list capability if supplied; reference UI and empty cart state.

**Acceptance**
- If list/edit contract is missing, record `BLOCKED` rather than fabricate data.

## P73 — My Reviews — Active Cart and Review Actions

**Guide ref:** 32.

**Scope**
- Active-cart variant; rating/edit/delete/media only where exact contracts permit.

**Acceptance**
- Delivered-order/edit-window/moderation rules remain server-authoritative.

## P74 — Customer Settings Active/Empty Visuals

**Guide refs:** 33, 34.

**Scope**
- Account summary, language, location, notifications, appearance, legal/about/support, logout, both cart states.

**Acceptance**
- Settings values use established preference mechanisms.
- Logout uses P24.

## P75 — Customer Settings Child Flows

**Scope**
- Notification preferences, privacy/security, password change, appearance/language, About/Share/Referral/Subscription routes only where guide and exact contracts support them.

**Acceptance**
- Unsupported backend actions remain explicit blockers, not fake screens.

## P76 — Help and Support — Empty Cart

**Guide ref:** 35.

**Scope**
- Support categories/articles/contact actions, empty cart state.

**Acceptance**
- Uses exact support/content configuration.
- No invented support ticket success.

## P77 — Help and Support — Active Cart

**Guide ref:** 36.

**Scope**
- Same route with active cart and real support child actions.

**Acceptance**
- Cart preserved; View Cart obeys route policy.

## P78 — Customer Empty/Search/Offline/No-Data System

**Guide ref:** 37.

**Scope**
Implement one configurable state system for all eight reference examples:
- Empty Cart
- No Orders
- No Search Results
- No Favorites
- No Internet
- No Saved Addresses
- No Reviews
- No Coupons

**Acceptance**
- Correct contextual CTA(s) and origin route.
- Search query preserved.
- Connectivity recovery has no retry loop.
- Empty cart removes View Cart globally.

## P79 — Customer Cross-Screen Reconciliation Audit

**Scope**
- Cart, location, notification badge, favorites, order counts, rewards/profile summary, tab/query/scroll restoration.

**Acceptance**
- Mutating one domain updates all required customer surfaces without manual refresh.

---

# G. Chef Experience

## P80 — Chef Root Shell and Role Isolation

**Scope**
- Dashboard, Orders, Menu, Analytics, Profile bottom tabs.
- Clear customer-only stores/UI according to role policy.

**Acceptance**
- No customer View Cart/bottom-tab/cart state rendered in Chef shell.

## P81 — Chef Shared Header/Badge/Operational Counters

**Scope**
- Chef header/menu/notification badge and shared counts.

**Acceptance**
- Counter sources are authoritative and shared rather than copied per screen.

## P82 — Chef Dashboard Contract Model

**Guide ref:** 38.

**Scope**
- Summary KPIs, active orders, earnings/payout balance, menu/analytics summaries, notifications.

**Acceptance**
- Exact backend models mapped; missing aggregate capabilities recorded.

## P83 — Chef Dashboard UI

**Guide ref:** 38.

**Scope**
- Reference-faithful dashboard, cards, counters, quick actions, lifecycle states.

**Acceptance**
- Every card/action routes or mutates correctly.

## P84 — Chef Order Detail Contract

**Guide ref:** 39.

**Scope**
- Order/customer authorized data, items, address, status, SLA/timestamps, allowed actions.

**Acceptance**
- Server actionability is authoritative.

## P85 — Chef New Order Detail UI/Actions

**Guide ref:** 39.

**Scope**
- Reference detail, accept/reject/contact/navigation behavior.

**Acceptance**
- Revalidate before action.
- Duplicate accept/reject blocked.
- Authorized/masked contact only.

## P86 — Chef Order Tab Query Architecture

**Guide refs:** 40–43.

**Scope**
- New/Preparing/Ready/Completed query keys, paging, counts, independent scroll state, timer derivation.

**Acceptance**
- Timers derive from server timestamps.
- No local incremental drift model.

## P87 — Chef Preparing Orders

**Guide ref:** 40.

**Scope**
- Preparing tab, cards, prep summary, Mark Ready, contact actions.

**Acceptance**
- Mark Ready confirms/revalidates as required.
- Updates Dashboard/tabs/counts/analytics.

## P88 — Chef Orders — New

**Guide ref:** 41.

**Scope**
- New-order tab/cards/actions and acceptance urgency.

**Acceptance**
- Action idempotency and stale-status handling.

## P89 — Chef Ready for Pickup

**Guide ref:** 42.

**Scope**
- Ready tab, pickup/contact/status actions.

**Acceptance**
- Revalidate current state and update dependent surfaces.

## P90 — Chef Completed Orders

**Guide ref:** 43.

**Scope**
- Completed history/paging/detail actions.

**Acceptance**
- Bounded list; no editable active-order controls.

## P91 — Chef Realtime/Near-Realtime Order Event Reconciliation

**Scope**
- Use project-supported event/refetch mechanism for new/status events.

**Acceptance**
- No aggressive unbounded polling.
- Duplicate/out-of-order events cannot corrupt counts/status.

## P92 — Chef Menu Contract Model

**Guide refs:** 44, 45.

**Scope**
- Menu list/item/detail/categories/availability/media/validation exact contracts.

**Acceptance**
- Server field/status enums are typed and exhaustive.

## P93 — Chef Menu

**Guide ref:** 44.

**Scope**
- Menu reference UI, availability changes, item navigation, pagination.

**Acceptance**
- Availability update synchronized with Dashboard/customer-facing kitchen data where backend supports it.

## P94 — Chef Add New Menu Item

**Guide ref:** 45.

**Scope**
- Form, category, title/description, price, diet/spice/prep time, media, availability, validation.

**Acceptance**
- Upload/type/size rules enforced.
- No fake submit success.

## P95 — Chef Menu Edit/Mutation Hardening

**Scope**
- Edit existing item, image replacement, duplicate submission guard, field-level errors, unsaved changes.

**Acceptance**
- Partial/full update follows exact contract semantics.

## P96 — Chef Analytics Contract Model

**Guide ref:** 46.

**Scope**
- KPI/range/series/top-items/customer/operational metric contracts.

**Acceptance**
- Client does not manufacture backend business metrics.

## P97 — Chef Analytics UI

**Guide ref:** 46.

**Scope**
- Reference KPIs, charts, date-range/filter interactions, accessibility values.

**Acceptance**
- Range changes cancel/dedupe appropriately.
- Chart animation is non-blocking/reduced-motion aware.

## P98 — Chef Account Profile

**Guide ref:** 47.

**Scope**
- Profile summary, business status, payout/subscription/preferences navigation, logout/switch behavior.

**Acceptance**
- All rows have real destinations or explicit blockers.

## P99 — Chef Edit Profile Domain/Form

**Guide ref:** 48.

**Scope**
- Original/draft, photo upload, cuisine/address/service areas, validation, dirty state.

**Acceptance**
- Preserve drafts through child selectors.
- Successful save refreshes all chef identity surfaces.

## P100 — Chef Edit Profile UI

**Guide ref:** 48.

**Scope**
- Reference-faithful layout and interactions.

**Acceptance**
- Upload progress/error/retry.
- No sensitive logs.

## P101 — Chef Business Information Contract

**Guide ref:** 49.

**Scope**
- Business profile, verification, documents, service areas, cuisines, payout-setup status.

**Acceptance**
- Verification/document state backend-authoritative.

## P102 — Chef Business Information UI/Document Flow

**Guide ref:** 49.

**Scope**
- Verification banner, business metrics, document rows/status, upload/update, detail/edit actions.

**Acceptance**
- Secure file selection/validation/progress/retry.
- Expired/rejected docs show actionable reason/path.

## P103 — Chef Payout Contract and Eligibility

**Guide ref:** 50.

**Scope**
- Earnings summary, balance, payout series, transactions, bank destination, withdraw eligibility/initiation.

**Acceptance**
- Financial fields exact/typed; masked bank details.

## P104 — Chef Payout History UI/Withdraw Flow

**Guide ref:** 50.

**Scope**
- Overview/Transactions tabs, KPIs, chart, filters, transaction list, Withdraw Now.

**Acceptance**
- Refresh balance/eligibility immediately before withdrawal.
- Confirmation/idempotency/auth verification and pending/completed/failed states.

## P105 — Chef Subscription Contract

**Guide ref:** 51.

**Scope**
- Chef plan catalogue/current plan/eligibility/pricing/change/cancel/effective dates.

**Acceptance**
- Do not reuse unrelated customer meal-subscription contract.
- Missing chef plan API is explicitly `BLOCKED`.

## P106 — Chef Subscription Plan UI

**Guide ref:** 51.

**Scope**
- Reference plan/current-state/benefits/CTA/change/cancel behavior.

**Acceptance**
- Backend-authoritative pricing and eligibility.
- High-impact changes confirmed/idempotent.

## P107 — Chef Preferences Contract

**Guide ref:** 52.

**Scope**
- Notification/app/privacy/language/appearance preferences using established project mechanisms.

**Acceptance**
- Role-specific preference ownership is explicit.

## P108 — Chef App Preferences UI

**Guide ref:** 52.

**Scope**
- Reference settings groups, toggles/rows, child flows.

**Acceptance**
- Real persistence/mutations only.
- No customer cart UI.

## P109 — Chef Cross-Screen Reconciliation Audit

**Scope**
- Order counts/status, notifications, active cards, payout balance, menu availability, analytics totals, identity/verification state.

**Acceptance**
- Changes propagate to all required chef surfaces.

---

# H. Application-Wide Hardening

## P110 — Deep Link and Notification Routing Audit

**Scope**
- Auth-aware allowlisted links to customer/chef/order/offer/kitchen destinations.

**Acceptance**
- Expired/deleted/unauthorized resources fail safely.
- Repeated taps do not create duplicate stacks.

## P111 — Process Restoration and Background/Foreground Audit

**Scope**
- Safe root/tab/nested route restoration, session refresh, active provider-flow protection, safe drafts.

**Acceptance**
- Sensitive payment credentials never restored.
- Wrong role/root never flashes.

## P112 — Lifecycle-State Matrix Completion

**Scope**
- Audit every server-backed screen for skeleton/populated/background refresh/pagination/empty/offline/permission/recoverable/terminal/mutation states.

**Acceptance**
- No completed screen lacks an applicable state.

## P113 — Accessibility Audit

**Scope**
- Labels, roles, selected/disabled/loading states, focus order, contrast, touch targets, dynamic type, error announcements.

**Acceptance**
- Critical flows usable with screen reader/font scaling.

## P114 — Keyboard/Safe-Area/Responsive Audit

**Scope**
- Compact/standard/large Android widths, IME, cutouts, gesture nav, sticky controls.

**Acceptance**
- No obscured required field/CTA.
- Critical content not clipped at larger font sizes.

## P115 — Reduced Motion and Animation Audit

**Scope**
- Verify all motion primitives and screen-specific effects.

**Acceptance**
- Low-motion equivalent available.
- Hidden overlays do not intercept taps.

## P116 — List/Image/Memory Performance Audit

**Scope**
- Virtualization, paging, stable keys, image sizing/cache, list rerenders, media release, bounded pages.

**Acceptance**
- No unbounded production list/history retained in memory.

## P117 — Networking Performance and Cancellation Audit

**Scope**
- Dedupe, cancellation, debounce, cache stale times, retry/backoff, mutation replay rules.

**Acceptance**
- Stale response cannot overwrite new query state.
- Non-idempotent mutations are not blindly retried.

## P118 — Security/Privacy/Logging Audit

**Scope**
- Token storage, PII logging, payment/document handling, cache clearing, route params, analytics/crash fields.

**Acceptance**
- No secrets/OTPs/passwords/tokens/raw payment/business-document content in logs/source.

## P119 — APIM Contract-Coverage Audit

**Scope**
- Trace every production network action to exact approved route/method/model.

**Acceptance**
- Zero invented endpoint URLs/fields.
- Missing capabilities listed as explicit blockers.

## P120 — Analytics/Observability Audit

**Scope**
- Screen/action events, crash reporting, correlation IDs, performance traces, privacy filtering.

**Acceptance**
- Critical flows observable without sensitive payload leakage.

## P121 — Unit/Component Test Completion

**Scope**
- Fill gaps in state, validation, API error, lifecycle, accessibility, mutation tests.

**Acceptance**
- Full code-level CI passes.

## P122 — Integration Test Completion

**Scope**
- Navigation, auth restore, role switch, cart sync, location invalidation, notification routing, chef status transitions.

**Acceptance**
- Cross-feature invariants pass.

## P123 — Critical E2E Journeys

**Scope**
- Auth, discovery/cart/checkout/payment outcomes, orders, reviews where supported, chef order lifecycle, menu, payout/subscription where supported.

**Acceptance**
- Environment-dependent blockers are documented, not masked.

---

# I. Visual Certification and Release

## P124 — Customer Visual QA Refs 1–18

**Scope**
- Device/emulator screenshot comparison for refs 1,3,5–18 plus customer auth states.

**Acceptance**
- Compare safe-area, hierarchy, typography, colors, spacing, radii, icons, crops, vertical rhythm, overlays.
- Deviations fixed or explicitly approved.

## P125 — Customer Visual QA Refs 19–37

**Scope**
- Device/emulator comparison for Favorites through reference-state collection.

**Acceptance**
- Both active/empty cart variants and all eight ref-37 states verified.

## P126 — Chef Visual QA Refs 2,4,38–52

**Scope**
- Device/emulator comparison of all chef reference states.

**Acceptance**
- No customer cart UI leakage; operational layouts match references.

## P127 — Final Regression and Production Readiness Review

**Scope**
- Re-run code-level CI, E2E, security, accessibility, performance, contract coverage, lifecycle matrix, visual certification checklist.

**Acceptance**
- All required phases `DONE` or explicitly accepted external blockers documented.
- No placeholders/TODO/mock-only production routes.

## P128 — Final Android Release Artifact

**This is the only normal APK/AAB build phase.**

**Scope**
- Clean release build.
- Production signing via secure CI/Play App Signing.
- APK/AAB as required.
- Install/smoke validation.
- Checksums/package manifest/release notes/rollback information.

**Acceptance**
- Signing credentials remain external to source.
- Final artifact corresponds exactly to the accepted source commit.
- `build.md` records final commit, CI run, artifact identifiers/checksums, and release qualification.

---

# J. Phase Execution Template

Every phase update to `build.md` must capture:

```text
Phase: Pxx — Title
Status: DONE | PARTIAL | BLOCKED
Started from commit: <sha>
Completed at commit: <sha>
Guide references: <refs/pages>
Changed files: <exact paths>
APIM/contracts used: <exact route key/path/method/model source>
Behavior completed: <bounded description>
Tests/checks: TypeScript / ESLint / Jest / production JS bundle / contract tests / backend guard
Visual QA: not required yet | performed with evidence
Known blockers: <none or exact missing dependency>
Next authorized phase: NONE — waiting for user
```

The phase is not silently advanced. `build.md` is updated first, then the agent reports completion and waits.
