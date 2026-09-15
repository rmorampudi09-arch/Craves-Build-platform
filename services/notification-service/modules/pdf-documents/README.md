# Craves PDF Documents module

## 1. What this module does

One document-generation module inside the existing Java 21 / Spring Boot 3 Notification Service produces private PDFs from the existing order, subscription and chef-finance records. It does not introduce a Node.js backend, a separate hosting platform or a new payment flow. Next.js handles the signed-in browser interface and a narrow server-side API proxy only.

The code is delivered through PR #321 in `rmorampudi09-arch/Craves-Build-platform`. The earlier source-recovery description is obsolete: implementation code was already committed to the branch. The supplied ZIP was not read successfully in the local chat runtime; this delivery is generated from the actual reviewed GitHub sources, with a new file manifest and independently executed tests. There is no owner upload step.

## 2. Document catalogue and financial meaning

| Type | Source owner | Meaning |
| --- | --- | --- |
| ORDER_SUMMARY | Order Service | Saved order items, quantities, charges, delivery-address snapshot and recorded order status; not proof of payment |
| PAYMENT_RECEIPT | Order Service | A chef-specific ON_DEMAND order whose owned checkout is PAID; not the total of a multi-chef checkout |
| SUBSCRIPTION_RECEIPT | Subscription Service | An owned PAID subscription invoice with recorded paid_at, amount and cycle; never today's plan price |
| CHEF_ORDER_STATEMENT | Order Service | Orders selected by immutable order-time chef ownership and order creation time |
| CHEF_EARNINGS_STATEMENT | Integration Service | Recorded gross, commission, withheld tax, adjustment and net amounts; totals stay separate by status |
| CHEF_SETTLEMENT_STATEMENT | Integration Service | Only the requesting chef's settlement-item allocations, grouped by batch status; never a shared batch's total |

No pricing, commission, tax, delivery-radius, FSSAI, refund or subscription-allocation rule is introduced. Existing amounts are serialized from BigDecimal without recalculation. Original order totals are not presented as an outstanding balance after a refund. A settlement batch marked SETTLED is not independent proof of a bank credit to an individual chef.

These documents deliberately do not claim to be GST tax invoices, bills of supply or credit notes. Those need an approved issuer identity, statutory fields, numbering, tax treatment, correction policy and implementation. No GSTIN, legal address, tax registration or invoice number is fabricated. Finance/legal sign-off is a prerequisite for adding those document types.

## 3. Customer, chef and API entry points

The existing customer Orders screen at `/orders` contains the document panel. It reuses the orders already loaded by the screen; it does not fetch an unrelated dataset. Select the relevant kitchen-specific order, choose Order summary or Payment receipt, then Generate PDF. A bounded poll shows the result. Saved PDFs can be downloaded or queued for email. The existing active/past/all filters and tracking links remain in place.

Chefs use `/chef/statements`, protected by the existing ChefAccessBoundary. The earnings page links to it when `CRAVES_DOCUMENTS_WEB_ENABLED=true`. Select order activity, earnings or settlement allocations; choose dates, currency and timezone; generate, download or email the resulting snapshot. Saved-document history uses an opaque cursor and has an explicit Load older documents action.

Periods include the From date and exclude the To date. To cover September, use September 1 through October 1. The browser accepts 1-31 calendar days; the source adapters accept the corresponding bounded UTC interval. Source statements refuse more than 1,000 detail rows with a reduce-period error. They never silently drop excess rows. Statements describe current recorded statuses at snapshot time, not reconstructed historical balances.

Customer selection currently reflects the existing Orders screen's loaded order set. The document API and saved-document cursor history are not restricted to the screen's first page. A future order-history UI pagination improvement remains in the Order History module, not an invented PDF data source.

Mobile can reuse the backend HTTP contract with its existing authenticated access token. React Native document screens, device share sheets and background-download permissions are not part of this change.

Backend routes under `/api/v1/documents`:

| Method | Route | Result |
| --- | --- | --- |
| GET | /capabilities | Supported types, feature gates and technical bounds |
| POST | / | Create a snapshot and queue rendering; requires Idempotency-Key |
| GET | / | Owned cursor history; limit, cursor, type and reference filters |
| GET | /{id} | Owned status and safe metadata only |
| GET | /{id}/download | Exact saved PDF, private no-store response and attachment filename |
| POST | /{id}/email | Queue to the current verified account email; no body or supplied address |
| GET | /{id}/emails | Owned email request statuses, without delivery addresses or provider internals |

