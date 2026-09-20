# Craves referral service — pre-integration build and local verification

Standalone Java 21 / Spring Boot 3 / Maven / PostgreSQL implementation of the supplied Chef Referral Rewards Program v2.0. Start with [the current pre-integration hardening record](../../docs/referrals/PREINTEGRATION_HARDENING.md), which supersedes older descriptions of absent Redis entries, capture helpers and test counts.

The branch is `feat/chef-referral-v2-20260915`, draft PR #357. The protected platform baseline is `870f5293884888aa28f0c069b91a86d06492c9a2`. No existing platform route, dependency manifest/lockfile, migration or running service is changed. The referral module is not connected to live Auth, Order, Finance or checkout, and its new client components are unmounted. No merge, deployment, programme activation or provider payment is authorised by this README.

A Maven build compiles Java and runs tests. These database tests require actual PostgreSQL transactions and constraints, not an in-memory substitute. The client contract gate then checks real HTTP responses exported by the Java tests against the web's Zod schemas. A green build is not a guarantee of perfect software or external integration acceptance.

## Prerequisites

Use a full checkout of the intended review SHA with Java 21, Maven, Python 3, Node 24 and a running Docker engine. These commands are Bash/Linux/macOS/Windows WSL commands, run initially from the repository root. The additions ZIP does not contain protected baseline web/mobile manifests and cannot replace a full repository checkout. Do not overwrite newer work or switch a dirty working directory. Confirm `git rev-parse HEAD` before testing.

## Complete local test sequence — disposable database only

**Warning:** the integration fixture drops and recreates `referral_schema`. Never supply production credentials, a production database or a localhost tunnel to production. The following public password is valid only for this temporary loopback-bound test container. Port 15432 must be free; the unique name prevents replacing an existing container.

```bash
set -Eeuo pipefail
TEST_CONTAINER="craves-referral-test-$(date +%s)-$$"
docker run --rm -d --name "$TEST_CONTAINER" \
  -p 127.0.0.1:15432:5432 \
  -e POSTGRES_DB=referral_test \
  -e POSTGRES_USER=referral_test \
  -e POSTGRES_PASSWORD=disposable_referral_test_only \
  postgres:16
trap 'docker stop "$TEST_CONTAINER" >/dev/null 2>&1 || true' EXIT
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$TEST_CONTAINER" pg_isready -U referral_test -d referral_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "Disposable PostgreSQL did not become ready." >&2
  exit 1
fi
export REFERRAL_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:15432/referral_test
export REFERRAL_TEST_DB_USER=referral_test
export REFERRAL_TEST_DB_PASSWORD=disposable_referral_test_only
export REFERRAL_TEST_CONFIRM=YES_DISPOSABLE_REFERRAL_TEST_ONLY
python3 scripts/referrals/verify-additive.py
mvn -B -ntp -f services/referral-service/pom.xml clean verify
python3 scripts/referrals/verify-build.py

# Required: the dedicated web suite consumes these actual Java HTTP responses.
export REFERRAL_WIRE_FIXTURE_DIR="$PWD/services/referral-service/target/contract-fixtures"
cd apps/customer-web-next
npm ci
npm run lint
npm run typecheck
npx vitest run --config ../../scripts/referrals/web-vitest.config.mts
npm test
npm run build
cd ../mobile
npm ci
npx tsc --project ../../scripts/referrals/mobile-tsconfig.json --noEmit
npm test -- --runInBand --runTestsByPath src/features/referralsV2/model.test.ts
npm run test:integration
```

The shell trap stops only the temporary container created by this example. The backend gate requires at least 18 unit tests and 35 integration tests, including six actual loopback-HTTP cases and ten fault/concurrency cases, with no failures/errors/skips. Redis is mocked in those HTTP tests; the database, service, HTTP transport and RSA/HMAC filters are real within the disposable test environment. Production Auth/Order/Finance and payment providers are not called. Use the final-head XML/JSON to establish actual results.

