# Admin Analytics & Record Explorer

## Scope and source baseline

This module extends the Craves red/light admin redesign at PR #342 head
`5e0c1dab74f1b87e5a30b77a5490f0a7b32257c3`. That source tree was recovered from the
existing CI archive and verified as `243c3c643018388d6f3fcab1033bbb7cbd7dee6f`.
Do not treat earlier PR342 frontend-only release instructions as sufficient for
this increment: **Auth, User/Chef and Order backend additions are now required.**
No merge, deployment, activation, role grant, payment, refund, dispatch, provider
change or Azure resource/replica increase is implied by this source delivery.

## Built user journeys

- `/admin/analytics`: complete-population Users, Chefs and Orders cards, clickable
  current-status doughnuts, clickable creation trends, all-time/7/30/90/custom IST
  dates and independent service availability and snapshot evidence.
- `/admin/explorer/users`: registered Auth identities, including people without a
  Customer Profile, counted once even with multiple roles. Role/status/date/search
  filters; names with masked contact; record drawer and audited-lookup handoff.
- `/admin/explorer/chefs`: all chef applications, not a fictitious online-chef count.
  Pending/approved/rejected views; city/date/status/search filters and application
  review link using the real application ID.
- `/admin/explorer/orders`: all chef-specific orders, not checkouts. Status, source,
  date and search filters; exact INR amount strings and linked identifiers;
  prefilled order-investigation handoff without automatic execution.
- Every explorer offers bounded page sizes 25/50/100, newest/oldest ordering,
  previous/next keyset pagination, current filter chips, reset, refresh, density and
  column controls, aggregate-only CSV, non-sensitive view links and record drawers.
- Motion respects `prefers-reduced-motion`. Graph alternatives are keyboard
  controls with explicit names and counts. Native dialogs support Escape and focus
  containment. Page layouts target 320, 390, 768, 1024 and 1440 pixels.

## Meanings that must not be confused

Users = rows in `auth_identity`, including administrative identities. Chef total =
rows in `chef_application`, including pending and rejected. Approved does not mean
online, KYC-complete or available for delivery. Orders =
`order_schema.customer_order`; a multi-chef checkout may produce several rows.
Order `grand_total` is displayed but never added up or called captured revenue.
The source filter distinguishes ON_DEMAND/SUBSCRIPTION; scheduled fulfilment is a
separate existing concept, not a third order source.

All-time is the initial view. Date filters apply to **creation time**. A status
chart describes current status of records created in the selected window, not
historical state transitions. The status chart excludes only the selected status
filter, so admins can switch statuses without losing the population context.
`total` includes every active filter; `populationTotal` excludes the status filter.
Counts are produced by SQL over the full selection, never the current 25-row page.

Daily/monthly/yearly buckets adapt to the requested span and retain every count.
Zero-activity periods inside the reported window are included. Bucket edges are
clipped to the selected inclusive IST dates so clicking a bar does not widen the
selection. More than 160 buckets is rejected rather than silently truncated.

Within a response, aggregates, rows and audit share one PostgreSQL REPEATABLE READ
transaction. Different services and later page requests have independent snapshots.
A fixed creation cutoff excludes newer creations while paging; it does NOT freeze
status/profile edits or prevent late backdated inserts. Refresh restarts page one.

## Ownership and implementation

No new service, Node backend, cross-database join or reporting datastore is added.
Each existing Java service has `src/main/java/in/craves/adminexplorer/` containing
byte-identical `ExplorerQuery` and `ExplorerEngine` sources and a service-specific
`ExplorerDomain` with compile-time SQL. Its native-package
`admin/explorer/AdminExplorerController.java` imports the engine explicitly and
uses that service's existing principal type. CI verifies shared-source parity.

| Service | New API (POST) | Data owner | New migration |
| --- | --- | --- | --- |
| Auth | `/api/v1/admin/explorer/users/query` | Auth DB / `auth_identity` and roles | V9 |
| User/Chef | `/api/v1/admin/explorer/chefs/query` | Business DB / `chef_application` | V11 |
| Order | `/api/v1/admin/explorer/orders/query` | Business DB / `order_schema.customer_order` | V26 |

Frontend uses the same-origin `/api/admin/explorer/{dataset}` BFF only. It validates
body length, allowed fields, dates, page sizes, domain facets and response shape.
It reuses `authenticatedApiFetch` and its server-side identity gate. It never
returns the bearer cookie. Raw upstream errors are not forwarded. Masking is
checked again by the BFF so accidental full contacts fail closed.

## Access and privacy

New bulk reads are conservatively limited to existing PLATFORM_ADMIN and AUDIT_ADMIN
roles. Navigation does not grant these roles. CUSTOMER, CHEF, legacy ADMIN and other
operational roles cannot use these new bulk endpoints without a separately approved
permission change. Existing session renewal/revocation and backend validation remain.
No existing permission policy was broadened to make a shortcut appear to work.

