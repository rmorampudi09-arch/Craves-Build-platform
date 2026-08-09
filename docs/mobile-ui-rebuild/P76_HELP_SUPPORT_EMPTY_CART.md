# P76 — Help and Support — Empty Cart

Status: PARTIAL at exact contract-backed implementation scope. Mobile CI is green; trusted support contracts and runtime reference/device certification remain outstanding.

## Authority

- Branch: `mobile-ui-rebuild-from-scratch`
- Phase: P76 only
- Guide reference: Screen 35 — Help and Support — Empty Cart Reference State
- Existing repository navigation architecture remains authoritative: the already-typed `CustomerSettingsSupport` Profile-stack route is reused as the logical Help & Support destination rather than creating a duplicate route.
- P77 — Help and Support — Active Cart is not implemented by this phase.

## Repository contract audit

The branch has no approved customer support integration contract to bind Screen 35 to:

- no customer support service exists under `services/`;
- no customer support APIM route is registered under `infra/apim/`;
- no mobile `customerSupport` API/query layer existed before P76;
- `.env.example` contains no trusted support phone, email, chat, or content source;
- no approved help-category/article, support-availability, chat-session, or support-ticket contract was found.

P76 therefore does not invent contact details, article/category data, ticket success, chat success, endpoint URLs, request fields, or response payloads. Backend/APIM creation remains outside the authorized P76 mobile scope.

## Implemented

- Replaces the P75 support boundary at the existing typed Profile-stack support route with the P76 Screen 35 composition.
- Reuses the established customer location selector and notification destination.
- Adds the immediate-help card, Call Us CTA, Quick Help section, Popular Help Topics section, contact-support actions, reassurance banner, and bottom-navigation-aware scrolling structure.
- Server-owned support controls use explicit disabled/unavailable states instead of fake data or fake success.
- Customer-facing copy stays product-friendly; stable blocker codes remain internal through the typed boundary/test IDs and evidence.
- Adds a typed integration boundary for support configuration, help content, availability, chat session, and support ticket capabilities.
- Adds focused unit coverage for the support capability boundary.
- Preserves the established cart rule: the shared View Cart overlay requires `itemCount > 0`, so the empty-cart Screen 35 state does not show View Cart.
- Does not alter backend/APIM/infrastructure source.

## Explicit blockers

- `CUSTOMER_SUPPORT_CONFIGURATION_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_HELP_CONTENT_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_AVAILABILITY_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_CHAT_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_TICKET_CONTRACT_UNAVAILABLE`

These are real integration blockers, not simulated lifecycle states. Until exact contracts exist, call/email/chat/ticket/category/article actions cannot truthfully be completed.

## Validation

Validated mobile head: `71cd7d730b7bb526424640f36032862c5ec75413`.

- Initial implementation run `31288268203`, job `93180913182` — SUCCESS.
- Final customer-copy polish run `31288445332`, job `93181381234` — SUCCESS.
- Final run passed dependency install, TypeScript strict check, ESLint, Jest, production Android JavaScript bundle, and the backend/APIM/infrastructure source guard.
- No Gradle/APK packaging was performed, consistent with implementation-phase build policy.

## Completion boundary

P76 remains PARTIAL until both of the following are available:

1. exact approved support configuration/content/availability/chat/ticket contracts required by Screen 35; and
2. runtime Android visual/interaction comparison against the real Screen 35 reference asset, including the full loading/error/offline interaction lifecycle once the server contracts exist.

No pixel-perfect, full backend-complete, or device-certified claim is made from source and CI alone.

## Handoff

- Current executed phase: P76 — PARTIAL.
- Validated mobile head: `71cd7d730b7bb526424640f36032862c5ec75413`.
- Next phase in sequence: P77 — Help and Support — Active Cart.
- P77 authorization: none; do not pre-implement it.
