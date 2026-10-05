# Preserve the deployed Integration delivery source

Read-only inspection on 2026-10-05 identified the live Integration image
`cravesrm09prodlow6bf632.azurecr.io/craves/integration-service:199`.
Azure DevOps run 199 successfully built commit
`389066987b1bb782dab48dd39578b812d21f56de` from
`codex/borzo-pidge-120s-20261002` in the Craves Azure repository.

The exact service folder was downloaded at that commit and compared with main
`d1d1fb99fa2bbfcad909d06ef589e2a9254bc80d`. Its delivery classes, Borzo
configuration, delivery tests and two delivery configuration entries are
preserved byte for byte. The existing finance approval implementation remains
from main. No frontend files or provider activation settings change.

Production already records `V147__borzo_pidge_timed_handoff.sql`, checksum
`-837191910`. The downloaded immutable SQL computes that same Flyway checksum.
Restore that exact file to canonical source and add the new shared-finance
migration as V148. Never rewrite production history, run Flyway repair, or reuse
V147 for finance. The upgrade acceptance test starts at the actual V147 prefix
and proves its checksum survives V148 unchanged.

Integration's seven active direct secret references are preserved in its existing
vault by `scripts/finance/preserve_integration_bindings.py`. It first verifies
both migration histories and the existing active common finance terms. Existing
secret values are copied exactly through private temporary files; the final
single application update changes only their storage references. Existing
destinations with different values or disabled versions stop the operation.
Images, revisions, identities, permissions, provider flags and every unrelated
application stay unchanged. Values never appear in command arguments or reports.

Run the complete combined regression before binding preservation. Then perform
the usual two-service preflight and release at the exact merged main SHA. Verify
signed approval and Catalog authority, public privacy and ready revisions.
Historical financial data and live delivery behavior remain authoritative.
