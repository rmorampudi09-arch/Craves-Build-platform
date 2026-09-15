# Referral v2 — architecture and explicit decisions

Source of business requirements: the supplied 14-page `Craves_Chef_Referral_Program_v2 (2).pdf`, version 2.0. References below use its section/page numbering. Implementation clarifications are marked as such; they do not purport to be additional approved business requirements.

## 1. Ownership and isolation

```text
Existing Auth owner -- durable signed account facts -----------+
Existing Order owner -- bound/delivered/refunded facts ---------+--> referral-service
Existing Finance owner -- capture/refund/funding assessments --+       |
                                                                      v
                                        PostgreSQL referral_schema: immutable policy,
                                        ancestry, snapshots, inbox, rewards, journal,
                                        wallets, reservations, fraud, audit and outbox
                                                                      |
                              Finance-owned idempotent consumer <-----+
                              records verified outcomes; alone calls payment provider

Existing web session owner --> unmounted BFF factory --> member/admin APIs
Existing native authenticated Axios owner --> unmounted native member screen
```

Referral does not replace Auth, Order, Integration/Finance, Razorpay, the selling-chef ledger or the current checkout calculator. The source-specific Java client is explicit and non-autowired: constructing it does not publish events. The database is authoritative; browser/native state never determines eligibility, ancestry, order totals, taxation or payment completion. Optional on-chain Phase 2 is out of scope.

## 2. Business invariants

| Source | Implemented rule |
| --- | --- |
| D1/D2, sections 3 and 5, pp. 4–6 | Resolve at most three fixed ancestors of the seller, preserving level numbers even when a recipient is inactive. The seller does not earn on their own sale. A→B→C→D→E gives A INR 20, 12, 8, 0 on separate INR 1,000 sales by B, C, D, E. |
| D3, section 4, pp. 4–6 | Only the selling-chef chain receives percentage rewards. A buyer referral can produce one separate customer bonus. The same person may legitimately receive both distinct tracks. |
| D4, p. 4 | Unused shares are retained, never silently rolled up. The source mentions optional rollup later, but the locked retain decision is used. |
| D5/FR-10, pp. 4, 8 | Wallet-led accounting; spending and cashout are independent disabled capabilities. Recipient, tax, limit and KYC evidence is required, not inferred from business approval. |
| Section 3, p. 5 | Food-subtotal basis, excluding tax/delivery/tips and post-subtotal discounts; default INR 800 floor; immutable signup attribution; refund hold; no debit against selling-chef earnings. |
| FR-8/FR-13, p. 8 | Exact paise, append-only economic records, hard seller-chain cap, auditable reversals and constrained status changes. |

### Exact money and refunds

Monetary API fields are decimal integer strings; Java performs guarded long/BigInteger arithmetic and clients format using BigInt rather than floating-point rupees. Entries round to paise, the total cap is floored to paise, and any overflow is trimmed from the earliest eligible level (L1 first). Every remaining partial-refund target is recalculated from the **cumulative refunded food subtotal** and original immutable policy. A later refund can only reduce, not accidentally increase, an existing reward. Fully refunded customer bonuses are reversed; partial food refunds do not prorate the flat bonus. Replayed refund versions cannot debit twice. Pending remainder can still mature; already credited reversals can make available balance negative.

### Funding is not a cosmetic ledger entry

Seller-chain awards require finance-confirmed capture, the original source snapshot hash, the current cumulative food-refund position and enough order-specific commission budget. Customer bonuses and invitee discounts use separately funded marketing budgets. Missing or insufficient evidence leaves work pending rather than inventing funds or taking a chef's earnings. Settlement requests fresh finance evidence when the existing assessment is stale (configured freshness: 900 seconds), even after the 14-day hold.

**Derived budget illustration, not an income forecast:** one INR 1,000 qualifying first checkout could carry INR 40 seller-chain reward + INR 400 customer-referrer bonus + INR 250 invitee discount = INR 690 of combined benefits. The 4% cap does not cap all acquisition spending. Funding approval must consider both budgets and the actual order economics. Wallet re-spend does not erase a reward liability or establish zero accounting cost.

## 3. Immutable attribution and privacy

Each enrolled account receives a unique random code and `/r/CODE` link, with a server-generated QR code. Referral membership lives in its own schema, not an altered host `users` table. Parent assignment and ancestry are fixed at enrolment and guarded in SQL. Existing-account enrolment cannot manufacture a historical parent; any backfill requires separately approved, evidence-backed source semantics. Missing parent facts are retriable dependencies, not permission to attach a different referrer.

Auth is the authority for account UUID, registration time, terms version and contact/device/payment fingerprints. Fingerprints must be keyed, normalised hashes produced by the trusted owner; never send raw phone, email, payment numbers or device IDs. Consent-dependent signals must not be collected without the approved consent flow. Hashes still need privacy/retention review. Shared signals and velocity/earnings reviews are held for adjudication rather than published to the downline. The UI displays anonymous generation counts; it intentionally does not expose names at deeper levels or project downline income.

**Implementation proposal requiring approval:** the unmounted web first-touch helper preserves the first valid, signed pre-signup touch for 30 days in a Secure, HttpOnly, SameSite=Lax `__Host-` cookie. The PDF does not specify that pre-signup retention period. Auth must verify this token at the new-account transaction boundary, commit attribution with its durable event, and clear the cookie only after successful creation. An existing account is never re-parented by scanning a QR.

