# Auth request protection on existing PostgreSQL

The PostgreSQL mode uses the existing Auth database; it does not provision Redis or change customer payment settings. It protects the public Firebase exchange and refresh operations before authentication. In the reconciled 16 September source, Auth V16 adds ephemeral counters after authoritative email V15, preserving earlier analytics, admin admission and referral migrations. Older V10/V11 numbering described an obsolete candidate. Existing Auth migrations remain immutable.

Enable only on a reviewed, migrated, healthy release. Defaults preserve existing disabled/Redis behavior. Root release evidence must record the actual enabled flag, selected mode, reviewed settings, source SHA, revision, and route checks.

| Setting | Default | Meaning in PostgreSQL mode |
|---|---:|---|
| `CRAVES_AUTH_RATE_LIMIT_ENABLED` | `false` | Explicit activation gate |
| `CRAVES_AUTH_RATE_LIMIT_MODE` | `redis` | Set `postgres` to use existing database protection |
| `CRAVES_AUTH_RATE_LIMIT_WINDOW_SECONDS` | `60` | Fixed elapsed window; not a calendar-day policy |
| `CRAVES_AUTH_RATE_LIMIT_MAX_CONCURRENT` | `6` | Maximum active exchange/refresh requests per replica |
| `CRAVES_AUTH_RATE_LIMIT_GLOBAL_EXCHANGE_LIMIT` | `120` | Global admitted exchange attempts per window |
| `CRAVES_AUTH_RATE_LIMIT_GLOBAL_REFRESH_LIMIT` | `300` | Global admitted refresh attempts per window |
| `CRAVES_AUTH_RATE_LIMIT_CREDENTIAL_LIMIT` | `10` | Attempts using the same credential per operation/window |
| `CRAVES_AUTH_RATE_LIMIT_IDENTITY_REFRESH_LIMIT` | `30` | Attempts across known active refresh sessions for one identity/window |
| `CRAVES_AUTH_REQUEST_IDLE_TIMEOUT_MS` | `5000` | Auth connector initial/upload read inactivity bound |
| `CRAVES_AUTH_REQUEST_BODY_TIMEOUT_MS` | `10000` | Total body-read budget, checked between bounded reads |

These are configurable engineering capacity guards, not measured customer capacity or a guarantee against denial of service. Preserve the one-replica maximum. With default timeouts, a blocked/dripping body is rejected within the total budget plus at most one read inactivity interval (15 seconds); rejected request bodies are not drained for keep-alive reuse, and the connector settings apply only when PostgreSQL protection is enabled. Normal BFF upstream and body deadlines still apply. Traffic capacity must be measured with synthetic disposable tests before limits change.

Each request first acquires a bounded concurrency permit, then consumes the operation's global database counter. Only globally admitted requests may create a credential bucket. Credential keys contain a SHA-256 digest, never tokens, email addresses, IP addresses, bodies or authorization headers. The refresh identity lookup uses the existing unique token-hash index and is only a cost-control lookup; the Auth service still independently authenticates and checks expiry/revocation/replay. Unknown, revoked or expired refresh tokens do not create identity buckets.

Counters use an atomic fixed-window upsert and clamp at limit plus one. An expiry index supports cleanup batches of at most 500 expired rows on every 50 globally admitted requests, including the first. Global admission therefore bounds attacker-controlled key creation, while cleanup work is bounded and outpaces the maximum possible key creation. Cleanup touches only the ephemeral counter table and retains all identity, session, verification and audit history. Concurrent calls cannot grant more than the configured per-window admission count.

The filter uses the servlet-decoded endpoint path so alternate percent encodings cannot bypass protection. It ignores forwarded-IP headers for bucket selection. Actual request bodies are capped at 32 KiB; token and individual header values are capped at 20,000 characters, with aggregate header bounds. Duplicate JSON keys, trailing JSON values, non-string/control-character credentials, unsupported content encoding and non-UTF-8 content types are rejected. The replay wrapper preserves the bounded body for existing controller validation. Body buffers are cleared after synchronous processing.

Database query failures fail closed with a generic no-store `503 AUTH_RATE_LIMIT_UNAVAILABLE`. Admission failures return `429 AUTH_RATE_LIMITED` and a positive `Retry-After`; malformed, oversized and timed-out requests return bounded generic errors without echoing input. Neither database credentials nor application/provider credentials are logged. Existing Redis mode retains its existing explicit limits and implementation, with the same decoded-path protection.

Required disposable CI gates include `PostgresAuthRateLimiterDbTest` (12 real PostgreSQL cases), `PostgresAuthAbuseProtectionFilterTest`, `AuthRequestReadConfigurationTest`, real loopback `AuthRequestReadTomcatTest` and `AuthProtectedOperationTomcatTest`, Redis compatibility and the email migration suite. The reconciled combined release tests the preserved pre-email history through V14, additive V15/V16, clean installation and idempotent replay. Never run destructive database tests against production or a tunnel. Local unit passes and skipped persistence tests are not production activation evidence.

Rollback must first stop new unsafe Auth requests, then return traffic/configuration to the reviewed prior revision if necessary. Preserve V16 and all earlier database history; do not roll migrations backward or repair checksums. Counter expiry is independent of verification and financial reconciliation.
