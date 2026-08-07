# P02 — APIM/OpenAPI Contract Inventory

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Inventory date:** 2026-08-07  
**Repository snapshot reviewed:** `5b40ca380f6a8e0a6d3f0ddd9fa6cf262ac3787f`  
**Phase:** P02 only  
**Runtime verification performed:** **NO**

---

## 1. Purpose

This document is the accepted P02 repository contract inventory for the current mobile rebuild. It records the API operations currently consumed by the mobile source, the repository evidence available for those operations, route-key/auth expectations, and every material contract gap discovered during the audit.

P02 is an inventory and classification phase. A `DONE` P02 means the currently consumed routes have been exhaustively classified from repository evidence; it does **not** mean all routes are implemented or runtime-ready.

No mobile product functionality, backend functionality, APIM configuration, infrastructure, or native build configuration is changed by this phase.

---

## 2. Evidence Rules

Repository reality is authoritative. The following status vocabulary is used:

- **VERIFIED** — the mobile invocation is supported by sufficiently matching concrete repository contract/implementation evidence. This is still a static repository classification unless runtime evidence is separately cited.
- **CONTRACT_ONLY** — an exact intended route is documented in repository design/contract material, but the runnable backend/APIM implementation is missing, incomplete, or path-incompatible.
- **BLOCKED** — the exact consumed route cannot be safely confirmed from the available repository contracts/implementation, or a material mismatch prevents treating it as an approved contract.

No route in this inventory is described as runtime-verified because no APIM/backend runtime calls were executed in P02.

---

## 3. Expected Inputs vs Repository Reality

The governance plan named these expected P02 inputs:

| Expected input | Repository result | P02 treatment |
| --- | --- | --- |
| `infra/apim/full/openapi.yaml` | **Not present** on `mobile-ui-rebuild-from-scratch`; direct check on `main` also did not provide this file | Record as authoritative OpenAPI gap; do not fabricate operations |
| `backend/functions/src/functions/**` | **Not present** on the working branch; root `backend/` is also absent on `main` | Use the actual current backend location `apps/api/**` for static evidence and record the path mismatch |
| `mobile/src/services/api/**` | **Not present** on the working branch; root `mobile/` is also absent on `main` | Use the actual current mobile API locations under `apps/mobile/src/**` |
| `infra/apim/policies/**` | Exact directory is not present | Inspect actual APIM domain directories under `infra/apim/**` |

`main` was used only as a reference when an expected path/evidence item was missing. It was not used to overwrite current-branch behavior. In particular, the `main` auth backend is an older implementation and does not resolve the current rebuild's `/api/v1/...` contract gaps.

---

## 4. Repository Sources Audited

### Mobile consumers

- `apps/mobile/src/features/auth/api/authApi.ts`
- `apps/mobile/src/features/auth/api/profileApi.ts`
- `apps/mobile/src/features/auth/api/sessionManager.ts`
- `apps/mobile/src/core/http/apiClient.ts`
- `apps/mobile/src/core/config/runtimeConfig.ts`

### Backend evidence

- `apps/api/src/server.ts`
- `apps/api/src/routes/auth.ts`
- route directory under `apps/api/src/routes/**`

### APIM / infrastructure evidence

- `infra/apim/**`
- `infra/apim/chef-application/chef-application-policy.xml`
- `infra/main.bicep`

### Design/LLD evidence

