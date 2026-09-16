# Auth protection: live read-only checkpoint

Azure pipeline122/run39107 succeeded at16:45:02UTC on reviewed audit source98a0f80c582bab0e7d58d10adb04fb2de51ebfba. Twelve isolated scope/redaction/drift tests passed before the read. The receipt is `evidence/auth-protection-39107.json`; implementation/setup details are in `docs/auth/AUTH_PROTECTION_RUNTIME_AUDIT.md`.

## Observed, not assumed

The desired and running Auth environments both explicitly set the rate-limit enabled flag to false. Mode and the other eight documented numeric limits/timeouts are absent from the environment. Defaults are shown only as reviewed source defaults, not verified effective values. The only detected potential override variable is SPRING_PROFILES_ACTIVE; its contents were not exported. There are no container command/argument overrides in this metadata.

Auth remains on revision0000045 with one healthy active replica, min/max both one, and the existing customer-email-4ad490be source-tag hint. Image-source provenance remains unproven by the tag alone. Complete app and revision readbacks remained unchanged during the check. No customer requests, secrets, emails, database calls, activation or new resources.

## Remaining engineering gate

F06 is not accepted. Before activation, reconcile the serving implementation and effective profile settings, inspect the existing gateway protections, preserve the already-applied immutable V16 counters and working email contracts, and prepare a source-tested configuration-preserving activation/recovery path. Then verify bounded responses without public OTP stress. This read-only result must not be used to enable a mode based solely on presumed defaults or to disable existing gateway protection.

F04/F05 also retain their full-plan gates: the owner-confirmed customer inbox journey is real evidence, but the plan additionally requires a legitimate chef verification entry path and correlated canonical/projected versions. No chef declarations or identities were fabricated to close those gates.

## Manual steps

No owner action was needed for this read-only run beyond existing access. Public launch still needs genuine policy/declaration facts, support and alert ownership, an explicit paid isolated-test budget and the owner's final real payment/delivery/bank journey. The INR1500 monthly referral cap is not an infrastructure budget. The current customer web remains the successful39106 deployment; no new APK was built in this package.
