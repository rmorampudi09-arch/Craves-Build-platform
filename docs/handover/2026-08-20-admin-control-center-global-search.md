# Craves Admin Control Center + Audited Global Search — Production Handover

Date: 2026-08-20  
Repository: `rmorampudi09-arch/Craves-Build-platform`  
Branch: `feature/admin-control-center-global-search`  
Pull request: `#261`  
Target: `main`  
Status at authoring: code complete and statically reviewed; production Azure deployment still requires the controlled pipeline steps below.

## 1. Why this change exists

The previous administrator workspace provided useful modules and an Order Service summary, but an operator still had to know which screen to open before starting an investigation. There was no safe, production-grade way to begin with the value a customer or chef gives support — especially a mobile number, email address, customer/chef UUID, order UUID, payment UUID, refund UUID, or delivery command UUID — and then move into the relevant evidence.

The control center now makes global case discovery the primary admin workflow while preserving service ownership, role authorization and existing product rules.

## 2. User experience outcome

The administrator shell now uses the same canonical Craves visual language as the customer/chef web experience:

- Craves navy: `#0B1426`
- Craves cream: `#FFF8EC`
- Craves gold: `#F6B545`
- Craves purple: `#6930CA`
- canonical `CravesLogo` component rather than a separate admin-only lettermark
- rounded cards and dense operator-friendly information hierarchy
- no decorative photography or stock images
- graphs remain limited to operational charting already supported by the dashboard

The shell is organized around an operator's actual sequence:

1. Start from Global Search.
2. Enter an exact known customer/chef identifier or an operational UUID.
3. Provide the operational/support reason for the lookup.
4. Review minimal masked matches before exposing a full person case.
5. Open the audited customer or chef case when needed.
6. Continue into the existing order/payment/refund/delivery investigator or the owning admin module.
7. Perform mutations only in the existing owning service/module where authorization is revalidated.

## 3. Supported search paths

### Customer / chef directory

The new people directory supports:

- exact customer registered mobile number
- exact chef application mobile number
- exact customer email
- exact chef email
- customer profile UUID
- customer identity UUID
- chef application UUID
- chef identity UUID
- exact first name / exact last name / exact first + last name

The search result deliberately returns only a small masked identity card. It does **not** return a full phone number, address or KYC storage location in the result list.

### Full audited customer case

Once a masked customer match is deliberately opened, the administrator can read:

- profile UUID
- identity UUID
- registered phone
- first and last name
- email when recorded
- active saved delivery addresses
- recipient/contact information stored with those addresses
- area, district, city, state and postal code
- coordinate values already stored by the address module
- created/updated timestamps

The full case is no-store and creates a separate audit entry.

### Full audited chef case

Once a chef match is deliberately opened, the administrator can read:

- application UUID
- identity UUID
- phone and email
- applicant name
- registered onboarding address and coordinates
- application status and recorded rejection reason
- submitted/reviewed timestamps and reviewer ID
- KYC **metadata**: document ID/type/file name/content type/size/status/timestamps
- recorded administrator chef-decision history

Blob container/blob path values are not returned by this new admin surface.

### Existing operational evidence

The existing `AdminOperationalInvestigator` remains authoritative for:

- order UUID
- payment UUID
- refund UUID
- delivery-command UUID

It remains read-only, requires a reason, creates correlation/audit evidence in the owning services, and does not silently probe a UUID across unrelated resources.

## 4. Security and privacy model

This change intentionally treats global search as a privileged support operation, not as a generic database browser.

### Authorization

`AdminDirectoryService` rejects the request unless the authenticated `CurrentUser` has the existing `ADMIN` role. The browser admin gate remains a usability gate only; backend authorization remains authoritative.

### Operational reason

Every people search and every full case read requires `X-Admin-Reason` containing 10–500 characters. Newline characters are collapsed before storage.

### PII transport

Sensitive directory searches use `POST /search` with the search value in the JSON request body. Phone numbers and email addresses are not placed into URL query strings, reducing accidental exposure through gateway/access URL logs.

### Audit storage

`admin_directory_lookup_audit` records:

- administrator identity ID
- unique correlation ID
- action type
- query type
- SHA-256 hash of the normalized query
- target identity ID for full case reads
- result count
- administrator reason
- timestamp