Aggregate reads have a system purpose. Record reads require an operator-entered
10–500-character reason. The reason is retained only in the mounted admin workspace,
not localStorage, URLs or browser cookies. It survives graph-to-list SPA navigation
and is removed when the authenticated workspace unmounts. Do not enter secrets or
customer contact data in the reason. Both summary and record reads append an audit
row with actor, correlation, filter fingerprint, returned count and reason. Audit
failure aborts the response. Ordinary UPDATE/DELETE/TRUNCATE are blocked; privileged
DDL can bypass database triggers, so migration/DDL privileges must remain restricted.

No PII export, contact-unmask action, provider secret, raw webhook, access token,
address, KYC document body or database-edit control is introduced. CSV contains only
aggregate counts and snapshot time. Links omit free-text search, city, reason and
cursor. Names are visible to permitted bulk readers; contacts remain masked.

The linked older identity-directory service still has its own role boundary,
including legacy checks. Opening an identity lookup is not proof that a customer
profile exists or that the destination permission is granted. Fixing that older
policy requires a separate approved RBAC review, not a frontend bypass.

## Local setup

Use a full repository checkout, Node 24, Java 21, Maven and PostgreSQL. The approved
logo is extracted from existing source assets by the unchanged prebuild script.
There are no new npm production dependencies and no new authentication providers.

```bash
cd apps/customer-web-next
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm run test
npm run build
```

Run each owning backend with its established datasource/JWT configuration and
`CRAVES_ADMIN_EXPLORER_ENABLED=true` in the **local test environment only**. The web
requires the existing server-only HTTPS `CRAVES_API_BASE_URL` gateway. Do not expose
local HTTP backends directly to the browser or paste any secrets into chat.

For a disconnected UI-only verification, the CI browser script intercepts BFF and
session responses with synthetic fixtures. Those fixtures cannot authenticate in
production and are not compiled into the application. Browser evidence is labelled
LOCAL TEST DATA. Database correctness is tested separately using actual PostgreSQL.

## Automated validation

`.github/workflows/admin-explorer-ci.yml` checks the exact PR head (not an unspecified
merge ref), three service PostgreSQL fixtures, full frontend lint/typecheck/tests/build,
APIM syntax, source parity and browser interactions. The PostgreSQL test connection
must be loopback and database `craves_explorer_test`; the fixture destroys only its
disposable schema and never accepts a production endpoint. CI requires the database
suite without skips. Other existing repository workflows remain required.

Tests include complete counts beyond 20, multiple roles without duplication, tied
timestamps over every page, oldest/newest ordering, status facets, graph-date
agreement, literal wildcard search, masks, exact amount strings, denied roles,
disabled flags, audit failures, unsafe responses, no raw upstream errors, CSV and
privacy-safe links. Browser tests exercise actual compiled pages with synthetic
BFF fixtures; they are not authenticated production smoke tests.

## Release and manual actions

**Consumption-compatible admission:** each owning backend now admits at most 20
Explorer reads per rolling 60 seconds, shared across administrators and entry points
for that dataset. Together the three services admit at most 60 reads per minute.
A dataset previously allowed 60 requests per source IP; its new budget is deliberately
stricter. A dedicated PostgreSQL counter uses database time and a nonblocking
transaction-scoped advisory lock. Its short admission transaction commits before the
report; failed reports still consume budget. Counter failures fail closed. Exhaustion
or admission contention returns 429 with a bounded `Retry-After` through the BFF.
The separate append-only access audit is unchanged. No IP, identity, purpose, contacts
or tokens are stored in the counter. Expired counter entries are pruned on admission.

