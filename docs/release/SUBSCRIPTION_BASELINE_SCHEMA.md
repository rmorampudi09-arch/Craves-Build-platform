# Subscription baseline schema evidence

The Subscription source explicitly supports the historical `BASELINE` entry at version `1` through `V1_1__subscription_core_baseline_repair.sql`. Its executable bootstrap statements match V1. That forward migration creates missing core objects idempotently before V2–V17. Current application configuration instead uses `baseline-version: 0`, so new automatic baselines do not skip V1. Do not edit either applied migration, change production history, or run Flyway repair to replace the baseline record.

A baseline record has no SQL checksum and must not be compared as if V1 SQL executed. It also does not prove structural equivalence: `CREATE TABLE IF NOT EXISTS` cannot repair an incompatible pre-existing table. Required release evidence is the successful V1.1–V17 checksums plus a structural comparison to the exact reviewed source.

`SubscriptionMigrationDatabaseTest` uses only the explicitly acknowledged disposable GitHub PostgreSQL database `subscription_schema_test`. It exercises clean V1/V1.1/V2–V17 and the historical baseline-1 path, validates both migration histories, preserves synthetic historical data, checks replay applies zero migrations, and compares final catalog manifests. The baseline operation in this test is fixture setup only; it is never an instruction for production.

The launch backend artifact includes `services/subscription-service/target/subscription-schema/clean.json` and `baseline1.json`. These expected manifests must come from successful execution against the reviewed release SHA, never be inferred from a passing compilation or copied from production. The source manifest requires both test cases without skips.

The fixed audit query is `services/subscription-service/src/test/resources/subscription-schema-audit.sql`. An approved operator can execute that exact query through the existing read-only database session with a bounded statement timeout:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog;
-- Execute the exact reviewed subscription-schema-audit.sql SELECT here.
COMMIT;
```

Record the actual database, PostgreSQL major, observation timestamp, release SHA, query SHA-256 and transaction read-only status separately. Compare parsed production JSON to the CI envelope’s `schema` member on the same PostgreSQL major; do not compare pretty-print formatting or object ordering. The query reads PostgreSQL catalogs only, never subscription, payment, personal or document rows. It captures tables/views/partitions, column types/defaults/nullability/collation, constraints and validation state, indexes and readiness, trigger definitions/enabled state, function bodies/security/configuration, row-security policies and sequence definitions. Sequence values and table rows are intentionally excluded. Existing role ownership, ACL grants and extension versions remain separate runtime evidence; this structural comparison does not assert their equivalence.

GREEN requires successful exact-source clean and baseline CI paths, matching applied SQL migration history, and a matching production structural manifest. A missing export, mismatched object, different server major, permission error or timed-out query remains AMBER pending investigation. Do not use the baseline explanation alone to declare database readiness, or declare unfinished Subscription finance complete.
