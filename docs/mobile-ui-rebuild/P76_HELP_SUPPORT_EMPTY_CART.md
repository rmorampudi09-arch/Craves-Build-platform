# P76 — Help and Support — Empty Cart

Status: PARTIAL at implementation scope pending CI evidence and runtime visual/device certification.

## Authority

- Branch: `mobile-ui-rebuild-from-scratch`
- Phase: P76 only
- Guide reference: Screen 35 — Help and Support — Empty Cart Reference State
- P77 Help and Support — Active Cart is not implemented by this phase.

## Repository contract audit

The branch has no approved customer support integration contract to bind Screen 35 to:

- no customer support service exists under `services/`;
- no customer support APIM route is registered under `infra/apim/`;
- no mobile `customerSupport` API/query layer existed before P76;
- `.env.example` contains no trusted support phone, email, chat, or content source;
- no approved help-category/article, support-availability, chat-session, or support-ticket contract was found.

P76 therefore does not invent contact details, article/category data, ticket success, chat success, or endpoint payloads.

## Implemented

- Replaces the P75 support boundary at the existing typed Profile-stack support route with the P76 Screen 35 composition.
- Reuses the established customer location selector and notification destination.
- Adds immediate-help, quick-help, popular-topics, contact-support, reassurance, and bottom-navigation-aware scrolling structure.
- All server-owned support actions are visibly disabled and explain why they are unavailable.
- Adds a typed integration boundary and stable blocker codes for every missing support capability.
- Preserves the established shared-cart rule: View Cart is not rendered when cart item count is zero.
- Adds focused unit coverage for the support capability boundary.

## Explicit blockers

- `CUSTOMER_SUPPORT_CONFIGURATION_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_HELP_CONTENT_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_AVAILABILITY_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_CHAT_CONTRACT_UNAVAILABLE`
- `CUSTOMER_SUPPORT_TICKET_CONTRACT_UNAVAILABLE`

These are integration blockers, not simulated states. Backend/APIM creation is outside the authorized P76 mobile scope.

## Completion boundary

P76 remains PARTIAL until both of the following are available:

1. exact approved support configuration/content/availability/chat/ticket contracts required by Screen 35; and
2. runtime Android visual/interaction comparison against the real Screen 35 reference asset.

No pixel-perfect or full backend-complete claim is made.
