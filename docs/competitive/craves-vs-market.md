# Craves vs the market: scorecard, best flows, and a blueprint to compete

Evidence date: 24 Oct 2026 · Method and labels: [README](README.md) · Companion to the four
blueprints: [Swiggy](rea-swiggy.md) · [Zepto](rea-zepto.md) · [Cookr](rea-cookr.md) ·
[Swish](rea-swish.md)

> **This document is written to be safe in a public repository.** It compares *capabilities* and
> gives a *forward roadmap*. It deliberately contains no attack steps and no live secret, host or
> threshold. Acute, exploitable current-state findings from the Craves audits are being delivered
> to the team directly, not committed here. Craves is **live** (Hyderabad and Bangalore), so every
> change below follows `docs/runbooks/live-runtime-safety.md` and the lock-file rule in `AGENTS.md`.

## How to read this

- Craves was audited at source level, which is deeper than the public-only view we have of
  competitors. So "Craves partial/absent" is high-confidence, while competitor rows are the public
  posture from their filings, apps and engineering writing (see each blueprint's ledger).
- Status for Craves uses the audit labels: **LIVE** (in the production image), **BUILT** (code
  exists but is flag-gated, sandbox, or has no production activation record), **DOCS-ONLY**,
  **ABSENT**.

## 1. Scorecard

Rating is maturity of the *big* flow, not feature count. ●●● strong · ●●○ partial · ●○○ early ·
○○○ absent.

| Pillar | Swiggy | Zepto | Cookr | Swish | Craves today |
| --- | :---: | :---: | :---: | :---: | :---: |
| Edge protection (WAF / bot) | ●●● | ●●● | ●○○ | ●○○ | ●●○ web only |
| Session & token security | ●●○ | ●●○ | ○○○ | ○○○ | ●●○ |
| API auth hardening | ●●● | ●●○ | ●○○ | ●○○ | ●●○ |
| Device & app integrity | ●●● | ●●○ | ○○○ | ●○○ | ●○○ |
| Order-state idempotency | ●●○ | ●●○ | ●○○ | ●○○ | ●●○ |
| Refund automation & failure handling | ●●● | ●●● | ●○○ | ●○○ | ●●○ engineering, ●○○ live |
| Fraud detection | ●●● | ●●○ | ●○○ | ●○○ | ●○○ |
| Support automation | ●●● | ●●● | ●○○ | ●○○ | ●●○ |
| Food/partner trust | ●●○ | ●●○ | ●●○ | ●○○ | ●●○ |
| Privacy / DPDP readiness | ●●○ | ●○○ | ●○○ | ●○○ | ●○○ |
| Dark-pattern cleanliness | ●○○ | ●○○ | ●○○ | ●○○ | ●●● |

**Reading it:** Craves is **already even with or ahead of its direct rivals (Cookr, Swish)** on the
engineering of money paths, session design and checkout honesty, and **behind the quick-commerce
giants** (Swiggy, Zepto) on fraud detection, device integrity, support automation and edge
protection, which are exactly the flows scale buys them. The giants' *weaknesses* — human support,
refund transparency, food-safety trust, dark patterns — are where a curated home-chef brand can win.

## 2. Phase 2 — comparison matrix (the five attributes)

### 2.1 Session persistence security

| | Market best (who) | Craves today |
| --- | --- | --- |
| Token model | Short-lived access + rotating refresh is standard | **LIVE**: RS256 access ~15 min; refresh 32 random bytes, SHA-256 at rest, rotated each use; web refresh in HttpOnly/Secure/SameSite cookie; mobile refresh in SecureStore/Keychain |
| New-device defence | Swiggy unlinks wallet/BNPL and adds 2FA on new-device login (EV-SWG-04) | Partial: no device binding, new-device alert, or recycled-number check |
| Reuse / revocation | Mature stacks detect refresh-token reuse and revoke the family; admin side already does | **Admin LIVE** (family rotation, replay revokes family, live per-call check). **Consumer partial**: no reuse detection, downstream access-token revocation flag off |
| Logout-everywhere | Expected | **ABSENT** for consumers |

**Craves strength to keep:** the admin-session design (8-hour cap, family rotation, live
fail-closed revocation checked in every service) is better than anything competitors publish.

### 2.2 API authentication hardening

| | Market best | Craves today |
| --- | --- | --- |
| Edge | Swiggy & Zepto: AWS WAF Bot Control on web (EV-SWG-02, EV-ZEP-02) | **LIVE web**: Front Door WAF + security headers. **Gap**: no keyed rate-limit / WAF on the API domain; APIM tier validates only the bearer prefix, services do the JWT work |
| Service JWT | Per-service validation of iss/aud/exp | **LIVE**: order-service pins the key, checks iss/aud/exp, ignores header `alg`; ownership checks are consistent across services |
| Webhooks | HMAC over raw body + replay window | **LIVE/strong for Razorpay** (HMAC, amount check, event-id dedupe, compare-and-set to PAID). **Gap**: some delivery-provider webhooks authenticate by static token only |
| Service-to-service | mTLS or managed identity | **Gap**: shared-secret model; per-service HMAC signing exists but in monitor mode |

### 2.3 Order-state idempotency

| | Market best | Craves today |
| --- | --- | --- |
| Duplicate submit | — | **LIVE**: cart row-lock + cart cleared in the same transaction; web checkout-operation receipt (unique key, same-transaction commit, 409 on replay) |
| Payment-order creation | — | **LIVE**: one payment order per checkout, unique receipt, checked against the gateway's answer |
| State transitions | — | **LIVE/BUILT**: compare-and-set + `FOR UPDATE` on key transitions; a DB status CHECK + version column is **BUILT** (not yet in the live image) |
| Generic idempotency key | Expected on all money POSTs | **BUILT**: an `Idempotency-Key` filter exists but no client sends the header yet |
| Mobile checkout idempotency | — | **Gap**: server idempotency not wired for the mobile path (client-side merge only) |

**Craves is at or above market on money-path idempotency engineering** — the weakness is that some
of it is BUILT-not-LIVE and not yet exercised by clients.

### 2.4 Refund failure handling

| | Market best | Craves today |
| --- | --- | --- |
| Automation | Zepto/Swiggy adjudicate and pay refunds inside support, at scale (EV-ZEP-05, EV-SWG-11) | **BUILT, strong design**: deterministic idempotency key, request persisted before dispatch, GET-only status lookup, retries with backoff, cumulative-cap-under-lock, DEAD_LETTER queue. **Live execution is paused / unproven**, and auto-trigger events are held |
| Destination | Source vs wallet, customer's choice | **LIVE**: source only, which is the *honest* default; no wallet lock-in |
| Reconciliation | "captured but no order" sweepers | **Gap**: no order-payment reconciler; abandoned checkouts never expire |
| Scope | Any issue type | **Narrow**: refunds exist only for chef decline/timeout; no support-led or partial refunds |

### 2.5 Fraud detection

| | Market best | Craves today |
| --- | --- | --- |
| Refund abuse | Swiggy scores the claim in real time: graph collusion (GCN), false-complaint model, device identity (EV-SWG-08..10); Zepto runs image forensics (EV-ZEP-05) | **ABSENT** (and few refund paths to abuse yet) |
| Account / device | SHIELD device intelligence; installed-apps + device-ID fingerprints | **Customer ABSENT**; one-identity-per-phone + Indian-mobiles only; rider device binding is BUILT |
| Referral abuse | Graph / entity models | **LIVE** for the chef programme (self-referral by contact hash, caps, holds, maker≠checker) — but device/payment linkage signals are not yet fed |
| Rider GPS spoofing | Reconstructed-path analytics (EV-ZEP-13); SHIELD (EV-SWG-10) | **BUILT, weak**: self-reported mock-location flag only |

## 3. Phase 3 — per pillar: gold standard, gap, blueprint

Each blueprint is a *forward* build list. Order it behind the live-runtime safety rules.

### 3.1 Edge & API protection — gold standard: **Swiggy/Zepto** (AWS WAF Bot Control)
*Why theirs works:* the WAF challenges or blocks automated clients before they reach the origin, so
credential-stuffing and scraping never touch the app (EV-SWG-02, EV-ZEP-02).
**Blueprint:** put the API domain behind the same WAF/bot tier as the web origin; move to an APIM
tier that supports keyed rate-limits and per-key quotas; turn on the auth-endpoint limiter; add a
per-IP limit and a challenge on the pre-auth OTP path so one caller cannot exhaust a shared bucket.

### 3.2 Session & token — gold standard: **Swiggy** (incident-driven ATO hardening)
*Why theirs works:* they closed the exact path attackers used — new-device login unlinks stored
credit and adds 2FA (EV-SWG-04, EV-SWG-14).
**Blueprint:** extend the mature admin-session model to consumers — refresh-token **family + reuse
detection** (reuse revokes the family), a lock/version so parallel refreshes can't fork a session,
server-side session revocation on logout and suspend (turn the downstream revocation on),
logout-everywhere, and step-up re-auth when the phone number or a payment method changes.

### 3.3 Device & app integrity — gold standard: **Swiggy** (SHIELD device-first risk)
*Why theirs works:* device identity unmasks cloned/tampered apps and GPS-spoofing partners without
hard-blocking every rooted user (EV-SWG-10).
**Blueprint:** add Play Integrity / App Check / App Attest attestation on the OTP, exchange and
checkout endpoints; feed a device fingerprint into risk scoring; replace self-reported rider device
binding and mock-location flags with attested signals; enable R8/obfuscation on the customer build;
add certificate pinning in both apps.

### 3.4 Order state & idempotency — gold standard: **Craves' own engineering**, once fully live
*Why it's strong:* same-transaction checkout receipts, reused payment orders with gateway-checked
receipts, compare-and-set transitions.
**Blueprint:** ship the DB status-CHECK + version column to the live image; make clients send the
`Idempotency-Key` (wire the mobile path); replace the synchronous "tell order-service it's paid" call
with the outbox you already use elsewhere; add an abandoned-checkout expiry and a captured-but-no-order
reconciler; add on-demand stock/capacity decrements so a chef can't be oversold.

### 3.5 Refund failure handling — gold standard: **Zepto** (photo-first, AI-adjudicated, fraud-checked)
*Why theirs works:* a router + specialist agents + image forensics + a model jury pay or reject at
machine speed, with evaluation gates; cost drops while abuse is filtered (EV-ZEP-05).
**Blueprint (sequence the engineering you already have):** activate refund execution and the
auto-trigger events under the runbook; add the cumulative-cap as a DB constraint, not only code; add
refund webhooks alongside polling; build a support-led partial/full refund + credit flow with
maker-checker and an audit trail; **then** layer a photo-evidence issue flow and (later) automated
adjudication. Keep refund-to-source as the default — it is a trust advantage over Zepto's wallet
default.

### 3.6 Fraud detection — gold standard: **Swiggy** (graph + device + false-complaint models)
*Why theirs works:* years of labelled data across tens of millions of users feed real-time scoring
at the moment money moves (EV-SWG-08..10).
**Blueprint (start rules, grow to ML):** feed the device and payment-instrument signals into the
referral/fraud checks that currently receive only a contact hash; add order/payment velocity limits
and a simple risk score at checkout; add linked-account detection (shared device, address, payment);
add refund-abuse checks before the refund flow opens to customers; strengthen rider GPS checks with
speed/teleport/zone geometry rather than a self-reported flag.

### 3.7 Support automation — gold standard: **Swiggy/Zepto** (LLM agent that calls tools under guardrails)
*Why theirs works:* an intent router + specialist agents that call backend tools, write actions to a
CRM, and fall back to humans — consistent policy at ~100-200k tickets/day (EV-SWG-11, EV-ZEP-05).
**Blueprint:** Craves already has a tightly-scoped read-only assistant — the right foundation. Grow it
by giving it *bounded, audited actions* (issue a refund within a cap, resend an OTP, re-trigger a
notification) behind guardrails and maker-checker; add macros, SLA timers and CSAT to the agent
console; add a customer ticket-history screen; publish a grievance officer and the 48-hour / one-month
timelines (Consumer Protection (E-Commerce) Rules 2020, EV-REG-02).

### 3.8 Trust, privacy & honesty — where Craves can lead now
*Market weak spots:* Zepto's dark-pattern penalty and food-safety record; Swiggy's hard-to-reach
support and intermediary-defence losses; Cookr pushing quality complaints to the cook and serving an
expired certificate; Swish disclaiming "quality, taste" while cooking the food (see each blueprint).
**Blueprint (cheap, high-trust, and mostly net-new so low runtime risk):** show each chef's FSSAI
registration, last-audit date and veg/non-veg handling to customers; publish a refund/compensation
matrix with SLAs; add number masking / call bridging for customer↔rider↔chef (currently a gap);
ship DPDP-native consent at sign-up, in-app deletion/export, a retention schedule and a grievance
officer **before the ~May 2027 DPDP core-duty date** (EV-REG-01); keep the already-clean checkout
(no pre-ticked add-ons, fees itemised) as a selling point — it is Craves' one clear ●●● over everyone.

## 4. The best flows in the market, and why Craves isn't there yet

| # | Best-in-market flow | Owner & why they win | Why Craves isn't there | How Craves competes |
| --- | --- | --- | --- | --- |
| 1 | Real-time fraud scoring at the refund moment | **Swiggy** — graph+device+complaint models on huge labelled data | No fraud engine; little refund surface yet | Start rules now, feed device/payment signals, grow to ML as data arrives |
| 2 | Photo-first AI refund adjudication | **Zepto** — image forensics + model jury at 100k/day | No photo issue flow; refund execution paused | Activate refunds, add photo evidence, then automate |
| 3 | Edge bot/WAF defence | **Swiggy/Zepto** — AWS WAF Bot Control | API domain has no WAF/keyed limits | Put the API behind the same tier; turn on limiters |
| 4 | Device-first integrity | **Swiggy** — SHIELD | No attestation/root/emulator checks; self-reported rider signals | Play Integrity/App Attest + device fingerprint |
| 5 | Incident-driven ATO hardening | **Swiggy** — new-device unlink + 2FA | No device binding/step-up for consumers | Extend the admin-session model to consumers |
| 6 | Tool-calling support agent | **Swiggy/Zepto** | Craves' assistant is read-only | Give it bounded, audited actions |
| 7 | Resilience under peak | **Swiggy** — multi-AZ, RTO/RPO, CDN failover | Small pools, sync calls under lock, no load tests | Timeouts, outbox the payment confirm, load-test |
| 8 | Service guarantees paid in credit | **Swiggy** — On-Time Promise, member guarantees | No compensation/credit engine | Add missed-meal credit for meal plans |

## 5. Where Craves already beats the field

1. **Checkout honesty** — fees itemised pre-payment, no pre-ticked add-ons, tips, donations or
   countdown timers. The giants carry dark-pattern penalties and complaints (EV-ZEP-10, EV-SWG-20).
2. **Admin-session security** — stronger than anything competitors publish.
3. **Money-path idempotency engineering** — same-transaction receipts and gateway-checked payment
   orders match or beat the market; the task is to finish shipping it live.
4. **Refund dispatch safety** — deterministic keys, cap-under-lock, DEAD_LETTER queue; design-grade.
5. **Refund-to-source default** — a trust win over Zepto's wallet default.
6. **A tightly-scoped AI assistant** — least-privilege by default, the right base to grow from.
7. **FSSAI-gated chef onboarding with document review** — a trust spine Cookr and Swish lack.

## 6. Sequencing (behind the live-runtime safety rules)

1. **Operational-urgent (not security-sensitive):** finish the refund go-live chain so the published
   refund promise is actually backed by a running worker; add the captured-but-no-order reconciler.
2. **Defence-in-depth, net-new:** API-edge WAF + rate limits; consumer session revocation + reuse
   detection; app attestation.
3. **Trust, mostly net-new:** FSSAI display, refund/compensation matrix with SLAs, number masking,
   DPDP consent/deletion + grievance officer.
4. **Fraud:** feed existing signals, add velocity + risk score, then ML as data grows.
5. **Support:** bounded actions for the assistant; console SLAs and CSAT.

Net-new, additive work (trust, DPDP, fraud rules, attestation) carries the least runtime risk because
it does not alter the live money path. Changes to auth, order state and payments must go through the
runbook and the lock files.

## 7. Regulatory evidence (applies to everyone)

| ID | Item | Source |
| --- | --- | --- |
| EV-REG-01 | DPDP Rules 2025 notified 13 Nov 2025; core data-fiduciary duties (incl. 72-hour breach reporting) ~18 months later (~May 2027); consent-manager duties ~12 months | [MeitY / Deccan Herald](https://www.deccanherald.com/amp/story/india%2Fcentre-notifies-dpdp-rules-implementation-planned-in-phases-spread-over-12-18-months-3798465), 14 Nov 2025 |
| EV-REG-02 | Consumer Protection (E-Commerce) Rules 2020: grievance officer, acknowledge in 48 h, resolve within one month; display legal name, address, customer-care & grievance contacts | [IndiaLaw summary](https://www.indialaw.in/blog/civil/consumer-protection-e-commerce-rules/) |
| EV-REG-03 | CERT-In directions (28 Apr 2022): report listed cyber incidents within 6 hours; retain ICT logs 180 days | [Mondaq](https://mondaq.co.uk/india/it-and-internet/1270332/6-hours-to-report-cyber-incidents-to-cert-in) |
| EV-REG-04 | CCPA dark-pattern self-audit advisory, 5 Jun 2025 (Guidelines 2023, 13 patterns) | [Storyboard18](https://www.storyboard18.com/how-it-works/e-commerce-platforms-told-to-self-audit-and-eliminate-dark-patterns-in-new-consumer-advisory-76047.htm) |
