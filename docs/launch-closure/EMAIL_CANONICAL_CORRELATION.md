# Private canonical-email comparison

F05 requires more than equal aggregate counts. `scripts/email/inspect-email-correlation.py` compares authoritative identity, exact email, revision, verification timestamp and verified flag against the User/Chef projection, and detects divergent existing customer/chef email fields.

This is a read-only diagnostic, not a repair or launch acceptance. It uses the two existing scoped database bindings and the existing Azure service connection. It creates no secret, account, message, permission, database object or cloud resource. PostgreSQL connections verify TLS hostnames and use read-only transactions with ten-second statement bounds and a two-second lock bound. It reads at most10001 rows to enforce a10000-row ceiling; exceeding that limit is inconclusive, never sampled success.

Account rows and the independently generated comparison key exist only in process memory. Addresses, identity IDs, keyed digests, passwords and raw subprocess output are never printed or saved in evidence. Each database is observed twice; any observed data or runtime difference stops the check. Stable observations still are not a distributed atomic snapshot, cannot exclude intervening changes that revert, and do not prove revocation or mailbox delivery. Zero rows cannot pass.

Only counts, match indicators and safe service revision/image metadata leave the diagnostic. A discrepancy causes a failed result without exposing the affected account. Follow-up investigation must be separately scoped and must not auto-repair canonical or financial records.

## Local tests

Run `python -m unittest discover -s scripts/email/tests -p test_email_correlation.py -v`. Fixtures are synthetic and never connect to a live database. Tests cover same-count/different-identity, email/revision/time/verification differences, profile divergence, duplicates, unknown fields, empty evidence, read bounds, instability and output privacy.

## Existing pipeline action

Azure pipeline122 action `inspect-email-correlation` runs the tests, then the diagnostic through the existing service connection. Keep other release parameters at NOT_AUTHORIZED. No new manual Azure, DNS, store, secret or paid-resource setup is required. A successful live receipt is still required; tests alone are not F05 closure.