- `docs/CRV-AUTH-001-auth-service-LLD.md`
- `docs/craves-application-module-roadmap.md`
- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`

---

## 5. Endpoint Inventory

The current mobile source consumes **8 HTTP operations**.

| # | Domain | Mobile operation | HTTP | Consumed path | Repository contract / APIM evidence | Backend evidence | Auth expectation | Route-key expectation | Status | Mitigation / next action |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Auth | Firebase identity exchange | POST | `/api/v1/auth/firebase/exchange` | Exact route is defined in `CRV-AUTH-001-auth-service-LLD.md` | Current `apps/api` does not expose the matching `/api/v1/auth/firebase/exchange` implementation | Public CRAVES endpoint that validates Firebase identity token supplied by client | No client route key found | **CONTRACT_ONLY** | Implement/restore the exact versioned backend/APIM operation from the approved auth contract before runtime reliance |
| 2 | Auth | Current identity / account resolution | GET | `/api/v1/auth/me` | No exact `/me` contract was found in the audited auth LLD/OpenAPI evidence | No matching backend route found | Mobile shared client behavior implies authenticated Bearer usage, but server policy is not authoritative | No client route key found | **BLOCKED** | Add/identify the authoritative identity endpoint contract and then align mobile/backend/APIM; do not infer `/me` from naming |
| 3 | Auth | Session refresh | POST | `/api/v1/auth/refresh` | Exact versioned route is defined in the auth LLD | Current Express backend exposes only `/api/auth/refresh` and returns `501` | Auth LLD expects refresh credential semantics; mobile/session behavior must be reconciled with that exact contract | No client route key found | **CONTRACT_ONLY** | Resolve `/api/v1` vs `/api` mismatch, implement refresh rotation, and reconcile refresh credential transport before runtime use |
| 4 | Auth | Logout / revoke | POST | `/api/v1/auth/logout` | Exact versioned route is defined in the auth LLD | Current Express backend exposes only `/api/auth/logout` and returns `501` | Auth LLD describes refresh-session clearing/revocation behavior; mobile may also carry Bearer state | No client route key found | **CONTRACT_ONLY** | Implement exact versioned logout/revoke behavior and align APIM/backend route before runtime use |
| 5 | Customer Account | Read customer profile | GET | `/api/v1/customer/profile` | No matching authoritative OpenAPI/APIM operation found | No customer profile route found in current `apps/api` routes | Bearer authentication is inferred from the authenticated mobile client, not verified by server/APIM policy | No client route key found | **BLOCKED** | Supply/locate exact customer-account contract, including response/error model and auth policy, before feature expansion |
| 6 | Customer Account | Update customer profile | PUT | `/api/v1/customer/profile` | No matching authoritative OpenAPI/APIM operation found | No customer profile route found in current `apps/api` routes | Bearer authentication is inferred from the authenticated mobile client, not verified by server/APIM policy | No client route key found | **BLOCKED** | Supply/locate exact request/response/validation contract and align backend/APIM before runtime reliance |
| 7 | Chef | Read chef application/status | GET | `/api/v1/chef/application` | A `chef-application` APIM policy template exists, but it contains placeholder backend/function-key configuration and no exact operation mapping | No matching chef application route found in current `apps/api` route set | Mobile client implies Bearer auth; audited APIM template does not establish the exact inbound auth requirement | No client route key found; APIM template injects downstream `x-functions-key` only | **BLOCKED** | Define/restore exact GET operation contract and backend mapping; replace placeholders through approved infrastructure configuration |
| 8 | Chef | Submit chef application | POST | `/api/v1/chef/application` | Same `chef-application` APIM template evidence; no exact operation/request schema found | No matching chef application route found in current `apps/api` route set | Mobile client implies Bearer auth; exact inbound APIM/server requirement is unconfirmed | No client route key found; APIM template injects downstream `x-functions-key` only | **BLOCKED** | Define/restore exact POST request/response/validation contract and backend/APIM mapping before runtime use |

### Classification totals

- **VERIFIED:** 0
- **CONTRACT_ONLY:** 3
- **BLOCKED:** 5
- **Total consumed operations classified:** 8 / 8

The absence of `VERIFIED` routes is not hidden. It reflects the current repository evidence and the rule against claiming runtime or contract verification without proof.

---

## 6. Backend Path and Version Mismatch

The working mobile consumers use versioned paths under `/api/v1/...`.

The current Express server mounts auth under:

- `/api/auth`

and currently exposes auth handlers such as:

- `POST /api/auth/refresh` — `501` placeholder
- `POST /api/auth/logout` — `501` placeholder

It does **not** establish that `/api/v1/auth/refresh` or `/api/v1/auth/logout` is reachable through APIM rewrite/versioning because the authoritative OpenAPI/operation mapping is absent from the audited repository evidence.

Therefore P02 does not silently treat `/api/auth/...` and `/api/v1/auth/...` as equivalent.

---

## 7. Route-Key Inventory

No mobile-side route-key mechanism was found for the 8 consumed operations.

### Client-side findings

The shared mobile HTTP layer builds requests from the configured API base URL plus the consumed path. The audited mobile API layer does not establish any of the following as a client requirement:

- custom `x-route-key` style header,
- `x-functions-key`,
- `Ocp-Apim-Subscription-Key`,
- per-operation APIM route-key constant.

### APIM findings

The audited Chef Application APIM policy template injects:

- `x-functions-key: REPLACE_WITH_FUNCTION_KEY`

when forwarding to a placeholder function host.

That value is a downstream backend-function authorization mechanism configured by APIM. It is **not** evidence that the mobile client must send a route key.

Because `infra/apim/full/openapi.yaml` is absent, exact APIM operation IDs/route-key mappings for the 8 consumed mobile operations cannot be inventoried beyond the evidence above.

**P02 route-key result:** `NONE FOUND / UNRESOLVED` for all 8 currently consumed operations. Any later implementation requiring a route/subscription/function key must first obtain the authoritative APIM contract/configuration; it must not be guessed in mobile code.

---

## 8. Authentication Expectation Inventory

| Capability | Static expectation | Evidence quality / gap |
| --- | --- | --- |
| Firebase exchange | Firebase identity token is submitted to the CRAVES auth exchange; endpoint itself is pre-CRAVES-session | Exact intended route exists in auth LLD; runnable backend/APIM implementation missing |
| Auth `/me` | Authenticated identity lookup is implied by mobile usage | No exact audited server/APIM contract found; **BLOCKED** |
| Refresh | Refresh credential/rotation is required by auth design | Exact design route exists; current backend is a non-versioned `501` stub; credential transport must be reconciled |
| Logout | Session/revocation cleanup expected | Exact design route exists; current backend is a non-versioned `501` stub |
| Customer profile GET/PUT | Bearer-protected behavior is implied by use through authenticated client | Server/APIM policy not established in audited contract evidence |
| Chef application GET/POST | Bearer-protected behavior is implied by use through authenticated client | APIM template does not establish exact inbound auth; server implementation absent |

### Shared-client behavior

The mobile shared API layer conditionally attaches `Authorization: Bearer <access token>` when an access token is available. That is client behavior only; it is not proof that every endpoint's APIM/backend policy accepts or requires that header.

Public/pre-session flows must not accidentally become dependent on a stale Bearer token merely because one is locally available.

---

## 9. Request/Response, Pagination, Idempotency, and Error Contract Gaps

The missing authoritative OpenAPI file prevents repository-wide proof of several P02 contract dimensions. The following are therefore recorded explicitly:

1. **Request/response JSON schemas:** Auth exchange/refresh/logout have design-level guidance, but the 8 current operations do not all have authoritative machine-readable schemas in the audited evidence.
2. **Path/query parameters:** None of the 8 current literal paths use explicit query parameters in the audited mobile wrappers; server-side optional parameters cannot be invented without OpenAPI evidence.
3. **Pagination:** Not applicable to the 8 currently consumed auth/onboarding operations as coded. Future discovery/order/list contracts remain outside current consumption and must be inventoried before implementation.
4. **Idempotency:** No authoritative idempotency header contract was found for the currently consumed POST/PUT operations. Do not introduce one by assumption.
5. **Error contract:** Mobile normalization exists, but exact per-operation backend/APIM error schemas are not fully evidenced for the blocked routes.
6. **Correlation headers:** Shared client infrastructure may provide correlation behavior, but no missing OpenAPI rule is inferred as mandatory server contract here.

---

## 10. APIM Validation Gaps

### 10.1 Missing authoritative OpenAPI

`infra/apim/full/openapi.yaml` is absent on both the working branch check and the `main` reference check performed for P02.

**Mitigation:** Restore/generate the approved machine-readable APIM contract from the actual platform source of truth before implementing contract-dependent later features. Until then, use only repository evidence that is explicit and classify unresolved operations as blocked/contract-only.

### 10.2 APIM templates are not operation contracts

The Chef Application policy is a template with placeholder values and does not prove:

- exact public path,
- HTTP method bindings,
- request/response schema,
- inbound JWT policy,
- production backend URL,
- production function key.

**Mitigation:** Do not promote policy-folder names into mobile endpoint contracts. Require operation/OpenAPI/backend evidence.

### 10.3 Current backend implementation does not match mobile versioning

The current Express auth mount uses `/api/auth`, while the mobile/design contract uses `/api/v1/auth`.

**Mitigation:** Resolve versioning/rewrite ownership explicitly in APIM/backend contract before runtime validation.

### 10.4 Refresh credential transport needs reconciliation

The design documentation and mobile/session implementation must agree on exactly how the refresh credential is presented and rotated. The current backend stub cannot validate this behavior.

**Mitigation:** Treat the route as `CONTRACT_ONLY` until the exact approved transport and backend implementation are present.

### 10.5 Identity/profile/chef application contracts are incomplete

`/api/v1/auth/me`, customer profile GET/PUT, and chef application GET/POST lack enough matching repository contract/backend evidence for approval.

**Mitigation:** Keep these routes explicitly `BLOCKED`; later implementation must use the restored/approved contract rather than extrapolating from the current wrapper names.

---

## 11. Feature-Domain Contract Map

P02 also checked the broader domains named by `phases.md` so later phases do not mistake policy-folder presence for a usable mobile contract.

| Feature domain | P02 repository evidence | Current-mobile consumption | P02 conclusion |
| --- | --- | --- | --- |
| Auth | Auth LLD + partial/stub backend | Yes | 3 contract-only + 1 blocked consumed operations |
| Discovery | APIM/domain artifacts may exist, authoritative full OpenAPI absent | No current consumer found in audited mobile source | Contract must be re-established before P31+ implementation |
| Cart | APIM/domain artifacts may exist, authoritative full OpenAPI absent | No current consumer found | Contract must be re-established before cart phases |
| Checkout | APIM/domain artifacts may exist, authoritative full OpenAPI absent | No current consumer found | Contract must be re-established before checkout phases |
| Orders | APIM/domain artifacts may exist, authoritative full OpenAPI absent | No current consumer found | Contract must be re-established before order phases |
| Customer Account | No exact customer-profile contract found for current wrapper | Yes | GET/PUT profile blocked |
| Notifications | APIM/domain artifacts may exist, authoritative full OpenAPI absent | No current consumer found | Re-audit before notification implementation |
| Support | APIM/domain artifacts may exist, authoritative full OpenAPI absent | No current consumer found | Re-audit before support implementation |
| Chef Application | APIM template with placeholders | Yes | GET/POST blocked pending exact operation/backend contract |
| Chef Orders/Menu/Analytics/Profile/Business/Payout/Subscription | Domain artifacts alone are insufficient without authoritative operation schema | No current consumer found in audited auth-only mobile foundation | Re-audit exact contracts before each corresponding implementation phase |

This table is intentionally conservative: it does not classify an unused future route that has not yet been identified by exact method/path/schema.

---

## 12. `main` Branch Reference Findings

The user authorized `main` as a reference for doubts. P02 used it only to resolve missing-evidence questions.

Findings:

- expected root `backend/**` and `mobile/**` layouts were not recovered from `main`,
- the expected `infra/apim/full/openapi.yaml` was not recovered from the direct `main` check,
- the `main` auth implementation represents an older backend shape and is not treated as the contract for this rebuild,
- no current rebuild route was upgraded to `VERIFIED` solely because a similarly named older implementation exists on `main`.

---

## 13. P02 Exit Criteria

- [x] Every API operation currently consumed by the audited mobile API layer is inventoried.
- [x] Every consumed operation is classified as `VERIFIED`, `CONTRACT_ONLY`, or `BLOCKED`.
- [x] Route-key expectations are inventoried without inventing missing keys.
- [x] Authentication expectations are inventoried and distinguished from client-side assumptions.
- [x] Backend/APIM/versioning mismatches are documented with mitigation.
- [x] Missing OpenAPI/backend/mobile expected paths are documented explicitly.
- [x] Request/response, pagination, idempotency, and error-contract gaps are recorded.
- [x] No runtime-verification claim is made without runtime evidence.
- [x] No new app functionality was introduced.
- [x] `main` was used only as reference evidence and did not replace current-branch truth.
- [x] No P03 implementation work was started.

**P02 acceptance result:** **DONE — contract inventory complete; unresolved runtime/contract dependencies remain explicitly classified for later resolution.**

---

## 14. Handoff Boundary

P02 ends here. This document does not authorize P03 or any later phase. The next phase may begin only after explicit user instruction under the repository phase-control rules.