The focused web suite includes five backend response-fixture checks, invitation capture, BFF, exact-money, operation recovery and rendering tests. `REFERRAL_WIRE_FIXTURE_DIR` must point to the Java output above or a verified same-SHA backend artifact. Missing fixtures fail rather than skip the gate. Native checks cover the isolated feature and selected existing regressions, not physical devices or the whole native release pipeline.

## Build outputs

| Path below `services/referral-service/target/` | Meaning |
| --- | --- |
| `referral-service-0.1.0-SNAPSHOT.jar` | Executable Spring Boot application; main class `in.craves.referral.ReferralApplication`, nested dependencies and all seven isolated migrations. |
| `classes/META-INF/sbom/application.cdx.json` | Generated CycloneDX dependency inventory. It is packaged at the archive-root path `META-INF/sbom/application.cdx.json`, not under BOOT-INF/classes. |
| `artifact-verification.json` | Executed test counts, named suites, source SHA, HTTP-fixture hashes and JAR/SBOM hashes. |
| `contract-fixtures/*.json` | Actual synthetic HTTP responses for the same-SHA web schema gate; no JWT/private key/HMAC is exported. |
| `container-verification.json` | CI-only dormant image smoke receipt: image ID, non-root user, read-only root, loopback binding, liveness and disabled member endpoint. |

The Docker smoke check builds the actual Dockerfile and runs a temporary container only on the GitHub CI runner. It performs no registry push, Azure login or deployment and uses no real credentials. `smoke-container.py` refuses invocation outside its explicit CI/disposable-test guard. A dependency inventory or successful image startup is not a vulnerability-clearance report or production network/readiness acceptance.

## Runtime environment and secret placement

Inject secret values through the approved Key Vault/container secret references or a private local environment. Never paste values into chat, source files, CI logs or the evidence PDF.

| Key | Purpose |
| --- | --- |
| `REFERRAL_DB_URL`, `REFERRAL_DB_USER`, `REFERRAL_DB_PASSWORD` | Restricted runtime datasource for the isolated schema. Remote PostgreSQL requires reviewed TLS/hostname verification; never use a migration owner or superuser as runtime. |
| `REFERRAL_DB_POOL_SIZE` | Defaults to eight connections. Account for all replicas before changing the database budget. |
| `CRAVES_JWT_VERIFICATION_PEM_BASE64` | Existing Auth RSA **public** verification PEM, base64-encoded; never Auth's private signing key. |
| `CRAVES_JWT_ISSUER`, `CRAVES_JWT_AUDIENCE` | Exact existing Auth contract values. |
| `SPRING_DATA_REDIS_HOST`, `SPRING_DATA_REDIS_PORT`, `SPRING_DATA_REDIS_USERNAME`, `SPRING_DATA_REDIS_PASSWORD`, `SPRING_DATA_REDIS_SSL_ENABLED` | Reviewed TLS connection to the actual Auth revocation projection. Validate namespace, publisher, token-version and TTL/recovery semantics. |
| `CRAVES_REFERRALS_REVOCATION_ABSENCE_CONTRACT_CONFIRMED` | Defaults **false**. Missing Redis projection then blocks with 503. Set true only after the Auth absence/TTL contract is explicitly accepted; errors/malformed state still block. |
| `CRAVES_REFERRALS_AUTH_HMAC_BASE64`, `CRAVES_REFERRALS_ORDER_HMAC_BASE64`, `CRAVES_REFERRALS_FINANCE_HMAC_BASE64` | Three distinct source-signing keys, each at least 32 decoded bytes. Cross-source reuse is refused. |
| `CRAVES_REFERRALS_PREVIOUS_AUTH_HMAC_BASE64`, `CRAVES_REFERRALS_PREVIOUS_ORDER_HMAC_BASE64`, `CRAVES_REFERRALS_PREVIOUS_FINANCE_HMAC_BASE64` | Optional previous keys for a separately reviewed rotation window; still distinct across sources. |
| `CRAVES_REFERRALS_PUBLIC_ORIGIN` | Approved invitation origin, default `https://craves.in`. |
| `CRAVES_REFERRALS_CASHOUT_MINIMUM_PAISE`, `CRAVES_REFERRALS_ANNUAL_KYC_THRESHOLD_PAISE`, `CRAVES_REFERRALS_LIFETIME_REVIEW_PAISE` | Real product/Finance-assessed limits; zero defaults are not approved legal thresholds. |