The Next.js browser proxy uses `/api/documents` with those paths. It rejects unknown routes, duplicate or unexpected query parameters, cross-origin writes, malformed request bodies and mismatched response IDs. JSON bodies and PDF bodies have separate size limits and deadlines. It never sends the session token to the browser, logs it or embeds it in a URL. Browser downloads also verify byte length and SHA-256 against the saved metadata.

Example authenticated creation body (use an existing owned record, not this placeholder):

```json
{"type":"ORDER_SUMMARY","sourceId":"22222222-2222-4222-8222-222222222222","timezone":"Asia/Kolkata","currency":"INR"}
```

Headers: `Authorization: Bearer <existing access token>`, `Content-Type: application/json`, and a unique 16-100 character `Idempotency-Key`. Do not paste access tokens or secrets into chat, shell history or documentation. Reusing a key with different request meaning returns a conflict; retrying the same meaning returns the existing document without contacting the source again.

## 4. Persistence, rendering and email processing

Flyway V6 adds `notification_schema.pdf_document`, `pdf_document_email` and `pdf_document_audit`. Existing migrations are unchanged. Source snapshots, ownership, request identity, timezone and template version are immutable. A READY PDF's saved metadata is immutable. The audit table is append-only at the row level. This is application/database audit protection, not certification of regulatory WORM storage or a digital signature.

Generation states are QUEUED, RENDERING, READY and FAILED. PostgreSQL row locking with SKIP LOCKED claims work across replicas. Lease tokens fence late workers: an obsolete worker cannot overwrite a newer result. Retries have an explicit five-attempt budget and bounded delay. Exhausted leases are finalized as failed. The worker is a dedicated, bounded lifecycle executor; it does not enable scheduling in unrelated modules.

PDFs use content-addressed keys inside a configured private Azure Blob container. Writes are create-only. Reads check the saved length, the exact digest and the blob ETag before delivery. The application does not generate public links or SAS URLs. Storage uses the existing application's managed identity scoped to the selected container. The adapter refuses a container with public blob access. No container or storage account is created automatically.

The existing approved Craves logo is packaged in local resources. Its SHA-256 is `afb6751bb1291f5cba13f3223140cc42229cb00696e025f617766527d6c7fd07`; it is validated before embedding. No customer-triggered image download or HTML rendering occurs. Layout includes wrapped tables, repeated headers, page numbering and explicit document notices. PDFs are bounded to 4 MiB and 100 pages; rendering has a time budget.

The default template uses built-in Latin PDF fonts and currency codes such as INR. Unsupported glyphs cause a controlled failure rather than silently replacing a customer name or menu description. An operator-provided font can be selected through CRAVES_DOCUMENTS_FONT_PATH, but full Telugu/Hindi complex-script shaping and visual acceptance are not certified by this delivery. No font files are distributed in the source ZIP. This language-coverage gate must be tested with real supported-language text before broad production activation. There is no claimed PDF/A, PDF/UA or digitally signed invoice conformance.

Email states are QUEUED, SENDING, ACCEPTED, FAILED and UNKNOWN. Email resolves the recipient through the existing Auth internal endpoint immediately before sending, checks identity, ACTIVE status and verified email, then attaches the exact saved PDF via ACS. Users cannot provide recipients or CC addresses. It does not use an Outlook inbox, marketing mailing list or a generic business CC default.

A timeout after provider submission may have occurred becomes UNKNOWN. It is never automatically retried. Another email request for that document is blocked while QUEUED, SENDING or UNKNOWN exists. The provider's ACCEPTED status is not relabelled as inbox DELIVERED. Operator review of a verified provider outcome is required before any future unknown-outcome resolution workflow; no blind database reset or forced resend is supplied here.

## 5. Configuration and secrets

All new activation flags default to false. Keeping them false changes no order, payment, notification-provider or delivery-provider behavior. The additive database migration still applies when a new Notification image is deployed; schedule and verify that migration independently of feature activation.

Notification Service settings:

| Variable | Default / purpose |
| --- | --- |
| CRAVES_DOCUMENTS_ENABLED | false; master API gate |
| CRAVES_DOCUMENTS_WORKER_ENABLED | false; dedicated rendering and document-email worker |
| CRAVES_DOCUMENTS_EMAIL_ENABLED | false; document attachment submission gate |
| CRAVES_DOCUMENTS_ORDER_BASE_URL | existing Order Container App HTTPS origin, no path/query |
| CRAVES_DOCUMENTS_INTEGRATION_BASE_URL | existing Integration Container App HTTPS origin |
| CRAVES_DOCUMENTS_SUBSCRIPTION_BASE_URL | existing Subscription Container App HTTPS origin |
| CRAVES_DOCUMENTS_BLOB_ENDPOINT | existing Azure Blob account HTTPS origin |
| CRAVES_DOCUMENTS_BLOB_CONTAINER | dedicated private container, explicitly selected |
| CRAVES_DOCUMENTS_MANAGED_IDENTITY_CLIENT_ID | optional user-assigned identity; otherwise system-assigned |
| CRAVES_DOCUMENTS_FONT_PATH | optional approved local font path; language acceptance still required |
| CRAVES_DOCUMENTS_ALLOW_LOCAL_HTTP | false; loopback-only local source testing escape hatch, not production |

Set `CRAVES_DOCUMENTS_SOURCES_ENABLED=true` separately in Order, Integration and Subscription only after their source endpoints are deployed and tested. Set `CRAVES_DOCUMENTS_WEB_ENABLED=true` in the existing Next.js application last. Browser code uses the existing `CRAVES_API_BASE_URL` and HttpOnly session cookie.

The document email gateway reuses these existing Notification Service settings from application.yml: `ACS_EMAIL_CONNECTION_STRING`, `ACS_EMAIL_SENDER_ADDRESS`, optional `ACS_EMAIL_REPLY_TO_ADDRESS`, `CRAVES_AUTH_INTERNAL_BASE_URL`, and `CRAVES_AUTH_INTERNAL_SERVICE_SECRET`. Reuse the existing Azure secret references; no new key is invented. Existing database connection and JWT verification settings are unchanged. Secrets belong in Azure Key Vault / Container App secret bindings, never source code, PR comments or chat.

The established Azure DevOps service connection remains `Craves-Dev-Service-Connection`. GitHub CI needs no Azure, Firebase, payment-provider or email credentials. The optional Azure read-only preflight reuses the already-defined GitHub OIDC keys `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`; it does not export their values. Do not rotate keys to make document CI pass.

## 6. Local and continuous verification

Prerequisites: Java 21, Maven, Node 22, npm, Python 3 and Docker. From the repository root run:

```bash
bash scripts/documents/test-local.sh
```

The script creates a disposable PostgreSQL container on a random loopback port, executes all tests in the four affected Java services, verifies that every PDF-specific database test actually ran, and runs the existing complete web verification command. The disposable database is named pdf_module_test and is removed at exit. Never point these tests at a business or production database.

GitHub workflow `.github/workflows/backend-pdf-documents-ci.yml` runs the same Java and web verification. It checks no-skip evidence for document persistence, source ownership, receipt eligibility, shared settlement isolation, migration replay, auth gates, branding, PDF content and pagination. Web verification includes lint, TypeScript, existing tests, new document contract/transport tests and the Next.js production build.

The build produces actual Java-generated synthetic examples; their amounts and names are test fixtures, not real customer records. The delivery artifact adds a complete changed-file ZIP, hashes, this runbook and the full source appendix. An earlier successful dependency-preparation or recovery-only workflow is not module acceptance. Always record the final tested source SHA and workflow run.

CI is not live Azure acceptance: it does not prove the managed identity can access the selected Blob container, that APIM forwards private binary responses correctly in production, that a verified real recipient receives ACS mail, or that production font coverage is acceptable. Those require controlled runtime checks. No production payment or delivery booking is required to test PDFs against existing owned records.

## 7. Controlled activation and rollback

Deploy the already-approved service images through the established release pipelines; do not change hosting topology or rewrite payment/delivery configuration. The backend production entry point remains `azure-pipelines-backend-completion.yml`. This module does not create a competing automatic deployment pipeline.

Activation order:

1. Deploy Order, Integration and Subscription source endpoints with their document-source flags off. Deploy Notification V6 and the PDF code with all document flags off. Deploy web with its document flag off.
2. Verify health and all Flyway history, image SHAs and previous ready revisions. Read-only runtime preflight reports configuration presence only, never production acceptance.
3. Select an existing private Blob container and grant the Notification managed identity least-privilege access at container scope. Verify networking. Storage operations and ACS email can incur usage charges; no paid resource provisioning is automated here.
4. Bind the three internal HTTPS source origins and the private storage settings. Reuse existing Auth/ACS secret references. Review supported-language font coverage.
5. Configure only the dedicated document routes in APIM, preserving cursor/query parameters, Authorization and Idempotency-Key. Disable caching and request/response-body logging for these financial documents. Do not apply JSON body rewriting to PDF responses. Do not expose the read-only source adapters through a public unauthenticated route.
6. Enable source flags, then generation and worker flags. Generate from an existing owned order; verify the captured record, logo, totals, length, hash, cursor history and cross-account denial. Verify one chef statement includes no other chef's allocation.
7. Enable the separate document email flag for a controlled test to an active verified account. Confirm the exact attachment and provider outcome; inspect the recipient inbox rather than inferring delivery from ACCEPTED. Enable the web document flag last.

Rollback is feature-first: turn off the web document flag and new document email/worker/API flags, leaving existing general notification flags untouched. Restore affected application image revisions only through the existing release process. Keep issued PDF blobs, snapshots and audit evidence; do not drop V6 tables, modify historical migration files or blindly reset UNKNOWN emails. The new source endpoints are read-only and do not mutate the underlying financial domains.

## 8. File map and extension discipline

`services/notification-service/src/main/java/in/craves/notification/documents/` contains models, settings, controller/advice, repository, rendering/email claims, worker, HTTP source client, private Blob adapter, ACS gateway and branding. V6 is under that service's existing Flyway migration directory. Unit and PostgreSQL tests are under its test documents package.

Source adapters are `OrderDocumentSourceController.java`, `ChefDocumentSourceController.java` and `SubscriptionDocumentSourceController.java` in each owning service's web package. Their DbTest classes exercise the actual SQL against disposable PostgreSQL fixtures. No cross-domain write access is introduced.

Web paths: `src/app/api/documents/[[...segments]]/route.ts`, `src/components/document-center.tsx`, `src/lib/document-contract.ts`, `src/lib/document-transport.ts`, `src/screens/OrderHistory/OrderHistory.tsx`, `src/app/chef/statements/page.tsx` and the existing chef earnings page. Source manifests in delivery artifacts identify every full file and digest.

Add a future document type by approving its financial meaning first, adding a typed owned source adapter and an enum/template contract, extending strict browser schemas and tests, then versioning the template. Never accept arbitrary browser-provided prices, tax amounts, issuer identities, HTML, SQL, URLs, recipients or storage keys as rendering input. Issued documents must not silently change when live order or menu data changes.

## 9. Operations, scale and remaining gates

Metrics include render duration, ready/failed/retry counts, worker errors, email preflight failures and email outcomes. Do not add order IDs, identity IDs, email addresses, tokens or blob keys as high-cardinality metric labels. Alert on rising queue age, repeated render failures, UNKNOWN emails, storage integrity mismatches and lost worker progress.

Technical abuse bounds currently include four active generations per owner, sixty generation requests per day, twenty email requests per day, a four-MiB PDF, a one-MiB snapshot, bounded source HTTP bodies and deadlines, and an eight-request per-process browser proxy limit. These are protective engineering bounds, not prices or commercial policies. Keep gateway rate limiting and production capacity controls in place.

This implementation has not been load-certified for one million concurrent users. At that target, independently capacity-plan rendering workers, database connections, Blob throughput, queue backpressure, archival/retention, monitoring and export scheduling. A single low-cost Container App replica is not a claim of million-user capacity. The current design separates durable requests from rendering and serves the saved artifact, so repeated downloads do not reprice or regenerate the source.

Remaining production gates must be recorded honestly: storage identity/network access, APIM private binary routing and diagnostics, supported-language rendering, a controlled real email/inbox check and finance approval for any future statutory document types. Automatic receipt emails on every payment and scheduled monthly statement distribution are separate event-trigger/consent work; this release implements explicit user-requested email copies, not unapproved bulk sending.