The raw search term is intentionally **not** stored in the audit table.

### Response caching

Spring responses, the Next.js BFF and APIM policy use `no-store`. APIM also adds `nosniff`, frame denial and no-referrer response hardening.

### Bounded reads

- directory results: max 20
- customer active addresses: max 50
- chef decision history: max 100
- chef documents are application-scoped

No unrestricted table dump endpoint was added.

## 5. Database changes

File: `services/user-chef-service/src/main/resources/db/migration/V7__admin_directory_search.sql`

Added exact lookup indexes for:

- customer phone
- customer lower-case email
- customer lower-case first name
- customer lower-case last name
- customer lower-case first+last name
- chef phone
- chef lower-case email
- chef lower-case first name
- chef lower-case last name
- chef lower-case first+last name

Added table:

`admin_directory_lookup_audit`

This migration is additive; it does not delete or reinterpret customer/chef business data.

## 6. Backend code paths

### `services/user-chef-service/src/main/java/in/craves/userchef/web/AdminDirectoryDtos.java`

Defines the bounded request/response contracts for search, customer cases and chef cases.

### `services/user-chef-service/src/main/java/in/craves/userchef/service/AdminDirectoryService.java`

Owns:

- ADMIN authorization
- reason validation
- query classification and normalization
- exact indexed customer/chef directory reads
- masked search-hit creation
- full case reads
- audit creation
- SHA-256 query hashing
- result bounds

### `services/user-chef-service/src/main/java/in/craves/userchef/web/AdminDirectoryController.java`

Exposes:

- `POST /api/v1/admin/directory/search`
- `GET /api/v1/admin/directory/customers/{identityId}`
- `GET /api/v1/admin/directory/chefs/{identityId}`

Every successful response is `no-store` and includes an `X-Correlation-ID`.

### `services/user-chef-service/src/test/java/in/craves/userchef/service/AdminDirectoryServiceTest.java`

Covers security gates that must fail before the database is touched:

- non-admin caller
- missing/short operational reason
- unbounded/invalid free-text search

## 7. Next.js code paths

### `apps/customer-web-next/src/components/admin-workspace.tsx`

Rebuilds the persistent admin shell:

- canonical Craves logo
- brand colors
- grouped navigation
- Global Search entry
- sticky search entry point
- existing `/api/admin/me` identity gate preserved

### `apps/customer-web-next/src/components/admin-dashboard.tsx`

Reworks the overview as an operator control center while preserving the existing live Order Service summary and Syncfusion visuals.

Only metrics already exposed by the backend are displayed. No revenue, commission, SLA, health or other unsupported metric is synthesized.

### `apps/customer-web-next/src/components/admin-global-search.tsx`

Main operator workflow:

- people search
- required operational reason
- masked results
- audited full customer case
- audited full chef case
- copy-ID helpers
- links to owning admin modules
- embedded existing operational investigator for order/payment/refund/delivery UUID evidence

### `apps/customer-web-next/src/app/admin/search/page.tsx`

New administrator route: `/admin/search`.

### `apps/customer-web-next/src/app/api/admin/directory/route.ts`

Same-origin BFF for the new directory surface. It:

- rejects cross-origin POST requests
- validates action/query/reason/UUID input
- forwards the existing Craves Bearer session token
- keeps phone/email out of the URL
- applies a 12-second upstream timeout
- strictly parses/allow-lists upstream response data
- returns no-store responses

### `apps/customer-web-next/src/lib/admin-directory-contract.ts`

Strict allow-list parser for all directory response shapes.

### `apps/customer-web-next/src/lib/admin-directory-contract.test.ts`

Verifies bounded parsing and confirms undeclared sensitive fields are discarded.

## 8. APIM and deployment wiring

### `infra/apim/admin-directory/authenticated-policy.xml`

Adds:

