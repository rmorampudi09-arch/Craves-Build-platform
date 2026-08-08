# P70 — Coupons/Offers — Empty Cart

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Guide ref:** 29 — Coupons and Offers — Empty Cart Reference State  
**Status:** **BLOCKED**  
**Execution type:** exact-contract capability audit; no fabricated offers, eligibility, terms, or discount values

## Scope evaluated

P70 owns the empty-cart Coupons & Offers experience defined in `phases.md`: coupon input, offers/categories, offer terms/details, and the empty-cart state. The master guide additionally requires server-owned offer eligibility, category/offer data, terms metadata, bank-offer metadata, and an empty-cart composition in which View Cart remains hidden.

The phase was executed against the current branch contract and runtime boundaries. No production screen, route, fake offer catalogue, or coupon-validation flow was added because the required authoritative coupons/offers contract is not present.

## Exact contract audit

The current branch provides only the high-level contract note that `Coupons` is a core API module under `/api/v1`. It does **not** define an executable Coupons & Offers route contract or request/response schema.

Verified gaps:

- `shared/contracts/openapi-notes.md` names `Coupons` as a module but provides no concrete coupon/offer path, request body, response shape, pagination contract, category model, bank-offer model, terms model, or eligibility/result model.
- `openapi/` contains only `auth-service-v1.yaml`; there is no coupons/offers OpenAPI contract to generate or validate a typed mobile client against.
- `services/` contains no coupon/promotion service directory or other discoverable authoritative implementation that defines the mobile contract.
- `infra/apim/` has customer cart, checkout, payments, addresses, and other policies, but no coupons/offers APIM surface in the inspected branch.
- `apps/mobile/src/features/` has no existing offers/coupons data-access layer or typed domain contract to extend.
- `apps/mobile/src/features/cart/domain/cartScreenModel.ts` explicitly marks `couponDiscount` as `SERVER_CONTRACT_UNAVAILABLE`; the current cart snapshot does not expose an authoritative coupon-discount amount that P70 could truthfully present as savings.
- `apps/mobile/src/features/cart/domain/cartTypes.ts` models the coupon dependency only as lifecycle status and contains no coupon identity, code, eligibility, terms, category, bank-offer, or discount payload.

Because the response contract is absent, adding a path such as a guessed `/coupons` endpoint, inventing JSON fields, or accepting a locally-computed discount would violate `agent.md` and the master guide.

## Guide/phase acceptance boundary

P70 cannot satisfy its acceptance criteria with the current repository contract:

- server-authoritative eligibility cannot be parsed because no eligibility response model is approved;
- offers/categories cannot render from server data because no list/category response contract is approved;
- T&C/details cannot be wired because no terms/detail contract or canonical terms fields are approved;
- savings cannot be shown as active/verified because the cart model explicitly marks coupon discount as unavailable;
- bank offers cannot be rendered from real data because no bank-offer metadata contract is approved.

The reference's empty-cart behavior itself is clear: View Cart must stay hidden. That behavior already follows the canonical cart rule, but a static shell around invented offer data would not make P70 complete.

## No-fabrication decision

P70 deliberately does **not**:

- create a local array of sample coupons, categories, savings, or bank offers;
- hard-code a coupon as valid/invalid for production behavior;
- derive final discount or savings on the client;
- invent offer T&C text or eligibility reasons;
- invent endpoint URLs, query parameters, request fields, response fields, pagination fields, or APIM route keys;
- register `CustomerCouponsOffers` as a production destination that can only render placeholder/static data;
- touch P71 active-cart apply/remove/replace behavior.

This preserves the repository rule that a missing exact backend contract is blocked rather than guessed.

## Blockers

- `CUSTOMER_OFFERS_LIST_CONTRACT_UNAVAILABLE` — no exact offer/category/bank-offer list contract.
- `CUSTOMER_COUPON_ELIGIBILITY_CONTRACT_UNAVAILABLE` — no exact server validation/eligibility request and response model.
- `CUSTOMER_OFFER_TERMS_CONTRACT_UNAVAILABLE` — no exact offer detail/T&C contract.
- `CUSTOMER_COUPON_SAVINGS_CONTRACT_UNAVAILABLE` — current cart model marks coupon discount as server-contract unavailable.

These blockers prevent the server-backed content and interactions required by P70, so the correct phase status is **BLOCKED**, not PARTIAL or DONE.

## Files changed for P70

- `docs/mobile-ui-rebuild/P70_COUPONS_OFFERS_EMPTY_CART.md`
- `build.md`

No mobile production source, backend, APIM, OpenAPI, database, infrastructure, Android native source, Gradle/APK, or AAB configuration is intentionally changed for P70.

## Validation

Static contract/runtime audit completed against the target branch:

- `phases.md` — verified P70 owns empty-cart coupon input, offers/categories, T&C/details and server-authoritative eligibility.
- `shared/contracts/openapi-notes.md` — verified only a logical Coupons module is named, with no concrete schema.
- `openapi/` — verified no coupons/offers OpenAPI file is present.
- `services/` — verified no dedicated coupon/promotion service contract is present.
- `infra/apim/` — verified no coupons/offers APIM definition is present in the inspected branch.
- `apps/mobile/src/features/cart/domain/cartScreenModel.ts` — verified coupon discount remains `SERVER_CONTRACT_UNAVAILABLE`.
- `apps/mobile/src/features/cart/domain/cartTypes.ts` — verified coupon dependency carries status only.

The mobile CI workflow is not expected to run for P70 because this phase changes documentation/ledger only. The last validated mobile production implementation remains unchanged.

## Handoff

```text
Executed phase: P70 — Coupons/Offers — Empty Cart — BLOCKED
Implemented production screen/API flow: none; exact offers/eligibility/terms contracts are absent
Verified cart savings boundary: coupon discount is SERVER_CONTRACT_UNAVAILABLE
No fabricated content: no sample offers, hardcoded eligibility, invented T&C, bank offers, or client-computed discount
P71 work: NOT STARTED
Next phase: P71 — Coupons/Offers — Active Cart — NOT STARTED
Authorization for P71: NONE
```
