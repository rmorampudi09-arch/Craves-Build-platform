# Exact release launch regression

`Exact release launch regression` is the final combined-source verification gate. It performs no Azure configuration, deployment, merchant call, email delivery or financial transfer. Its database passwords are synthetic values for a disposable GitHub service container. The production one-replica limit is unaffected.

After review and composition of the intended release, run `.github/workflows/launch-regression-ci.yml` on that exact branch/ref with `expectedReleaseSha` set to its full reviewed commit SHA. A mismatch fails before tests. Pull requests test the PR head SHA explicitly. Source, backend, web and final evidence record the same commit, tree, suite-manifest digest, workflow run and attempt. Do not interpret an earlier branch's result as evidence for a later merge commit; rerun the final merged release SHA before activation.

## What runs

- Full Maven `clean verify` for Auth, User/Chef, Catalog, Integration, Order, Subscription and Notification, with tests explicitly enabled and no parallel JUnit execution. Failures are recorded per service; remaining independent modules still run.
- Every conditional database suite is enabled against a dedicated disposable database. A PostGIS 16/3.4 service supplies the existing User/Chef and Catalog migrations. The manifest pins baseline and new launch-critical suites; the checker also discovers test-bearing source files in the exact checkout, so later analytics or limiter tests cannot silently disappear from execution.
- Clean/full-migration, additive-upgrade, source accounting, bank capability, manual settlement, refund uncertainty, email concurrency, Catalog selling eligibility, cart concurrency, authorization, PDF, Academy and existing regression suites must actually execute. All JUnit skips, errors and failures fail this gate. The explicit minima include parameterized case counts where the earlier release required them.
- The existing signed Order→Integration finance source round trip runs after those modules pass. It must produce `PASS`, at least 20 checks and the exact synthetic `338.52` expected net.
- Web `npm ci`, full ESLint, TypeScript, every Vitest test, every Node test and the production build. The two complete test groups are the exact package `test` script with JSON/TAP reporters added; the runner fails if that script changes without updating the adapter. No test file filters are added. Both runners must have zero skipped/failing cases and meet the checked minimum counts.

| Test family | Disposable database |
| --- | --- |
| Ledger, source, bank, manual settlement, cart | `chef_ledger_test` |
| PDF documents and source adapters | `pdf_module_test` |
| Academy | `craves_academy_ci` |
| Existing admin sessions | `craves_admin_session_ci` |
| Existing delivery feedback regression | `delivery_feedback_test` |
| Refund dispatch and upgrades | `craves_refund_test` |
| Canonical email and delivery receipts | `craves_email_test` |
| Catalog selling and finance eligibility | `catalog_finance_test` |
| Auth/User/Chef/Order analytics Explorer | `craves_explorer_test` |

Each database is created on this job's localhost service container. The workflow contains no tunnel, cloud login, production hostname or production credential. External provider contracts use the existing mocks/local HTTP fixtures. This is regression coverage of existing delivery code, not authorization to change or activate a delivery provider.

## Evidence and failure behavior

`scripts/launch/launch-regression.py` writes incremental component summaries and command logs. Timeouts terminate the command's process group so a leftover Maven test JVM cannot race a later module. Missing reports, malformed/duplicate JUnit, removed required suites, insufficient cases, skips, incomplete commands, mismatched SHA/run/manifest and missing connected-source/build evidence all fail closed. Summarizer tests cover these failure paths.

Artifacts retain logs, original JUnit XML, Vitest JSON, Node TAP, database version, PDF examples and connected-source results even on failure. The final `launch-regression-summary.json` is GREEN only when both complete components pass at the same exact source. A failed or interrupted job remains RED or incomplete; it is never inferred successful from compilation alone.

CI web bundles have CI configuration and are validation artifacts only. Use the separately verified active production release pipeline and existing Firebase/payment/document settings to build/deploy the reviewed SHA. Do not deploy the CI bundle.

Passing this workflow establishes automated, disposable test evidence. It does not establish authenticated production APIM routing, effective runtime switches, actual saved tax/consent records, bank funding/permissions, provider response evidence or a live transfer. Those must remain separate in the release report. It does not mark unfinished subscription finance, cumulative compensation/refunds, bank/provider close or statutory exports complete.
