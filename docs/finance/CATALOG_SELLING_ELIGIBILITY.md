# Catalog finance selling eligibility

Catalog obtains fresh finance selling authority before serving public kitchens,
menus, nearby discovery, cart resolution, saved meals, favorites or public kitchen
availability. SQL predicates apply before both the total count and pagination.
The authoritative checkout quote remains required when an order is accepted;
Catalog visibility is not an accepted financial snapshot.

## Authority and configuration

Integration exposes `POST /internal/v1/finance/catalog-eligibility`. This private
read-only endpoint uses a **dedicated** HMAC secret, never the money-posting key.
It reads the current activated policy and the same current-financial-year
`ChefTaxProfileService` profile rules used by financial quotes. Its shared batch
resolver reads heads and versions in one bounded joined query, then reuses the
exact single-profile decode, registration review and current-year checks. It
performs no per-chef database calls. A chef is
eligible only when the ledger policy is enabled and in scope, the actual current
tax/fee-terms profile exists, its state is `36`, and registration review is not
`REGISTRATION_REVIEW_REQUIRED`. Missing real records yield no selling eligibility.
Bank enrollment, payout credentials and RazorpayX approval are separate controls.

| Runtime | Setting | Required value |
| --- | --- | --- |
| Catalog | `CRAVES_CATALOG_FINANCE_ORIGIN` | Verified HTTPS Integration origin, without a path, query or user information |
| Catalog and Integration | `CRAVES_CATALOG_FINANCE_READ_KEY` | Same dedicated secret via existing Key Vault references; 32–512 characters |
| Integration | `CRAVES_FINANCE_INTERNAL_KEY` | Existing financial quote/event key, preserved and different from the read key |
| Catalog | Existing public privacy setting | Keep `CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED=true` |

Reuse existing apps, identities, vault and service origins. Do not create new
resources, print keys, rotate working financial credentials or change the
one-replica maximum. Integration returns 503 if the read key is missing, short
or equal to its finance posting key. Catalog has no permissive fallback or
local eligibility cache. The new endpoint must remain outside public APIM
products; do not add it to public bank or finance APIs. Logs and diagnostics
must not capture request/response bodies, signatures or authorization headers.

## Signed and bounded contract

The request contains exactly `{"requestId":"<canonical UUID>"}`. The timestamp
header is `X-Craves-Catalog-Timestamp` (epoch seconds); the signature header is
`X-Craves-Catalog-Signature` (lowercase hexadecimal HMAC-SHA256).

The UTF-8 signature prefix is `POST\n/internal/v1/finance/catalog-eligibility\n`
plus the exact timestamp, a newline, and the **raw body bytes**. The response
uses `RESPONSE` in place of `POST` and signs its raw bytes. The dedicated key
authenticates both directions. Responses contain only `requestId`, `evaluatedAt`,
`complete`, `policyId`, `revision`, `hash` and `eligibleChefIds` — no tax, bank,
contact or address data. Responses and errors carry `Cache-Control: no-store`.

Catalog requires a matching request UUID, valid signature, exact field set,
complete list, nonnegative revision, unique UUIDs and fresh evaluation. Timestamp
tolerance is 15 seconds and future evaluation tolerance is 5 seconds. Requests
are capped at 256 bytes; responses at 64 KiB. Transport follows no redirects,
has a 2-second connection timeout and a 5-second whole-response deadline.
The complete-list ceiling is 1,000 finance profile heads. Overflow returns
`complete=false`, and Catalog fails closed with 503; it never serves a partial
list or an old Redis page. This is a deliberate bounded launch contract, not
certification of unlimited traffic. Review the contract and benchmark the
read-only profile evaluation before exceeding that ceiling; do not raise it
without corresponding load evidence.

Discovery obtains authority **before** Redis on every request and includes the
eligibility hash and privacy setting in its cache key. The hash includes policy
identity/revision, evaluation date and eligible profile versions. Revocation
changes the key even while a previous page is still cached. Any authority
outage fails the request before a cache lookup. Query/page validation precedes
the finance request. No user-controlled SQL or dynamically interpolated chef
values are used; eligibility is a bound PostgreSQL UUID array.

## Private operations and historical orders

Private chef reads and draft edits remain available. Kitchen/menu `ACTIVE`
changes, making items available (single and bulk), and enabling schedule order
acceptance require current selling eligibility. Closing or disabling remains
available during a finance hold.

`GET /api/v1/catalog/internal/kitchens/{kitchenId}` keeps the existing
`X-Craves-Internal-Key` controller authorization. A missing configured key gives
503; missing/wrong caller key gives 403 before any data access. This historical
read preserves the prior active-kitchen semantics and is used by Order for
ownership/history and acceptance reconciliation. Applying a new financial hold
to that read would break existing orders. Its APIM inventory must preserve
header authorization and privacy. Public reads and new menu/cart resolution
are gated, and checkout financial quotes still fail closed. Do not expose the
historical payload anonymously or weaken its authorization.

## Acceptance and release evidence

`catalog-finance-eligibility-ci.yml` runs the full Catalog suite and dedicated
Integration suites against a disposable PostGIS container. Database fixtures
require both `GITHUB_ACTIONS=true` and an explicit disposable-test flag plus the
fixed local CI database URL. They run full Flyway migrations, validate replay,
exercise actual SQL filtering/count/pagination, public resolution, immutable
tax-profile revocation and private history. No live chef declarations, orders,
bank validations or transfers are created. Existing applied SQL is unchanged.

The workflow rejects missing tests and any skipped required acceptance case.
Local unit-test success with the database cases skipped is not database
acceptance. Required evidence includes the successful CI run for the exact
reviewed release SHA, configured key references (redacted), signed read success,
wrong-key denial, public eligibility/privacy checks, healthy images/revisions
and traffic. A missing policy or zero valid profiles must be recorded as an
empty catalog, not fixed by inventing financial records or bypassing the gate.

Deploy compatible Integration authority and configure secure references before
the gated Catalog image. Verify signing and current records before opening new
selling traffic. Preserve the release SHA across builds and configuration,
normal review/environment approvals, current encryption keys and the prior
healthy rollback revision. A rollback must not erase financial history or
restore public selling around a newly applied finance hold.
