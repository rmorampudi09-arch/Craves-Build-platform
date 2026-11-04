# Account deletion (plan 2, coordinator) - rulings and follow-ups

Carried out of the plan 2 execution ledger (subagent-driven run, 4 Nov 2026) for plans 3-5.
Branch feat/account-deletion-coordinator, plan 2 commits 7f1ecf213..d6325df6d (cut from docs/account-deletion-design 9ee4796a5).

## Rulings made during plan 2 (in order)

- Ruling: later tasks (T7-T10) may add the repository methods they need to AccountDeletionRepository - T5 names only the core set - cost if wrong: none (same file, reviewed per task).
- Ruling: T8 may modify AuthService.ensureCustomerRole (its text requires it; Files list omitted it) - cost if wrong: none.
- Ruling: T9's samePhoneSignsUpAgainAfterWipe may assert through the public sign-in path or, if unreachable in a DB test, by inserting a new auth_identity with the old phone and firebase uid without a unique violation - cost if wrong: a weaker test of the same fact.
- Ruling: T2 adds release endpoint controller tests (401 wrong secret, 400 bad scope) in the plan 1 controller test pattern - cost if wrong: none.
- Ruling: plan 2 runs on its own branch feat/account-deletion-coordinator so PR #611 stays plan 1 only - cost if wrong: a rebase if #611 changes.
- Ruling: ⚠️ chef-side PLAN_HAS_ACTIVE_SUBSCRIBERS also excludes abandoned checkouts (same 24 h rule) - plan Decision 9 intent, else one customer's abandoned checkout blocks a chef forever - cost if wrong: a chef erase proceeds while a >24 h-old checkout could still be paid (same accepted risk as order C1). Rides in fix round 1.
- Ruling: ⚠️ chef plan creation is refused (409 ACCOUNT_DELETION_PENDING) while the claim is CHEF/ALL - a new plan defaults to accepting=TRUE and would go live for a chef being deleted (anti-goal) - cost if wrong: a chef cannot draft a plan during the 30 days. Rides in fix round 1.
- Ruling: keep implementers' own model trailers on their commits, no amend (plan 1 precedent) - cost if wrong: cosmetic.
- Ruling: T8 releases a request's lease right after processing it (add releaseLease) - the lease only guards concurrent workers; without release 9 erase calls take ~45 min - cost if wrong: none.
- Ruling: T8 passes the reminder lead (AccountDeletionProperties.reminderDays) into claimDue instead of the repository constant REMINDER_LEAD - config and claim must agree - cost if wrong: a reminder never claimed if reminderDays changes.
- Ruling: DeletionModel holder class (nested enums/records) accepted; later briefs' bare names mean DeletionModel.X - cost if wrong: cosmetic.
- Ruling: Minors 3 (NULL next_attempt_at/next_check_at never due) and 4 (leftover PREPARE/ERASE steps of a CANCELLED/REJECTED request re-claimed forever) ride along in fix round 1 - both make work stuck or loop forever (spec anti-goal) and are one-predicate fixes - cost if wrong: small diff.
- Ruling: completed-ALL notice goes by EMAIL only (when verified); no SMS while notification-service has no transactional SMS - spec "by SMS/email if a channel still exists" - cost if wrong: a person with no verified email gets no "deleted" message (they had the request notice and the 7-day reminder).
- Ruling: ALL-scope IN_APP/PUSH notices are sent for both CUSTOMER and CHEF roles (one requestKey per role) - a whole-account chef reads the chef app inbox - cost if wrong: an unseen CHEF-role inbox row for a non-chef.
- Ruling: ALL-scope PUSH is sent once (role CUSTOMER, no role suffix) - one push token per device serves both sides; IN_APP stays per role - cost if wrong: a chef-only device token misses one push.
- Ruling: Tasks 7 and 10 send notices off the request thread (a small single-thread executor after commit) - DeletionNotices blocks up to ~3 x callTimeout when notification-service hangs - cost if wrong: none (notices are best-effort).
- Ruling: staff (admin-session) identities may request deletion like anyone else (brief bars only RIDER from ALL); Task 10 already forbids acting on one's own request - cost if wrong: a staff login deleted on its owner's own request.
- Ruling: ride along in fix round 1 - (a) releaseLease only clears its own lease (WHERE lease_until = the claimed value) and recordStep never downgrades a DONE step (late writer after lease overrun); (b) blockers answered with outcome BLOCKED keep their list (SERVICE_UNREACHABLE only for FAILED or empty); (c) a request whose processing throws logs CRAVES_ALERT alert=ACCOUNT_DELETION_REQUEST_FAILING (anti-goal: never stuck with no one told); (d) no reminder for a request already due; (e) rename twoWorkersNeverRunTheSameRequest to what it proves - all small and each closes a stuck/incorrect path - cost if wrong: small diff.
- Ruling: one-side completed notice goes to the remaining side's inbox (CUSTOMER scope -> userRole CHEF, CHEF scope -> CUSTOMER) - the copy addresses the remaining side and the erased inbox is gone - pre-review change to DeletionNotices - cost if wrong: none.
- Ruling: drop X-Admin-Reason from the two GETs - the brief has no read header and audit details may hold no free text, so the value had nowhere to go; the read audit row still records who read which request - cost if wrong: reads carry no stated reason (plan 4 admin page can add one later with a stored field).
- Ruling: F1 catalog erase clears pause_reason + prior columns, kitchen stays closed - spec "chef again later" - cost if wrong: none.
- Ruling: F2 ERASE-phase BLOCKED logs CRAVES_ALERT alert=ACCOUNT_DELETION_ERASE_BLOCKED each attempt (codes only) - anti-goal "blocked forever with no one told" - cost if wrong: alert noise while staff settle an item.
- Ruling: F3 a RELEASE step is recorded DONE without calling the service while the identity has an open CHEF/ALL request - the newer request's prepare kept the original prior state - cost if wrong: a stale release never runs (kitchen stays closed until the newer request ends).
- Ruling: F4 CUSTOMER scope refused (409 ACCOUNT_DELETION_SCOPE_NOT_ALLOWED) for a person with neither CHEF nor RIDER; customer-only accounts ask for ALL - spec/Play: a customer's login is wiped - cost if wrong: app must send ALL for customer-only (plan 3 note).
- Ruling: F5 @DynamicUpdate on AuthIdentity so sign-in writes only changed columns - closes sign-in-undoes-lock (and the same admin-suspend race) - cost if wrong: any code relying on full-row writes of AuthIdentity (checked in the wave).
- Ruling: F6 only phase ERASE reaches eraseLogin; SWEEP auth = FAILED UNSUPPORTED_STEP - cost if wrong: none.
- Ruling: F7 admin reactivate refused (409 ACCOUNT_DELETION_IN_PROGRESS) while an ALL request is ERASING or COMPLETED - cost if wrong: staff cannot unsuspend a tombstone (intended).

