# Applied email migration evidence

Azure pipeline122 / run39094 completed successfully at15:02 UTC,16 September2026, on audit source2f64560bc25926308cccaa2246ebfe19a8c9ebaa. Six offline boundary tests passed first. The three live database connections used the existing scoped Key Vault password references in process memory, verified TLS and read-only transactions with bounded timeouts. No customer records, email addresses or credentials were printed.

All35 versioned SQL migrations matched their source filenames and signed CRC32 checksums: Auth15, User/Chef13, Notification7. Notification also had one successful schema-history record. No source version was missing and no repair was performed. Auth emailV15 and limiterV16, User/Chef emailV12 and Notification emailV7 are confirmed; the older PDF's AuthV10/V11 numbering must not be used.

The sanitized receipt is `evidence/applied-email-history-39094.json`; its Azure raw-log URL retains every version/checksum comparison. Serving revisions were Auth0000045, User/Chef0000050 and Notification0000045; all retained their existing customer-email image tag. This does not independently verify pulled-image provenance, canonical email/projection agreement or actual mailbox delivery. Those acceptance checks remain separate.

## Files and local checks

- `scripts/email/inspect-applied-email-history.py`: three fixed service bindings; only metadata and Flyway history; blocks unknown DB hosts, schemas, URL parameters, ambiguous secret bindings and runtime drift. It never runs migrations or accepts SQL from a caller.
- `scripts/email/tests/test_applied_email_history.py`: migration completeness, CRC normalization, TLS/host binding, read-only queries, redacted failures and rejected write commands.
- `azure-pipelines-email-readiness-status.yml`: explicit `inspect-applied-email-history` action in existing pipeline122. No new service connection or infrastructure.

Run `python -m unittest discover -s scripts/email/tests -p test_applied_email_history.py -v` locally. This uses fixtures only. Live inspection runs through existing Azure authentication; do not paste any connection string or password into chat. No portal/secret/manual configuration was changed by this inspection.

Checksum behavior follows Flyway's `ChecksumCalculator`: UTF-8 line contents, excluding newline bytes and the initial BOM. Reference: https://github.com/flyway/flyway/blob/main/flyway-core/src/main/java/org/flywaydb/core/internal/resolver/ChecksumCalculator.java . Any applied mismatch must be investigated, never hidden through checksum repair.