## 4. Source contract and ordering

Internal POST endpoints are `/internal/v1/referrals/events`, `/operations`, `/outbox/claim` and `/outbox/ack`. Query strings are not allowed. Source-specific HMAC keys are separate from user JWTs; only Finance can claim/ack the outbound queue. The `ReferralSourceClient` signs the exact persisted UTF-8 bytes; it follows no redirects and bounds a request to 10 seconds and response to 128 KiB. A timeout is an unknown outcome requiring replay of the original persisted event/operation ID, not a newly invented ID.

Headers: `X-Referral-Source` (`auth`, `order`, `finance`), `X-Referral-Key-Id` (`current` or `previous`), epoch `X-Referral-Timestamp`, and lowercase hexadecimal `X-Referral-Signature`. HMAC-SHA256 signs:

```text
source\nkeyId\ntimestamp\nPOST\nexactPath\nsha256(rawBodyBytes)
```

A source event envelope is `{eventId, eventType, aggregateId, occurredAt, payload}`. Event and aggregate IDs are UUIDs; the aggregate must match the payload field shown below. Event-ID/body conflicts are rejected. Durable receipt/HTTP 202 is not proof of reward creation or money transfer.

| Source | Event | Aggregate field / responsibility |
| --- | --- | --- |
| Auth | `account.registered` | `userId`; authoritative creation and immutable referral evidence. |
| Auth | `account.status` | `userId`; active/suspended status with source ordering. |
| Order | `order.bound` | `chefOrderId`; original checkout/chef child IDs, buyer/seller UUIDs, food totals, payable, child count, time and source snapshot hash. |
| Order | `order.delivered` | `chefOrderId`; monotonic version and verified delivery time. |
| Order | `order.refunded` | `chefOrderId`; monotonic cumulative food refund, full-checkout refund status and reason reference. |
| Order | `checkout.first_qualifying_delivered` | `checkoutId`; Order attests the buyer's globally first qualifying checkout. Event arrival order is not used to decide this. |
| Finance | `order.finance_confirmed` | `chefOrderId`; capture, snapshot, commission budget, latest cumulative refund and current observation/evidence. |
| Finance | `recipient.assessed` | `userId`; assessed tax handling, fiscal-year limit, verified destination and KYC validity. |
| Finance | `budget.funded` | `fundingId`; idempotently fund CUSTOMER or DISCOUNT budget from real approved evidence. |
| Finance | `payout.outcome` | `reservationId`; outcome for the original attempt, monotonically versioned and backed by payment evidence. |

Payload validators live in `ProgramService`, `OrderBindingService`, `OrderLifecycleService`, `RecipientService` and `PayoutEvidenceService`; source allowlists are in `SourceEventRouter`. Do not infer missing facts, reconstruct money from the UI, use delivery events as proof of capture, or emit a synthetic first-checkout attestation.

**Multi-chef clarification:** chef orders have individual immutable binding snapshots and one parent checkout. The current engine gates seller-chain rewards on each chef child food subtotal; a checkout-level customer benefit requires consistent complete child bindings and authoritative first-qualifying confirmation. The PDF does not define mixed-chef minimum/discount allocation. `multiChefDecisionRef` must record the approved interpretation before activation; any different interpretation needs reviewed engine/tests changes first.

## 5. Benefit and payment state machines

Wallet spend and invitee discount operations use reserve/capture/release/refund semantics; checkout must execute the corresponding owner-side changes transactionally and idempotently. The module supplies those operations but does not patch the current checkout.

Cashout moves through RESERVED → APPROVED → SUBMITTED → PAID or UNKNOWN; RELEASED is only valid where funds have not been submitted. Exact net plus assessed withholding must equal the reserved gross. The weekly planner emits a durable Finance-owned instruction. It never calls a bank, UPI or Razorpay itself. UNKNOWN remains reserved until Finance reconciles the **original** attempt and records a supported outcome; it is not automatically treated as failure or resubmitted.

The Finance consumer claims bounded outbox pages with a lease, commits its own deduplicated execution/evidence transaction, and then acknowledges the same event/lease. Lease retries and dead-letter recovery preserve IDs and history. An ACK means durable handling by the consumer, not that a bank paid the recipient. Stale lease acknowledgements are refused.

## 6. Security and operational limits

Member/admin API identity comes from the existing Auth-issued RS256 JWT, issuer/audience, UUID subject, roles and token-version checks. Redis revocation verification fails closed when unavailable. Validate the existing Auth projection key/TTL and absent-key semantics in staging; do not assume current sessions are compatible merely because a JWT decodes.

The unmounted web BFF accepts only allowlisted same-origin routes, strips browser credentials/identity headers, resolves the existing server session, enforces administrator scope and forwards only the trusted server access token. JSON writes require same Origin and content type. Responses are bounded and private/no-store; QR responses receive restrictive CSP; audit downloads have bounded pagination. The native client reuses the existing authenticated Axios/session manager and secure-store dependency. No new authentication database or independent refresh flow is introduced.

All financial actions are revalidated on the server. Browser same-tab operation recovery and native secure-store recovery preserve IDs after uncertain responses; neither is proof that a payment completed. After closing a browser tab, reconcile history before replacing a request.

For capacity, see OPERATIONS.md. Concurrency, retry and backlog correctness tests are not evidence of an unlimited throughput, latency or availability guarantee.
