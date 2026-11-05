# Account deletion 5/5 (switch-on) - rulings and follow-ups

Carried out of the plan 5 execution ledger (subagent-driven run, 5 Nov 2026), branch feat/account-deletion-switch-on, commits c98491532..29388fc23. The final whole-branch review triaged every deferred item below as "can wait".

## Rulings made during plan 5 (in order)

- Ruling 1: T1 script checks the CONFIRM_APIM_WRITE / DRY_RUN gate before the tool check, so it refuses without touching anything even where az is missing — matches the test and is the safer order — cost if wrong: none (a different error order than the reviews script).
- Ruling: reviewer's Minor "az stderr not captured" conflicts with Global Constraint "Azure CLI stdout and stderr are captured and never echoed" — enters fix round 1 as a constraint violation — cost if wrong: a slightly longer script.
- Ruling: auth has 16 required deletion settings (8 base URLs, 7 credentials, 1 HMAC); the plan's "19" was a counting slip — the preflight flags the 16 and shows switches/tunables — cost if wrong: none.
- Ruling: traffic split reported as exit 1 with "rolling out" (plan test expects exactly that) rather than an abort — cost if wrong: none.
- Ruling: Minor 3 (ingress action compared case-sensitively -> fails open) and Minor 4 (enforced paths stored as secretref skip the STOP check) ride in fix round 1 — both make a safety check fail open, against the spec's anti-goal and the plan's exit rules — cost if wrong: a few lines.
- Ruling: Minor 5 (az error never names the app) rides in round 1 — same show() function the Critical changes — cost if wrong: one line.
- Ruling: Task 4 commit keeps the implementer's own "Claude Haiku 5.5" trailer, no amend — plan 1/2 precedent (keep implementers' own model trailers) — cost if wrong: cosmetic.
- Ruling: carry into the final review fix wave (not Task 5's loop, they live in Tasks 1/2/4 code) — (a) provision.sh `app <same commit>` reuses revision suffix m<8> (Azure likely rejects) — runbook has a sed fallback; (b) Task 1 script curls auth's own FQDN health from Cloud Shell, fails if auth ingress is IP-locked — use revision healthState instead; (c) preflight `commands` line lacks `-o none`, so pasting it prints the app JSON (plain-value env values could show) — secret-leak risk; (d) step 9 KQL in law-craves-prod unverified for all 9 apps — cost if wrong: one more fix wave item each.
- Ruling: spec Rollback line "Deactivate any revision that never took traffic" is factually insufficient (0-traffic active revisions still run the worker); Task 5 updates the spec's rollback line to "deactivate every active auth revision except the one just moved to" — owner intent was that rollback stops erasing — cost if wrong: one spec line.
- Ruling: Minors 5 (vault/ingress rule removal failures hidden by || true), 6 (alert query `has` may never match -> false "no alerts"), 7 (step 2.4 can deploy a missing image to advanced, latestRevision true), 8 (env-name check after deploy on advanced) and cross-task (a) gap (no wait for Healthy) ride in fix round 1 — each makes a safety check fail open or risks an outage — cost if wrong: a few runbook lines.
- Ruling: fix wave takes Importants 1-3 and Minors 4, 5, 6, 8 plus the one-character bare-404 tidy — each is a few lines and 1-3 close a secret-leak path, an avoidable prod ingress write and a fail-open READY — cost if wrong: small diff.
- Ruling: Minor 7 takes option (b): keep the spec's step 6 order and tell the owner to treat an earlier real request as the first erase (watch it with step 9's checks, Stop erasing on the first ERASE_BLOCKED/STEP_FAILING) — reordering step 6 would change the owner-approved spec — cost if wrong: a minutes-to-hours window the owner watches by hand.

## Deferred minor findings (final review: can wait)

- Task 1: minor (deferred): `[[ "$LIMIT" -ge 30 ]]` octal on zero-padded value (use $((10#$LIMIT))).
- Task 1: minor (deferred): GET probe sends a body (harmless, policy answers 401 first).
- Task 1: minor (deferred): tests call shutil.which("bash") without skip -> TypeError when bash missing.
- Task 1: minor (deferred): workflow paths omit AdminAccountDeletionController.java which the operations test reads.
- Task 1: minor (deferred): ${VAR,,} needs bash 4+ (fine on CI/Cloud Shell).
- Task 1: minor (deferred): controller-mapping regex handles only @XMapping("x")/bare forms (fails loudly otherwise).
- Task 1: minor (deferred): not-found regex at script:97 ends in bare `404`, could match digits in a 403/throttle error's ids -> tolerated as "no policy" (API scope only); drop bare 404.
- Task 1: minor (deferred): global policy read now strict (404 on global policy would stop the script; APIM normally always has one).
- Task 1: minor (deferred): curl --show-error on health check can print curl text; policy-read branch has no unit test.
- Task 2: minor (deferred): placeholder `secretref:<create-a-key-vault-backed-secret>` not shell-safe if pasted (note printed with it).
- Task 2: minor (deferred): settings read from latest revision template; no warning when traffic is pinned to an older revision.
- Task 2: minor (deferred): Ant `{var}` variables literal; bare `**` STOPs (fails safe).
- Task 2: minor (deferred): --auth-outbound-ip test proves nothing; Deny-not-containing-auth and placeholder paths untested.
- Task 2: minor (deferred): keyVaultUrl with a version shows the version instead of the secret name (display only).
- Task 2: minor (deferred): base URL compared with exact != (trailing slash or case difference -> false alarm exit 1); normalise with rstrip("/").lower().
- Task 2: minor (deferred): an empty plain-value credential reads "plain value (hidden)", not missing.
- Task 2: minor (deferred): no RED run shown for fix-round tests.
- Task 3: minor (deferred): FirebaseApp instances (UUID names) never deleted after the test; harmless today, would break a future test using FirebaseAdminConfig getInstance(); add @AfterEach delete.
- Task 3: minor (deferred): test doesn't prove the worker schedule is registered (scheduling not enabled in the runner; deterministic).
- Task 5: minor (deferred): step 4 shows only the dry-run line under with_ingress (write the CONFIRM line too).
- Task 5: minor (deferred): what to do if a real request comes due before the test request (watch it, Stop erasing on first ERASE_BLOCKED/STEP_FAILING).
- Task 5: minor (deferred): step 3 rollback uses $NEW, empty in a new Cloud Shell session.
- Task 5: minor (deferred): trap may print a spurious WARNING when the rule add itself failed.
- Task 5: minor (deferred): a failed deactivate prints nothing (final list still shows it).
- Task 5: minor (deferred): `None` vs '' wording when az tsv prints None for a missing secret URL.