Keep `CRAVES_REFERRALS_ENABLED`, `CRAVES_REFERRALS_PUBLIC_ACCESS_ENABLED`, `CRAVES_REFERRALS_WORKERS_ENABLED`, `CRAVES_REFERRALS_AWARDS_ENABLED`, `CRAVES_REFERRALS_SETTLEMENT_ENABLED`, `CRAVES_REFERRALS_WITHDRAWALS_ENABLED` and `CRAVES_REFERRALS_SPENDING_ENABLED` false until their separate gates pass. No production values were set here.

Migration-only keys differ from runtime: `REFERRAL_MIGRATION_DB_URL`, `REFERRAL_MIGRATION_DB_USER`, `REFERRAL_MIGRATION_DB_PASSWORD`, and `REFERRAL_MIGRATION_CONFIRM=CREATE_REFERRAL_SCHEMA_ONLY`. The exact standalone command is in [INTEGRATION_RUNBOOK.md](../../docs/referrals/INTEGRATION_RUNBOOK.md). History is `referral_schema.referral_flyway_history`; normal application startup does not run Flyway.

## Start a local dormant instance

After preparing an isolated local runtime schema and injecting its restricted runtime environment, leave all flags off and run:

```bash
java -jar services/referral-service/target/referral-service-0.1.0-SNAPSHOT.jar
```

Check `http://localhost:8080/actuator/health/liveness`. Liveness is not proof of external dependencies, policy approval or finance correctness. Disabled processing must not be changed simply to remove a disabled response. Public/member APIs remain unavailable until the separate programme and authentication gates are accepted.

## Integration inputs, not deferred engine repairs

The hardening record identifies defects repaired before integration: signup races, code collision handling, stale claim authority, trailing JSON, source-key reuse, missing revocation state, double-click submission and uncertain retry identity. It also supplies the unmounted invitation route factory and the signup-boundary reader. Connecting them still requires the existing owner session verifier, authoritative active-code lookup, signup transaction/outbox, Order/Finance facts, checkout reserve/consume/refund calls, gateway routes and native app links. Those owners must preserve the documented original event/operation IDs and source money snapshots.

No current route is mounted automatically. The proposed 30-day pre-signup attribution window requires explicit product/privacy approval. An existing account cannot be re-parented. Browser-cookie capture does not by itself provide cross-device or post-install attribution. The later integration change must test these real connections in a controlled environment before public release; module defects found there remain engineering work, not a request for the user to rewrite the engine alone.

## Manual steps required before any release

Chef referral cap decision confirmed by the owner on 2026-09-17: each receiving chef
can earn at most INR 1,500 per India calendar posting month. A crossing reward earns
only the remaining allowance; after exhaustion it earns zero. Excess is not a
pending balance, is not shown to the chef, and never carries forward. Internal
immutable cap decisions prevent duplicate processing or resurrection next month.
Refund reversals restore only the actual credited amount in its original month;
skipped rewards do not revive. The member response exposes remaining allowance
and whether the cap is reached, not an excess/review balance. Production activation
and verified withdrawable-earnings integration remain separate release gates.

- [ ] Resolve the existing mobile-consolidation workflow's cross-stack scope failure by a separately approved maintainer correction or appropriate PR split. Do not bypass checks or alter baseline workflows here.
- [ ] Approve actual legal, terms, privacy, tax, KYC, funding, mixed-chef allocation, retention and payout evidence; independently approve a future policy revision.
- [ ] Confirm hosting choice and cost approval, isolated resource name, restricted database roles, backups/restore, private networking and Key Vault references. The dormant Container App template is an option, not an executed or approved hosting decision.
- [ ] Accept the real source/session/checkout/provider connections, dependency/image security assessment, browser/device behaviour and measured load/recovery before activation.

The established Azure DevOps service connection remains `Craves-Dev-Service-Connection`. The new GitHub workflow is build/test only and requires no production Azure credentials. A deployment pipeline/hosting decision still needs its own approval. No seven-service release, live payment or Azure resource creation was performed.