## Notes for plan 3 (app), plan 4 (web/admin) and plan 5 (rollout)

- Plan 5 note: referral deploy/main.bicep should list CRAVES_REFERRAL_ERASURE_FORFEIT_ENABLED (default false) beside the other CRAVES_REFERRALS_* switches.
- Plan 5 note: notification-service CRAVES_INTERNAL_AUTH_ALLOWED_CALLERS override (if set in Azure) must also get |auth on /internal/v1/notifications.
- Plan 3 note: after POST/DELETE /me/deletion the app must refresh its token (token_version bumped; with revocation on, the old token gets 401).
- Plan 3 note: a customer-only account sends scope ALL (CUSTOMER is refused without CHEF/RIDER).
- Plan 3/4 note (disclose): a checkout or schedule created before the request can still be paid and become an order during the wait.
- Before deploy: boot auth's full Spring context once with the switches on and test service URLs (no CI job boots it); admin-session tokens carry no deletion_pending claim (edge).

## Items flagged for the owner or a later plan

- Task 1: ⚠️ checked: schedules created before the request still fire (brief guards createSchedule only) - final review to judge; old tokens keep no claim until refresh - Task 7 / plan Decision 2.
- Ruling: ⚠️ chef-side PLAN_HAS_ACTIVE_SUBSCRIBERS also excludes abandoned checkouts (same 24 h rule) - plan Decision 9 intent, else one customer's abandoned checkout blocks a chef forever - cost if wrong: a chef erase proceeds while a >24 h-old checkout could still be paid (same accepted risk as order C1). Rides in fix round 1.
- Ruling: ⚠️ chef plan creation is refused (409 ACCOUNT_DELETION_PENDING) while the claim is CHEF/ALL - a new plan defaults to accepting=TRUE and would go live for a chef being deleted (anti-goal) - cost if wrong: a chef cannot draft a plan during the 30 days. Rides in fix round 1.
- Task 6: ⚠️ checked: completed-ALL email after the notification erase step - covered by plan Decision 1 (SWEEP re-runs notification erase 24 h later), Task 9 must keep it.
- Task 7: ⚠️ checked: other services call /api/v1/auth/me only for admin-session validation and parse JWT claims as a Map - the additive pendingDeletion:null field is safe.
- Task 8: ⚠️ for final review: sign-in racing the lock (existence check vs commit; AuthIdentity full-row flush may undo SUSPENDED/token_version - pre-existing, same for admin suspend); grantChefRole can re-add CHEF during a CHEF-scope ERASING; admin unsuspend during ERASING; duplicate reminder under lease overrun relies on notification requestKey dedupe.
- Task 9: ⚠️ for final review: auth_audit.details and auth_admin_intervention.reason may hold personal text after an ALL wipe.
- Task 9: ⚠️ for final review/owner: kept in auth after ALL wipe - verified email in immutable auth_email_projection_outbox, referral_enrollment.contact_hash, auth_admin_intervention.reason, auth_audit.details, admin_session_family rows, auth_identity.last_login_at.

