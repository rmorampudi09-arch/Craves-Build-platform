# Email operational health: bounded read-only inspection

Scope: F05 canonical email diagnostics and F22/F40 delivery/outbox health. This module cannot verify an inbox, mutate a customer, resend a message, repair a record, change a flag or create infrastructure.

`scripts/email/inspect-email-operations.py` reads fixed aggregate counts from the three existing databases through existing Key Vault bindings. Passwords stay in process memory, never arguments, output or files. TLS hostname verification, read-only transactions and connections, ten-second statement bounds and strict output-field validation are required. Runtime drift stops the capture. No identity, address, code, token, row payload or free-form database error is output.

Auth reports recent challenge delivery state and durable projection backlog/lease age. User/Chef reports email mismatches against its own existing authoritative projections. Notification reports recent provider acceptance/failure/unknown counts. Counts are sequential snapshots, not a cross-database identity-equivalence proof. A zero count is not evidence that the journey has been exercised; provider acceptance is not inbox delivery.

## Local verification

Run `python -m unittest discover -s scripts/email/tests -p test_email_operations.py -v`. These six tests mock database/Azure calls and never connect to production. The live inspection uses existing Azure pipeline122, action `inspect-email-operational-health`, on the exact audit branch/commit. The pipeline reruns the boundary tests before reading.

## Manual steps and remaining acceptance

Azure122/run39098 succeeded on2ab3cf8ad815d71d847d66f38e9bfc71331551dd. At15:29:33UTC, Auth had one canonical verified identity and one challenge in the preceding24hours; zero incomplete canonical states, pending/retrying projections, active/expired leases, unavailable/unknown delivery outcomes. User/Chef had one projected identity, one recent receipt and zero mismatches in existing customer profiles or chef applications. Notification had one accepted recent transport receipt and zero failed/unknown receipts. This is healthy aggregate evidence, not proof that the owner's current browser identity is that record or that its email reached the inbox. The exact receipt is `evidence/email-health-39098.json`.

No new secrets, permissions, DNS, resources or store settings. Use the already-authorized Azure service connection; if any scoped read is unavailable, stop and report it rather than grant broader permissions. Owner-controlled sign-in and mailbox entry are still needed for a real verification/profile journey. Retain the receipt and never mark F05/F22 accepted from counts alone.
