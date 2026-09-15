# Device cart repair — controlled release

## Scope

Physical-phone Reorder failed because the installed app uses three conditional cart endpoints absent from the live Order service and APIM. This release adds conditional clear, atomic kitchen switch and conditional reorder, retaining exact cart consent across concurrent edits. It does not create orders, change pricing or launch new payment behavior.

The live service runs referral commit `151c36cb2afaaf7b8482ee784704d983f7d87324`, not current `main`. Its referral Java files, checkout DTO compatibility and V28–V32 migrations are restored unchanged. `scripts/release/device-cart-live-contract.json` records the live Git blob identities. CI refuses changed or additional migrations. Earlier local durable-checkout migrations are deliberately excluded because their V24 name conflicts with deployed financial history.

## Files

- `services/order-service/src/main/java/in/craves/order/service/CartSafetyPolicy.java`: exact cart ID, line, quantity and revision consent; one kitchen.
- `services/order-service/src/main/java/in/craves/order/service/OrderService.java`: row-locked conditional operations with transaction rollback on unavailable/changed target.
- `services/order-service/src/main/java/in/craves/order/web/ApiDtos.java` and `CartController.java`: validated request contracts and authenticated routes.
- `services/order-service/src/test/java/in/craves/order/service/CartConcurrencyDatabaseTest.java`: ownership, simultaneous adds, bounds, conditional clear/switch/reorder and rollback against PostgreSQL.
- `scripts/apim/device-safe-cart-routes.py`: plan-first, exact-image/healthy-runtime gateway checks; adds only three operations; preserves existing security and routes.
- `pipelines/device-cart-release-steps.yml`: Java 21 tests with disposable PostgreSQL 16, immutable image, existing runtime-preserving deployment and guarded gateway publication.

## Local tests

Set `JAVA_HOME` to Java 21 and run `mvn -B -ntp test` from `services/order-service` for unit tests. Database integration tests require an explicitly disposable database: `LEDGER_TEST_JDBC_URL=jdbc:postgresql://localhost:<port>/chef_ledger_test`, `LEDGER_TEST_DB_USER`, `LEDGER_TEST_DB_PASSWORD`, and `CRAVES_DISPOSABLE_TEST_DATABASE=true`. These tests drop only the test Order schema; never point them at a shared or live database.

Recorded local result: 208 tests, 179 executed, 29 skipped, zero failures/errors. Gateway guard tests: eight passed after the XML-format correction. Mobile final suite: 261 suites / 2,687 tests passed. These results do not replace authenticated phone acceptance.

## Azure/manual steps

The existing audit pipeline 122 can select this branch's `azure-pipelines-email-readiness-status.yml`. Default `inspect` performs reads only. Explicit `release-cart` runs the controlled release. No global pipeline default branch, access permissions, paid resources, secrets, DNS, payment settings or store credentials are changed. Existing service connection `Craves-Dev-Service-Connection` is required; never paste its credential values into chat.

The release refuses a concurrent rollout or changed previous image. A failed/unhealthy deployment uses the existing helper's rollback. Inconclusive Azure readiness stops gateway publication and requires inspection; do not repeatedly submit image changes. Raw service logs are withheld from release output to avoid leaking customer/credential data.

## Phone acceptance after deployment

1. Reorder a delivered order into an empty cart; verify current prices and quantities, without paying.
2. Add another dish from the same kitchen.
3. Try another kitchen: both kitchen names and clearing explanation must appear; Cancel preserves the cart.
4. With explicit cart-clear approval, verify atomic switch and empty cart recovery.
5. Confirm rejected writes explain their actual outcome while ambiguous/time-out writes still require cart review.

## Pending

Run39059 deployed immutable image `device-cart-e1cf04e0537e2eaf32f1c494142dd52a3e3bafa0`, preserving runtime hashes and passing liveness/readiness. Gateway publication stopped on a strict policy readback mismatch. Read-only39060 isolated encoded expression attributes; generated XML had been supplied as rawxml. Gateway-only39061 at `a26315a93a201ae29a26a39be8ce15eca733f044` completed all three routes, readback and anonymous authentication checks. No further service image change was needed. The [official policy API](https://learn.microsoft.com/en-us/rest/api/apimanagement/api-operation-policy/get?view=rest-apimanagement-2024-05-01) distinguishes XML and non-XML-encoded rawxml content. Existing rules were not weakened or replaced.

Physical Add from Favorites now succeeded, and Cart displayed two sambar portions at the authoritative ₹690 subtotal. The earlier small error screenshot was not reliably legible; do not preserve its initial kitchen-inactive interpretation as a diagnosis. No chef data changed. Safe clear/switch/reorder phone retests remain pending specific cart-clear consent. The new mobile APK upgrade is paused at the phone's Play Protect security prompt; the user must handle that prompt.

Durable checkout recovery and 15-minute payment retry remain separate work; do not claim this cart-only release implements them. No production order, payment, enrollment, refund, cancellation, support message or review was created by this acceptance pass.
