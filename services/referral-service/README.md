# Craves referral service — local setup and verification

Java 21 / Spring Boot 3 / Maven / PostgreSQL. This standalone addition implements the supplied Chef Referral Rewards Program v2.0. It is not connected to live Auth, Order, checkout or Finance, and the web/native components are not mounted. All execution and member/admin public-access flags default OFF. Nothing in this README authorises a merge, production migration, deployment or payment.

A Maven build compiles the Java files and runs automated checks. PostgreSQL is required because these tests verify actual transactions, constraints and concurrent money operations; an in-memory database is not an equivalent test. Docker below starts a temporary local database only. The service's database migrations are separate from normal application startup.

## Prerequisites

Use a reviewed checkout of `rmorampudi09-arch/Craves-Build-platform`, branch `feat/chef-referral-v2-20260915`, with Java 21, Maven, Python 3 and a running Docker engine. Run the examples from the repository root in Bash (Linux, macOS or Windows WSL). An add-only ZIP does not contain the existing web/mobile manifests; run their checks from the full reviewed repository checkout, not from an empty folder containing only additions.

Before testing, confirm `git rev-parse HEAD` equals the intended review SHA. Do not switch a working directory containing unsaved changes or extract an older ZIP over newer source. The add-only guard requires the original baseline commit in the local Git history.

## Local PostgreSQL tests — disposable data only

**Warning:** `TestDatabase.reset()` drops and recreates `referral_schema` for each test fixture. Never use a production database, production credentials or a localhost tunnel to a remote database. The password below is deliberately public and suitable only for the temporary, loopback-bound test container.

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
  echo "Local disposable PostgreSQL did not become ready." >&2
  exit 1
fi

export REFERRAL_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:15432/referral_test
export REFERRAL_TEST_DB_USER=referral_test
export REFERRAL_TEST_DB_PASSWORD=disposable_referral_test_only
export REFERRAL_TEST_CONFIRM=YES_DISPOSABLE_REFERRAL_TEST_ONLY
python3 scripts/referrals/verify-additive.py
mvn -B -ntp -f services/referral-service/pom.xml clean verify
```

The explicit container name prevents replacing another database container. The shell trap stops only the temporary container started by this example. Port 15432 must be free. At this checkpoint the focused Java suite contains 12 unit tests and 19 PostgreSQL integration tests; use the final-head XML evidence to verify actual counts and no skips. The module CI separately exercises the standalone migrator twice against its disposable database.

## Build outputs and the resumed CI fix

The runnable archive is `services/referral-service/target/referral-service-0.1.0-SNAPSHOT.jar`. Its manifest must start `in.craves.referral.ReferralApplication` through Spring Boot's `JarLauncher`, and its nested runtime dependencies and all seven referral SQL migration resources must be present.

CycloneDX runs in `prepare-package`, before the JAR is created. The dependency inventory is:

```text
services/referral-service/target/classes/META-INF/sbom/application.cdx.json
```

The executable JAR contains that same inventory at:

```text
BOOT-INF/classes/META-INF/sbom/application.cdx.json
```

CI checks those bytes are identical and records JAR/SBOM SHA-256 values in `target/artifact-verification.json`. The previous CI failure looked for `target/bom.json`, which was not the generated Spring Boot inventory path. Do not create an empty placeholder inventory or skip the gate. The inventory identifies dependencies; it is not a vulnerability-clearance report.

## Runtime environment — no secret values in chat or Git

| Key | Purpose / handling |
| --- | --- |
| `REFERRAL_DB_URL`, `REFERRAL_DB_USER`, `REFERRAL_DB_PASSWORD` | Runtime datasource for the isolated referral schema. Use a restricted role, not a migration owner or superuser. Remote PostgreSQL must use reviewed TLS/hostname verification. |
| `REFERRAL_DB_POOL_SIZE` | Defaults to 8 connections. Review the total database connection budget before increasing replicas. |
| `CRAVES_JWT_VERIFICATION_PEM_BASE64` | Base64-encoded existing Auth RSA public verification PEM. Never supply Auth's private signing key. |
| `CRAVES_JWT_ISSUER`, `CRAVES_JWT_AUDIENCE` | Must exactly match the existing reviewed Auth token contract. |
| `SPRING_DATA_REDIS_HOST`, `SPRING_DATA_REDIS_PORT`, `SPRING_DATA_REDIS_USERNAME`, `SPRING_DATA_REDIS_PASSWORD`, `SPRING_DATA_REDIS_SSL_ENABLED` | Existing Auth revocation projection connection. Review actual TLS, key, token-version and absent-key semantics before connecting private APIs. |
| `CRAVES_REFERRALS_AUTH_HMAC_BASE64`, `CRAVES_REFERRALS_ORDER_HMAC_BASE64`, `CRAVES_REFERRALS_FINANCE_HMAC_BASE64` | Three distinct source-signing keys, each at least 32 decoded bytes; inject through approved secret storage. |
| `CRAVES_REFERRALS_PREVIOUS_AUTH_HMAC_BASE64`, `CRAVES_REFERRALS_PREVIOUS_ORDER_HMAC_BASE64`, `CRAVES_REFERRALS_PREVIOUS_FINANCE_HMAC_BASE64` | Optional previous keys for a separately approved rotation window. |
| `CRAVES_REFERRALS_PUBLIC_ORIGIN` | Invitation origin; defaults to `https://craves.in`. |
| `CRAVES_REFERRALS_CASHOUT_MINIMUM_PAISE`, `CRAVES_REFERRALS_ANNUAL_KYC_THRESHOLD_PAISE`, `CRAVES_REFERRALS_LIFETIME_REVIEW_PAISE` | Finance/product-reviewed limits. Zero defaults are not approved legal thresholds. Do not invent values. |

