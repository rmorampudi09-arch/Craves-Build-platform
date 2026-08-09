# P77 — Help and Support — Active Cart

Status: PARTIAL at exact contract-backed implementation scope. Mobile CI is green; inherited trusted support contracts and runtime Screen 36 reference/device certification remain outstanding.

## Authority

- Branch: `mobile-ui-rebuild-from-scratch`
- Phase: P77 only
- Guide reference: Screen 36 — Help and Support — Active Cart Reference State
- Existing repository navigation architecture remains authoritative: P77 reuses the typed `CustomerSettingsSupport` Profile-stack route and the P76 Help & Support composition rather than creating a duplicate support screen.
- P78 — Customer Empty/Search/Offline/No-Data System is not implemented by this phase.

## Implemented

- Adds a bounded route wrapper around the existing P76 Help & Support composition; the support screen itself remains the single shared implementation for empty and active cart states.
- Reads canonical cart item count and food subtotal through the established shared cart selectors; support does not own, copy, or persist cart state.
- Reuses the existing Customer route chrome policy for `CustomerSettingsSupport` and the shared `SharedViewCartOverlay` implementation.
- Shows the Espresso Brown View Cart control only while the authoritative cart is active, with the shared live item count and subtotal formatting.
- View Cart opens the existing typed `CustomerCart` destination without clearing or replacing the active cart.
- Adds active-cart bottom content clearance so Help & Support actions remain reachable above the floating cart control.
- Removes that clearance and the View Cart control immediately when the cart returns to zero items, returning to the P76 empty-cart route state.
- Preserves the P76 location, notification, back-navigation, bottom-navigation-aware scrolling, and honest disabled support actions.
- Adds focused unit coverage for active-cart visibility, content clearance, and the zero-item transition.
- Does not alter backend/APIM/infrastructure source.

## Inherited exact support blockers

- `CUSTOMER_SUPPORT_CONFIGURATION_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_HELP_CONTENT_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_AVAILABILITY_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_CHAT_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_TICKET_CONTRACT_UNAVAILABLE`

P77 therefore does not invent phone/email values, help categories/articles, support availability, live-chat success, ticket success, cart/order-context fields, or consent semantics that are not backed by an approved contract.

## Validation

Validated mobile head: `4d4d07208339d3b43cfc2c5d48acfbd495d6a022`.

- Workflow run `31288996661`, job `93182864111` — SUCCESS.
- Dependency install, TypeScript strict check, ESLint, Jest, production Android JavaScript bundle, and backend/APIM/infrastructure source guard all passed.
- No Gradle/APK packaging was performed, consistent with implementation-phase build policy.

## Completion boundary

P77 remains PARTIAL until both of the following are available:

1. the exact approved support configuration/content/availability/chat/ticket contracts inherited from P76, including any approved support-context consent fields; and
2. runtime Android visual/interaction comparison against the real Screen 36 reference asset.

No pixel-perfect, full backend-complete, or device-certified claim is made from source and CI alone.

## Handoff

- Current executed phase: P77 — PARTIAL.
- Validated mobile head: `4d4d07208339d3b43cfc2c5d48acfbd495d6a022`.
- Next phase in sequence: P78 — Customer Empty/Search/Offline/No-Data System.
- P78 authorization: none; do not pre-implement it.
