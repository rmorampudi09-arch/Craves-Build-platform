# Guarded production Auth protection

## Scope and implementation

`pipelines/auth-protection-release-steps.yml` runs from the existing inspection pipeline only when `release-auth-protection` is selected. Supply the exact current main SHA and its successful full launch-regression run ID. The default values do not authorize a release. The pipeline verifies all four exact-version jobs and the aggregate artifact before building and again immediately before activation; it checks applied migration checksums without repair. No new cloud resources or credentials are created.

`scripts/release/release-auth-protection.py` updates only the existing Auth image and ten reviewed protection settings. It preserves the full remaining runtime configuration, identity, ingress, secret references, existing one-replica bounds and other flags. Image source label, immutable registry digest and local build image ID are verified by the existing release helpers. Unrecognized Spring/JVM overrides stop the release.

Configured limits: PostgreSQL mode, enabled, 60-second fixed windows, 6 concurrent requests per replica, 120 exchange and 300 refresh requests globally per window, 10 per credential, 30 per known refresh identity, 5-second idle reads and 10-second total body read budget. These are protections for the existing low-capacity deployment, not proof of million-user capacity. The shared database connection pool can add wait time; a three-second SQL query limit is not a three-second end-to-end outage guarantee.

## Acceptance and failure behavior

The script requires one healthy active ready revision, one actually started/ready container and 100% traffic. It performs exactly two malformed request probes followed by at most eleven requests using one randomly generated impossible refresh token. It never sends a Firebase credential, SMS, email, payment or order request. Expected results are private 400 responses, ten private 401 denials and a private 429 with Retry-After between 1 and 60 seconds. A crossed time window or unexpected response stops acceptance without restarting the test or increasing request volume.

No automatic security-disable recovery exists. Azure Single revision mode retains the previous ready version while a candidate is unhealthy. If the candidate becomes ready but fails acceptance, inspect its current configuration and logs through the existing operational process, then correct the protected image. Do not turn protection off merely to make a release pass. A successful synthetic check is not normal sign-in acceptance: an owner-controlled genuine sign-in/refresh must still be checked separately.

## Tests and manual steps

Run `python3 -m unittest discover -s scripts/release/tests -p 'test_auth_activation.py' -v` locally. The full launch CI also runs the existing real-PostgreSQL limiter, HTTP filter, strict route/body and Tomcat timeout suites without allowing required-suite skips.

- Merge through the existing protected pull-request process; wait for exact-main full regression.
- Run the existing Azure pipeline with `release-auth-protection`, that source SHA and full regression run ID. Its existing service connection supplies Azure access; no values should be pasted into chat.
- Confirm the redacted protected receipt and genuine owner-controlled sign-in.
- Observe ordinary traffic and error rates. Gateway-level throttling, load testing, database outage rehearsal and public-launch acceptance are separate evidence; this release does not claim them complete.

Read-only gateway inspection 39109 on source `1539ebc8661df401d22820e8d188010801658655` found no direct unconditional rate limits in the two Auth operation, API and global inbound inheritance chains. It changed no policies. XML hashes: API `93911877d8aac14ae478dfb0a3291fcc97f1b5f8fb9b337e2d0d8f3e23f22d84`, global `8e678113f285cd7bef4e758a8f7d3ca893310d891d6301e791b0537132fbedc5`. This is not a complete product/workspace policy execution proof.

Azure environment updates create a revision; see [Microsoft's environment-variable documentation](https://learn.microsoft.com/en-us/azure/container-apps/environment-variables).

## Asynchronous update recovery

Azure run 39117 built and verified source `2ab2e36d30276a039121529656b8c24e6fecdd64` against successful exact-main regression 35131529167. It requested immutable Auth image `cravesprodlowacr82121.azurecr.io/craves/auth-service@sha256:58406225368594ac39a606e3fc38d01fc60be53100cef1721c2416b7e2b620e7`. The first immediate settings read after the asynchronous update did not match, so acceptance stopped. This run remains FAILED; it is not a protected-runtime receipt. The update may finish independently of the client checker. Do not repeat a mutation to discover its outcome.

The updated checker waits at most 60 observations with five-second intervals. During propagation it tolerates only the exact original desired template, with all unrelated configuration unchanged, until it sees the complete candidate. Partial/unknown settings, another image, unrelated drift or return to old settings after seeing the candidate still stop acceptance. Health verification still requires the desired and actually running revisions to agree.

The `verify-auth-protection` pipeline action invokes verification only: no build, image update, settings update, migration, secret read or rollback. Supply the existing immutable image and the pre-update unrelated-settings fingerprint from the original release receipt. For run 39117 that fingerprint is `cd21b72cfdffc279918efdf98d35dcaec0491ab8d1957377b700f9790d095577`. It verifies the ready revision and exact preserved settings before and after the same bounded synthetic probes. It never uses a real account. Genuine sign-in acceptance and final launch approval remain separate.