Keep these seven flags false until their separate acceptance gates pass: `CRAVES_REFERRALS_ENABLED`, `CRAVES_REFERRALS_PUBLIC_ACCESS_ENABLED`, `CRAVES_REFERRALS_WORKERS_ENABLED`, `CRAVES_REFERRALS_AWARDS_ENABLED`, `CRAVES_REFERRALS_SETTLEMENT_ENABLED`, `CRAVES_REFERRALS_WITHDRAWALS_ENABLED`, `CRAVES_REFERRALS_SPENDING_ENABLED`.

Migration-only keys are **different**: `REFERRAL_MIGRATION_DB_URL`, `REFERRAL_MIGRATION_DB_USER`, `REFERRAL_MIGRATION_DB_PASSWORD`, and `REFERRAL_MIGRATION_CONFIRM=CREATE_REFERRAL_SCHEMA_ONLY`. See the complete command and safeguards in `docs/referrals/INTEGRATION_RUNBOOK.md`. History is `referral_schema.referral_flyway_history`. Normal Spring Flyway auto-migration is disabled.

## Start locally without activation

In a separate local terminal, after preparing a local runtime database/schema and injecting its runtime environment, keep all flags OFF and run:

```bash
java -jar services/referral-service/target/referral-service-0.1.0-SNAPSHOT.jar
```

Check `http://localhost:8080/actuator/health/liveness`. A liveness response does not prove database/Redis readiness, compatible authentication, financial correctness or production integration. With flags off or no verification key, member/admin requests must not expose usable private data. Do not enable rewards simply to remove a disabled response. The Dockerfile also packages this service, but Docker packaging is not a substitute for the preceding tests or an image security scan.

## Related client checks

From the full reviewed repository checkout, run the existing dependency installs without modifying their lockfiles:

```bash
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

The focused native typecheck is not a whole-mobile-application build. Neither command mounts a route, publishes an app-store binary, deploys Azure or tests a real payout. Native device, browser-interaction, identity-switch and deep-link acceptance remain separate work.

## Manual steps required before release

- [ ] Resolve the existing mobile-consolidation workflow's mobile-only scope rule through a separately approved maintainer change or PR split; do not disable required checks or edit baseline workflows in this add-only delivery.
- [ ] Connect the actual Auth, Order, Finance and checkout owners and mount the existing authenticated web/native slots. These are remaining engineering changes, not just entering credentials.
- [ ] Obtain actual legal, terms, tax, privacy, funding, mixed-chef allocation and payout review references, and independently approve a future policy revision.
- [ ] Confirm Azure hosting/cost approval, isolated resource name, restricted database roles, backups/restore, private networking, Key Vault references and staged rollout. The included dormant Container App template is an option, not an executed or implicitly authorised hosting decision.
- [ ] Complete staged acceptance and retain exact source SHA, image digest, migration, reconciliation, recovery, security and performance evidence before public activation.

Existing Azure DevOps service connection, when a separately approved Azure DevOps release needs it: `Craves-Dev-Service-Connection`. The new referral workflow uses GitHub Actions for **build/test only**, has no Azure login/deployment step and needs no production Azure credentials. A deployment pipeline and its guarded release parameters remain to be reviewed; this README does not standardise a different release tool or provision paid resources.

## Documentation

Start with `docs/referrals/README.md`, then `ARCHITECTURE.md`, `INTEGRATION_RUNBOOK.md`, `ACCEPTANCE.md`, and `OPERATIONS.md`. `deploy/README.md` describes the dormant template. Check the final delivery evidence before using an older checkpoint mentioned in those documents. The original specification's build approval is not proof that its separate pre-launch compliance gates have been completed.