This replaces the unsupported APIM `rate-limit-by-key` element. Keep the reviewed
Bearer guard, 8 KB body limit, routing and no-store policies. Ordinary APIM `rate-limit`
requires a subscription key and is not a substitute for these subscription-free
routes. No tier, secret, database connection or Azure resource change is needed.
Verify additive admission migrations **Auth V12, User/Chef V13 and Order V27**, as well
as the existing audit migrations V9/V11/V26 and their guards, before activation.
See [keyed throttling](https://learn.microsoft.com/en-us/azure/api-management/rate-limit-by-key-policy)
and [subscription throttling](https://learn.microsoft.com/en-us/azure/api-management/rate-limit-policy).

1. Refresh main/feature head, pending PRs and Flyway versions. Review the exact diff.
   Require all applicable checks on one exact reviewed release SHA.
2. Use the existing `Craves-Dev-Service-Connection`. Deploy only the reviewed Auth,
   User/Chef and Order builds with the flag still false. Do not run a broad service
   rollout for this module. Preserve existing configuration and one-replica limits.
3. Verify each audit and admission migration in its owning DB. Review DDL privileges and audit
   retention requirements. Do not renumber already applied migrations.
4. A database operator runs `scripts/admin-explorer/auth-indexes.sql` and
   `business-indexes.sql` against the verified matching DBs with psql
   `-v expected_database=<verified_name>`. These use CREATE INDEX CONCURRENTLY and
   must not run in a Flyway/explicit transaction. Inspect `indisvalid` and
   `pg_get_indexdef`; an existing invalid index is not repaired by IF NOT EXISTS.
5. Review current APIM/global/API policies and preserve backups. The existing-service
   APIM script adds only the three explorer POST operations. Set
   `EXPECTED_RELEASE_SHA=<reviewed_sha>` and `CONFIRM_APIM_WRITE=true` only after
   approval. It will not create Azure compute/databases or increase replicas.
6. Set `CRAVES_ADMIN_EXPLORER_ENABLED=true` on the three owning services through the
   approved runtime-configuration process, preserving all other settings. No new
   secret is required. Do not put bearer tokens or DB passwords in source or chat.
7. Deploy the reviewed admin web build. Existing Firebase OTP, DNS, domain, logo and
   payment/provider configuration are reused. No store-console action is required.
8. Run authorized authenticated acceptance on the admin domain: real baseline
   counts, graph/list equality, pagination, role denial, masking, CSV, expiry,
   reconnect, all linked workflows, query timings and absence of unintended writes.

Build/registry/APIM/database use can incur normal charges. This source package does
not itself provision or resize any paid Azure resource. GitHub CI is source proof,
not deployment/activation or production acceptance.

Rollback: disable the three explorer flags first, retain the append-only audit,
restore the reviewed prior admin image if needed, and use the established backend
rollback plan only after checking additive migration compatibility. Do not drop audit
data, undo paid history, alter providers or delete a shared APIM API blindly.

## Capacity and deliberately pending capabilities

Each service permits two simultaneous explorer reads, uses five-second SQL statement
limits and an eight-second transaction timeout, and does not auto-poll lists. The BFF
has a ten-second upstream limit. Durable backend admission permits 20 reads per
rolling minute per dataset across all callers, with a two-second admission transaction
limit, one-second admission SQL limit and nonblocking budget lock. Re-tune only after
measurement.
Exact all-time counts and contains-search can still scan many rows. Keyset pagination
avoids deep OFFSET, but does not eliminate count/search cost. This is NOT a million-
concurrent-user load certification. Large deployments need measured query plans and
possibly an approved reporting projection/read replica; none is provisioned here.

This increment does not implement new refunds/payout actions, dispatch/provider
switches, role administration, catalog CRUD, campaign rules, support-ticket mutations,
financial revenue recognition, KYC policy, cancellation eligibility or commission
changes. The user's referenced HLD002 v2.0 / FUNC001 sections are still required
before changing those policies. See the handover's phased backlog rather than
presenting unsupported buttons as working controls.


## Explicit production admin promotion

`azure-pipelines-admin-dashboard.yml` defaults `deployProduction=false`.
Automatic main runs and PR runs validate code only. A production image/deployment
requires a manual main-branch run with `deployProduction=true` and a full
`expectedReleaseSha` equal to both the checked-out commit and
`Build.SourceVersion`. The existing `craves-admin-prodlow` environment approval
remains required. The image carries the reviewed source OCI label, which is checked after pulling
the published immutable digest. The deployment consumes that digest, not its tag.

Deploy the reviewed Auth, User/Chef and Order dependencies before the admin app.
For this release, supply their existing `imageTag` parameter with that same full
source SHA. Record the build runs, source commits, registry digests and actual
ready revisions; a tag is not independent proof of a build's provenance. Preserve
immutable release tags and pin the actual dependency runtime image references to
those recorded digests before admin promotion. Mutable backend runtime tags are
rejected because a moved registry tag does not prove which image is running.

After environment approval and before any admin image update, the read-only
`verify-runtime-readiness.sh` discovers existing app and APIM origins and checks:
ready single-revision dependencies; one replica; activated Explorer flags; each
actual digest-pinned runtime image against its reviewed-SHA tag; complete API,
ancestor/descendant operation and product policy inventories; structurally exact
reviewed APIM operation authentication/body limits/backend rewrites and source-linked
durable backend admission;
no inherited credential, body, cache or routing transformations; no-store; and
anonymous denial. Unresolved policy fragments and partial paginated inventories
are rejected until separately inspected. Backend replica counts are read directly. Existing APIM custom proxy domains are accepted when
validating the admin API origin. Missing or conflicting source/configuration/
routing evidence fails before updating admin. A secret-referenced admin API
origin requires separate resolved-origin verification; this script never reads
or replaces its secret. Admin update changes only the digest-pinned image and reasserts the existing
one-replica bounds. Before/after hashes verify managed identity, secret references
and all unrelated configuration. Post-deploy checks require Single revision mode,
one actual replica and all traffic on the new ready revision. Firebase, API,
payment, document, identity and secret configuration are preserved.

These checks are deployment prerequisites. They do not prove authenticated
Explorer success or wrong-role/owner denial, and an anonymous 401 is not described
as authenticated acceptance. Record those owner-session checks securely with the
exact backend release and complete migration/index evidence before approving the
admin environment. Do not extract owner cookies or put access tokens into CI.
The command-fixture tests exercise these inventory guards without Azure calls;
actual runtime acceptance still belongs to the approved release.
