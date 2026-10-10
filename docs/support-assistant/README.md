# Craves support assistant

An AI support chat for customers and chefs, using Claude (model `claude-haiku-5-5`) through the Anthropic API. It is available in:

- customer web (`/support`, plus "Get help" on order details)
- chef web (`/chef/support`)
- the mobile app (Help & Support → Start Chat, order detail → Help, chef profile → Help & support)

Tickets it opens appear in the admin portal under **Support inbox** (`/admin/support`).

## How a message flows

```
app / browser ──► web BFF /api/support/chat (web only, same-origin, 64 KB cap)
             ──► APIM api.craves.in/api/v1/support/chat (Bearer required, 64 KB cap)
             ──► user-chef-service SupportChatController
                   ├─ verifies JWT and role (CUSTOMER/CHEF the caller actually holds)
                   ├─ per-user limit: 6 messages/minute, 40/day
                   └─ SupportAssistant ──► api.anthropic.com (key from Key Vault)
                         tools, all scoped to the caller:
                         • get_my_recent_orders / get_order_details → order-service, called with the caller's own token
                         • get_my_support_tickets → support_case (caller's own, no internal notes)
                         • create_support_ticket → support_case (order ownership checked first)
```

## What the model can and cannot see (leak rules)

The model only ever receives what the signed-in caller can already see.

| Sent to the model | Never sent |
|---|---|
| `support-assistant/guide.md` (public policy text only) | Anything from `documentation/10-confidential-internal`, `docs/`, runbooks, admin data |
| The caller's own chat (card-length numbers masked) | Other users' data |
| The caller's own orders: kitchen name, status, items, charges, delivery status, tracking link | Identity ids, addresses, phone numbers, kitchen pickup details, chef notes, provider ids |
| The caller's own tickets and support replies | Internal notes |

How this is enforced:

- **Order fields:** `SupportOrderClient` copies an allowlist of scalar fields. Its test fails if a phone number, address, id or chef note leaks.
- **Ownership:** order-service enforces it, because it receives the caller's own token.
- **Data, not instructions:** the model is told that tool output is data, and no tool can change money, orders or accounts.
- **Editing the guide:** `guide.md` may be shown to any user. Only put public information in it.
- **Logging:** chat text is never logged. Only token counts and Anthropic request ids are logged.

## One-time setup

1. **Claude Console (platform.claude.com).**
   1. Create a workspace named `craves-support` and set a monthly spend limit, for example $25.
   2. Turn on auto-reload in Billing so the bot doesn't stop when credits run out.
   3. Create an API key **in that workspace**. Copy it once; don't paste it anywhere else.
2. **Azure Key Vault** `kvcravesprodlowkmqgfy`: Secrets → Generate/Import → name `anthropic-api-key` → paste the key.
3. **Merge and release User/Chef** (contains `POST /api/v1/support/chat` and the admin support routes).
4. **Bind the runtime.** Run pipeline `azure-pipelines-support-assistant.yml` with `operation=bind`, `confirmProductionChange=true`. This binds `ANTHROPIC_API_KEY` from Key Vault and sets `CRAVES_SUPPORT_ORDER_BASE_URL` to the order-service FQDN.
5. **Add the gateway routes.** Run the same pipeline with `operation=apim`, `confirmProductionChange=true`. This adds `/api/v1/support/chat` and `/api/v1/admin/support/cases*` and probes for a 401.
6. **Release the web and mobile apps.**

Until steps 2–4 are done, the chat answers `503 SUPPORT_CHAT_UNAVAILABLE` and the apps point users to support@craves.in.

## Operating it

- **Kill switch:** run the pipeline with `operation=unbind`. The chat returns 503 at once; nothing else changes.
- **Cost:** on Haiku 5.5, a typical message costs well under $0.001. The worst case is about $0.005: history capped at 8,000 characters, at most 4 model calls and 3 lookups per call.
  - 1,000 chats a month costs a few dollars.
  - Abuse is capped by the per-user limits (40 messages a day per account), one ticket per 10 minutes, and the workspace spend limit.
- **Usage:** see Console → Usage (workspace `craves-support`), and the User/Chef logs line `Support chat model call`.
- **Changing the model:** set env `CRAVES_SUPPORT_CHAT_MODEL`, for example `claude-sonnet-5-5` for harder cases (about 20× the cost).
- **Changing what it knows:** edit `services/user-chef-service/src/main/resources/support-assistant/guide.md` (public content only) and release User/Chef.

## Known limits

- **Rate limits are per replica**, held in memory. User/Chef runs at most 2 replicas, so the real caps are up to 2×.
- **Chef payouts, earnings and menu-approval** questions become tickets; the bot cannot read finance data.
- **No chat history is stored:** the conversation lives in the app until the screen closes. Tickets keep the requester's last 5 messages.
- **Masking:** card-length numbers are masked before the model or a ticket sees them. OTPs, PINs and passwords can't be told apart from ordinary numbers or text, so the UI and the bot both tell users never to share them.
- **Ticket summaries:** the AI writes the first ticket message from what the requester said. The admin inbox labels it "via AI assistant (unverified summary)"; verify any claims before acting.
- **Gateway bypass:** the User/Chef FQDN is publicly reachable (pre-existing), so a caller can skip APIM's 64 KB cap. JWT checks, validation and the per-user limits still apply.
- **Privacy policy:** add a line saying support chats are processed by an AI provider (Anthropic) to answer questions. Anthropic's commercial terms describe how API data is retained; check them before you write that line.
