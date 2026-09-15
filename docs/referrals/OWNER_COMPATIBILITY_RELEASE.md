# Deployed owner compatibility candidate

This branch is based on deployed Auth/Order source `3a4dfa69a547a64223ec09373bfcefbd5d487131` (`release/admin-explorer-consumption-v1`). It carries only the Auth/Order referral changes from main candidate `67c3cac24e39721e3bbcf45c29f66bb0a1da681c`, plus dedicated verification. It does not import the 37 unrelated main-versus-release changes.

Auth adds optional consent/enrollment, source/status outbox and authoritative account/token/role verification. Order adds financial binding and lifecycle evidence, benefit reservation/consumption/cancellation and reviewed recovery. Existing gross/tax/chef economics remain source-owned. All runtime opt-in flags default false.

Run `bash scripts/referrals/test-owner-compatible.sh` with the disposable PostgreSQL environment in `.github/workflows/referral-owner-compatibility-ci.yml`. Required owner suites cannot skip. This candidate does not deploy Integration or the referral engine and is not a production activation record. Use the matching Integration/referral source from PR #358. Actual policy evidence, funding, payout approval, secrets, private networking, capacity and end-to-end release acceptance remain required.

The user has authorized engineering/deployment work. Missing programme evidence is actual business data, not a request for that authorization again. Do not merge or deploy unrelated main changes as a shortcut to owner compatibility.