- Bearer token presence guard
- explicit backend routing
- no-store/no-cache
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`

### `scripts/apim/configure-admin-directory-apim.sh`

Production-control script that:

- refuses to run unless `CONFIRM_APIM_WRITE=true`
- verifies the existing User/Chef Container App is healthy and on its latest ready revision
- checks APIM path ownership
- rejects unsafe inherited `backend-id` routing
- creates/updates three explicit operations
- declares `identityId` template parameters for parameterized routes
- applies and reads back security policies
- performs an unauthenticated 401 smoke check

### `azure-pipelines-admin-directory-apim.yml`

New Azure DevOps pipeline for the APIM surface.

Known service connection:

`AZURE_SERVICE_CONNECTION = Craves-Dev-Service-Connection`

The pipeline does not create a new Azure resource. It changes the existing APIM configuration only when the explicit Boolean confirmation is enabled.

## 9. CI changes

File: `.github/workflows/admin-dashboard-ci.yml`

The admin PR validation scope now includes:

- Next.js lint
- Next.js TypeScript check
- Next.js tests
- Next.js production build
- existing Order Service admin authorization test
- full User/Chef Service Maven tests
- shell syntax checks for admin dashboard and admin directory APIM scripts

At the time this handover was authored, the GitHub connector was not reporting a workflow run/status context for PR #261. Therefore this document does **not** claim the CI jobs have executed successfully. Static repository/schema/API review was performed, but the pipeline results must still be observed before treating deployment as validated.

## 10. Required deployment order

Do not deploy the web first. The new web route depends on the backend and gateway route.

1. Merge the reviewed code into `main` after required repository checks are green.
2. Deploy User/Chef Service using the existing `azure-pipelines-user-chef-service.yml` pipeline.
   - this starts the Java 21 image and applies Flyway V7 to the business PostgreSQL database.
3. Verify User/Chef Service `/actuator/health` is healthy and the latest revision is ready.
4. Create/refresh the Azure DevOps pipeline from `azure-pipelines-admin-directory-apim.yml` if it does not already exist.
5. Keep the Azure DevOps display name equal to the YAML filename: `azure-pipelines-admin-directory-apim.yml`.
6. Run that pipeline with `confirmApimWrite=true` during the approved production change window.
7. Verify its unauthenticated gateway test returns 401.
8. Deploy the existing admin dashboard pipeline after the APIM operation is available.
9. Sign in with an existing active ADMIN identity.
10. Execute the smoke-test matrix below.

## 11. Production smoke-test matrix

### Authorization

- no session calling admin BFF -> 401
- authenticated non-ADMIN -> 403 from owning backend
- active ADMIN -> allowed

### Search

- exact known customer mobile -> masked customer hit
- exact known chef mobile -> masked chef hit
- exact known email -> correct masked hit
- customer identity UUID -> customer hit
- customer profile UUID -> customer hit
- chef identity UUID -> chef hit
- chef application UUID -> chef hit
- nonexistent exact value -> empty result, not data leakage
- wildcard/unbounded string -> 400
- reason shorter than 10 chars -> 400

### Customer case

- open hit -> full profile and active addresses
- inactive addresses must not appear
- no KYC/blob paths should appear
- response contains correlation ID and no-store

### Chef case

- open hit -> application + document metadata + decision history
- blob storage location must not appear
- response contains correlation ID and no-store

### Operational evidence

- order UUID -> existing order investigation
- payment UUID -> existing payment investigation
- refund UUID -> existing refund investigation
- delivery-command UUID -> existing delivery investigation
- wrong resource type -> explicit not-found; no blind multi-service probing

### UI

- canonical Craves logo visible
- desktop sidebar functional
- mobile menu functional
- `/admin/search` reachable from header and sidebar
- copy-ID controls work in a secure browser context
- loading, empty and error states are understandable
- browser back/forward navigation remains usable

## 12. Local validation commands

### Next.js

From `apps/customer-web-next`:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

For build-only environment variables use the same approved non-secret test values used by CI. Never commit secrets.

### User/Chef Service

From `services/user-chef-service` with Java 21:

```bash
mvn -B -ntp test
```

### APIM script syntax

From repository root:

```bash
bash -n scripts/apim/configure-admin-dashboard-apim.sh
bash -n scripts/apim/configure-admin-directory-apim.sh
```

Do not run the APIM script locally against production unless operating under the approved deployment/change process.

## 13. Manual steps required

### Azure DevOps

- verify `Craves-Dev-Service-Connection` remains valid
- create/refresh pipeline `azure-pipelines-admin-directory-apim.yml`
- use `confirmApimWrite=true` only for the approved production deployment
- run User/Chef Service deployment before APIM
- run admin web deployment after APIM
- retain normal production approvals/change-window controls

### Azure Portal

No new Azure resource is required by this change.

Portal review is only needed if an existing Container App/APIM resource is unhealthy or if access policy requires inspection. Do not create new billable resources for this module without separate approval.

### Secrets and credentials

No new secret value is required by the new search module.

Do not paste service-connection credentials, Firebase tokens, database credentials or Azure secrets into chat or Git.

### DNS / domains

No DNS change is required by this module.

### Firebase

No new Firebase provider or client config is required. Existing admin session authentication is reused.

### Cashfree / Razorpay / delivery providers

No payment-provider or delivery-provider routing behavior is changed by this module. Existing operational evidence is read through its owning services.

## 14. Scale considerations

This search surface is designed around exact indexed operational lookups, not full-text CRM discovery. That is deliberate.

For high request volume:

- phone/email/UUID lookups remain index-friendly
- exact name lookup is separately indexed
- result sets are hard-bounded
- case reads are identity/application scoped
- no joins across order/payment/delivery databases were introduced
- historical analytics remains outside the transactional admin search path

If Craves later needs fuzzy names, free-text kitchen discovery, cross-service case graphs or millions of searchable historical documents, introduce a dedicated read model/search index rather than turning PostgreSQL transactional tables into an unrestricted search engine.

## 15. Product rules explicitly not changed

This work does not invent or modify:

- food pricing
- commissions
- chef payout policy
- refund eligibility
- cancellation eligibility
- delivery radius
- delivery-provider assignment logic
- FSSAI policy or compliance decisions
- Razorpay/Cashfree traffic routing
- subscription commercial rules

The admin console surfaces existing data and routes administrators to existing controlled operations.

## 16. Figma reference

A dedicated design file was created for the control-center direction:

`Craves Admin Control Center — Production UX`

Figma file key:

`InPPL7mtsqBwLb7s1fmgPy`

The first overview screen was rendered at 1600 × 1080 and uses the Craves navy/cream/gold/purple design language. It is a design reference; production code remains the source of truth for live data and security behavior.

## 17. Tool limitations encountered

- Mobbin was explicitly excluded by the project owner and was not used after that instruction.
- Lovable was connected but the workspace reported zero usable credits, so no Lovable build output was relied upon.
- Figma successfully produced the control-center reference screen.
- GitHub connector had read/write/admin access and was used for all repository changes and PR creation.
- The execution environment could not clone GitHub directly because outbound DNS/network access was unavailable, so local container builds were not falsely reported as completed.
- GitHub Actions status contexts were not reported through the connector at handover time; production deployment should not be considered validated until CI/deployment results are observed.

## 18. Remaining enhancements after this release

These are engineering/product candidates, not blockers for the current search foundation:

- dedicated admin-visible chef-review queue metric from User/Chef Service instead of reusing an unrelated order metric
- dedicated delivery exception aggregate if Operations wants it on the overview
- service-health/status aggregate if an authoritative operations endpoint is approved
- saved searches/recent cases persisted server-side with retention policy
- cross-service related-entity graph/read model once service contracts are formally defined
- fine-grained admin permissions beyond the existing broad `ADMIN` role if the organization requires role separation
- export/download capability only after a data-governance policy defines who can export PII and how exports are audited/expired
- production load test after deployment using realistic read concurrency and database cardinality

## 19. Rollback approach

The change is additive.

Application rollback:

- redeploy the previous User/Chef Service image revision
- redeploy the previous admin web image revision
- remove/disable the new APIM directory API operations if required

Database migration V7 adds indexes and an audit table only. Do not automatically drop the audit table during an incident rollback; it may contain required security evidence. Any database rollback should be a separately reviewed change.

## 20. Definition of done for production

This module is production-complete only when all of the following are true:

- code is merged to `main`
- repository CI checks are green
- User/Chef Service production deployment is healthy
- Flyway V7 applied successfully
- APIM directory operations are configured and verified
- admin web production revision is healthy
- unauthenticated access is 401
- non-admin access is 403
- ADMIN mobile/email/UUID search works
- full customer/chef case reads are audited
- order/payment/refund/delivery investigator still works
- no raw phone/email is stored in directory audit query fields
- no KYC blob path leaks through the new contracts
- production smoke evidence is captured in the normal Craves deployment/change record