## Deferred minor findings

- Task 1: minor (deferred): launch-policy / batch-hold aspects run before the guard, so a pending-deletion customer under the minimum or out of range sees MINIMUM_ORDER_NOT_MET / policy error instead of ACCOUNT_DELETION_PENDING (no writes either way).
- Task 1: minor (deferred): AccountDeletionGuardTest redundant direct guard call in loop; import order.
- Task 2: minor (deferred): PENDING_PAYMENT_PAYABLE_HOURS package-private; deletionPendingFor(String side) stringly typed; guard test's "allowed" path relies on PLAN_NOT_ACTIVE downstream; audit ORDER BY without tie-break.
- Task 2: minor (deferred): submitting an existing DRAFT during the pending period is not blocked (prepare closed it, release reopens it).
- Task 3: minor (deferred): replaceMySchedule check-then-act race with a concurrent prepare (no FOR UPDATE / conditional UPDATE) - chef save at the same ms can reopen the kitchen.
- Task 3: minor (deferred): CASE branch WHEN deletion_prior_saved untested; empty-key 503 test covers erase only; release returns the count key at 0 while prepare returns {}.
- Task 4: minor (deferred): ReferralSettings.erasure null if yml block missing (NPE, fails closed); long Javadoc line; zero-balance test covers one of wallet-missing/zero; 409 tested at service level only.
- Task 5: minor (deferred): lockOpen FOR UPDATE vs FOR NO KEY UPDATE + no tx assertion; findLatest seq scan (no (identity_id, requested_at) index); page() with afterRequestedAt but null afterId returns nothing; IN(subquery LIMIT ... SKIP LOCKED) vs MATERIALIZED CTE.
- Task 6: minor (deferred): two HttpClient instances; reminder title hardcodes "7 days"; unused phone param; loop continues after InterruptedException; catch(Exception) returns bare ERROR without log; stalled-body timeout untested.
- Task 7: minor (deferred): dead findLatest stub in meShowsNothingWhenNoRequestIsOpen; no inOrder proof that steps+bump precede commit; GET/DELETE unauthenticated test checks class not 401; real executor bean untested; consumes=json gives 415 before 503 when off. Spring context boot not run (CI).
- Task 8: minor (deferred): Mockito self-attach notice in test output (pre-existing).
- Task 8: minor (deferred): releaseLease outside try/catch (a release DB error aborts the rest of the batch until leases lapse); step-failing alert can fire for a late FAILED on a DONE step.
- Task 9: minor (deferred): idle claim/release every tick while an earlier ERASE step backs off (claim SQL could count only the first unfinished ERASE step).
- Task 9: minor (deferred, fix before merge): engine :142 routes any auth step in phase ERASE or SWEEP to eraseLogin - a SWEEP 'auth' step would wipe without the 8-DONE gate (none inserted today); restrict to phase ERASE.
- Task 9: minor (deferred): idle claims during back-off; final notice stamped even when notification refused (best-effort, no retry); erased_count 0 after crash-retry; untested auth-DONE->complete path and CHEF-scope completion in engine tests; swappable String args in tell overloads.
- Task 10: minor (deferred): refused approvals / own-request 403 not audited; detail calls 8 services even for closed requests; tombstone check and read audit live in the controller; garbage limit/UUID -> 500 (pre-existing); OpenItems 409 body has no timestamp; tests written after code.
- Final review: minor (deferred): F7 comment claims row-lock ordering that is not strict (outcome safe: AccountLock re-suspends after); F3 check-then-call window; F5 test compares JVM clock with PostgreSQL now() (flaky only if DB clock runs ahead).
