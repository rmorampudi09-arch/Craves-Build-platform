# Admin explorer release evidence — 14 September 2026

Status: all three backend deployments succeeded. Activation and admin promotion are blocked by an incompatible APIM throttling policy. Explorer remains disabled; the prior admin image is healthy.

## Reviewed source

- Release: `f06d3f64194a0754de2a173b539f46e2270819c0`, merged PR #342.
- Tested PR head: `7107feab1a82f4676ad57e7e1bba9c1ffffe56a1`. All 14 returned applicable PR workflows succeeded, including Explorer, admin dashboard, admin session security, Academy, and backend suites.
- Relevant application, service, explorer-script, policy, and admin-pipeline files are identical between tested head and release merge.
- Local shared-source validation and eight readiness guard tests passed.
- Later main releases are excluded from this scoped promotion.

## Existing production baseline

All four apps were Running, Single revision mode, with matching latest/ready revisions and min/max replicas of 1. Explorer flags were absent, which defaults to disabled.

| Component | Revision | Previous image |
| --- | --- | --- |
| Auth | `0000038` | `craves/auth-service@sha256:a7d0ceb678bca4090f4896972b36fd4dd1b793d7df23ff79d220d3b20e96ac11` |
| User/Chef | `0000045` | `craves/user-chef-service:f0ba9d64ad8ad98ce3a4da2dfac5cc9bcf953d49` |
| Order | `0000084` | `craves/order-service:f0ba9d64ad8ad98ce3a4da2dfac5cc9bcf953d49` |
| Admin | `0000010` | `craves/admin-web:f0ba9d64ad8ad98ce3a4da2dfac5cc9bcf953d49` |

Registry: `cravesprodlowacr82121.azurecr.io`. Auth digest resolved to source tag `1715746c6d2f3e38c59eef9a8bfe41bdd82529ea`; its release source differs only by the explorer module.

Verified immutable rollback digests for the prior `f0ba9d64...` tags:

- User/Chef: `sha256:8f3560035256c951763ae9a04c062d317ba7c1081b34c66f7d75d6a5c6b0511c`.
- Order: `sha256:3eab286172e0ce685d714192b1c547daf904f4f3ee1b13dc581b38dc53be38ff`.
- Admin: `sha256:d2ca7467d82236f90254e6aebfbcb17d74ee06634196649190ab41c1f4a2cbe3`.

## Pipeline evidence

All four pipeline definitions use the existing `Craves-Dev-Service-Connection`.

| Component | Definition | Run | Requested source |
| --- | --- | --- | --- |
| Auth | 2 | 38968 | `f06d3f64194a0754de2a173b539f46e2270819c0` |
| User/Chef | 4 | 38969 | same |
| Order | 6 | 38970 | same |
| Admin | 33 | not started | same planned source |

Automatic approval review blocked an early attempt to queue admin production before backend, migration, and route prerequisites completed. No admin run was created by that attempt. Complete those prerequisites before retrying.

## Database evidence

Configured database identities were verified as `craves_auth_db` and `craves_business_db`. Only existing datasource credential references were resolved; no credential values were printed or persisted in this report.

Predeployment source counts: Auth identities 25; chef applications 9; chef-specific orders 111. These are database baselines, not authenticated Explorer API acceptance.

Existing role assignments: 7 `PLATFORM_ADMIN`, 7 `AUDIT_ADMIN` (assignment counts can refer to the same people). No role grants or account mutations were made.

Initial Flyway versions: Auth V8, User/Chef V10, Order V25. Explorer audit migrations V9/V11/V26 were absent at baseline.

Auth run 38968 succeeded. Revision `0000039` became Healthy/Provisioned with 100% traffic. V9 is now applied successfully, with `admin_explorer_audit_no_edit` and `admin_explorer_audit_no_truncate` both enabled (`O`). Source count remains 25.

Auth runtime preservation: before/after configuration hashes both equal `ad39ba30f33d4d63ed1c0bada0289f77cd585900117686641982dbd0a3f35f5b`; one actual replica. Release image digest: `sha256:1d98baf7ce10297729b03bdb6b4b14c6b81d8f1556d83b83d80ffa52fe7fad0d`. Runtime digest pinning is deferred to the approved flag activation so that both changes use one revision.

User/Chef run 38969 succeeded. Revision `0000046` is latest and ready. V11 is applied successfully; both audit guards are enabled. Source count remains 9. Before/after configuration hashes both equal `53bc62d53ef3d69459d5eecdf04b9e45bf9bcc491e903dc770c493e215b8f001`; one actual replica.

User/Chef release digest: `sha256:ea5ea4d21c19f1c418531fc872abc9c836b8930f2a508e5494a993e16d0dc75c`.

Order run 38970 succeeded. Revision `0000085` is latest and ready. V26 is applied successfully; both audit guards are enabled. Before/after configuration hashes both equal `eafd32a35344df7056e9f2ef2322425d5825aff9b15d5f1cbd0fbc7057d1600d`; one actual replica. Order source count was 112 at this later check, up from the initial 111. This is a live database; compare API/chart/list counts under matching filters and creation cutoffs rather than assuming the initial count remains fixed.

Existing admin origin verified: HTTPS `apim-craves-prodlow-l3ing6.azure-api.net/api/v1`, not secret-referenced; `CRAVES_ADMIN_PORTAL=true`.

Both reviewed index scripts were run outside a transaction with the matching `expected_database` argument. All six indexes were confirmed valid and their definitions matched the reviewed columns and descending ordering:

- `ix_explorer_auth_created_id`, `ix_explorer_auth_status_created_id`.
- `ix_explorer_chef_created_id`, `ix_explorer_chef_status_created_id`.
- `order_schema.ix_explorer_order_created_id`, `order_schema.ix_explorer_order_status_created_id`.

Existing database login `cravesadmin` is not a superuser but has create-role/create-database privileges. Append-only triggers do not prevent privileged DDL changes; no privilege or retention-policy changes are included in this release.

## Remaining evidence

- Runtime digest pinning during the later approved activation. Backend runs, audit migrations/guards, preservation hashes, and actual replica checks are complete.
- Complete APIM route/policy inventory, backups, three reviewed operations, and anonymous denial.
- Explicit explorer activation and matching admin promotion.
- Authenticated counts, chart/list agreement, paging, masking, denial, session renewal, query timings, and rollback readiness.

The existing owner browser session successfully opened the current admin overview. Its current analytics route returned 404. No owner cookies or tokens were extracted.

## Confirmed production blocker and safe state

The APIM instance is on the Consumption tier. Azure rejected the reviewed operation policy with:

> Policy is not allowed in 'Consumption' sku

The rejected element was `rate-limit-by-key`. The deployment script had created the new module API and its sole `post-explorer-users-query` operation before the policy rejection. Baseline inventory proved the API did not previously exist; a subsequent inventory proved the only operation was the one created by this attempt. That incomplete module API was removed. A final inventory returned no `craves-admin-explorer-v1` API. Existing APIs were not modified.

All three explorer flags remain absent/default-false. Admin still runs the previous `f0ba9d64...` image on ready revision `0000010`, with min/max replicas 1. An authenticated browser check successfully reopened its existing overview without an alert.

Microsoft's [keyed throttling reference](https://learn.microsoft.com/en-us/azure/api-management/rate-limit-by-key-policy) excludes Consumption. Its [subscription throttling reference](https://learn.microsoft.com/en-us/azure/api-management/rate-limit-policy) says ordinary `rate-limit` applies only when a subscription key is supplied. These explorer routes deliberately require no subscription key, so that substitution would silently remove effective throttling. `quota-by-key` also excludes Consumption. No APIM tier, secret, DNS, mobile, or replica changes were made.

## Prepared safeguard

The local patch now checks the APIM SKU before any route mutation and before admin readiness verification. Consumption and an unavailable SKU fail closed with a specific explanation. All ten readiness/command-fixture tests passed, including the production incompatibility regression, along with shell syntax and diff checks. This safeguard is prepared locally; it is not a compatible replacement limiter and has not been published or deployed.

## Original alternative proposed for release review (now implemented; validation pending)

This is a proposed behavior change, not an implemented or approved release:

1. Use a dedicated request-counter table in each service's existing owning PostgreSQL database/schema. Do not reuse or mutate the append-only access audit. Allocate new Flyway versions only after refreshing current main and checking collisions.
2. Enforce a shared budget of **20 admitted Explorer reads per rolling 60 seconds per dataset/service**, across all administrators and entry points. This bounds the combined three-dataset workload to 60 admitted reads per rolling minute. A single dataset would be limited to 20 rather than the originally reviewed 60 per source IP; this reduction needs explicit review.
3. After authentication, role verification, activation, and query validation, use a short separate transaction with a database advisory lock, database time, expiry cleanup on the counter table, and atomic check/insert. Commit admission before the report query, so report failures still count. Counter failure must fail closed; existing two-query concurrency and SQL/transaction limits remain.
4. Use a nonblocking lock or a bounded lock timeout, return a meaningful 429 and Retry-After for exhausted capacity, and never store contacts, credentials, request bodies, or audit purposes in the limiter.
5. Remove the unsupported APIM element only in the same reviewed release that enforces the backend limit. Preserve Bearer forwarding, role/session checks, body size limits, exact routing, and no-store. Update the runtime policy comparator and source-linked readiness evidence to the new reviewed policy; do not bypass existing checks.
6. Require PostgreSQL concurrency/overflow/expiry/failure tests across all three bindings, refreshed applicable CI, reviewed source reconciliation, and a new exact release SHA. Deploy disabled, verify new migrations and enforcement, then repeat route, flag, digest, and admin gates.

No existing Redis connection was found in the captured service configuration, so a Redis implementation would not meet the existing-configuration constraint without additional setup. The PostgreSQL option reuses current database connections, requires no new secrets or Azure resources, and retains one-replica limits. Normal database usage charges still apply.

The user subsequently requested activation. The compatibility implementation is now prepared on current main, with the proposed 20-per-dataset budget; source review, CI and production gates remain required. Authenticated Explorer counts, chart/list agreement, pagination, wrong-role denial, and renewal remain pending because activation and admin promotion have not occurred.

## Compatibility implementation follow-up

The isolated activation branch is based on main `7e9ac18ed5b59a76197f2a2879553f7daaa261e4`.
New Flyway allocations are Auth V12, User/Chef V13 and Order V27; existing migrations
are unchanged. The limiter uses nonblocking PostgreSQL transaction advisory locks,
READ COMMITTED database-time admission in REQUIRES_NEW, a separate counter table,
and a 20-request rolling-minute dataset budget. The frontend propagates only bounded
Retry-After seconds. CI must run the eight new real PostgreSQL scenarios on all three
service bindings without skips, plus existing report, authorization and web suites.
Runtime was refreshed before implementation: all four app images/revisions and disabled
flags still match the safe state above. No production mutation was made by this follow-up.
