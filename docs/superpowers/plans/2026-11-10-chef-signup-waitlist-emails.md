# Chef Sign-up Emails to Waitlist@craves.in: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled job in user-chef-service emails Waitlist@craves.in when a chef opens the application, moves forward a step, submits, asks for help, or stops for 24 hours.

**Architecture:**
- Every 5 minutes, `ChefSignupAlertJob` loads the same applicant rows the admin drafts list shows, plus submitted applicants.
- It turns each applicant's `ChefOnboardingPolicy.resume` step into a rank and compares it with a new `chef_signup_alert` table.
- When something changed, it posts a plain-text EMAIL request to notification-service `/internal/v1/notifications`, using a fixed request key.
- It is off unless `CRAVES_CHEF_SIGNUP_ALERT_EMAIL` holds an address.

**Tech Stack:** Java 21, Spring Boot, JdbcTemplate, Flyway, JUnit 5 + Mockito.

**Spec:** `docs/superpowers/specs/2026-11-10-chef-signup-waitlist-emails-design.md`

## Global Constraints

- All paths below are under `services/user-chef-service/`. Java packages: `in.craves.userchef.onboarding`, `in.craves.userchef.service`.
- A merge to `main` deploys to production. The feature must ship off: config `craves.chef-signup-alerts.email: ${CRAVES_CHEF_SIGNUP_ALERT_EMAIL:}`, where empty means off.
- Migrations are append-only. The new file is `V24__chef_signup_alert.sql` (V23 is the newest on `main` 7dc4e24cd).
- No new controller, so `live-runtime-lock.txt` is unchanged.
- Send with `NotificationInternalClient.post` (the `kitchenLaunched` path), never `sendSafely`, because direct dispatch is off in production.
- Request keys: `chef-signup-<identityId>-rank-<n>`, `chef-signup-<identityId>-help-<helpId>`, `chef-signup-<identityId>-stall`.
- Subjects: `Chef sign-up · <phone>`; for the 24-hour email, `Stopped 24 h · chef sign-up · <phone>`.
- Times are shown in Asia/Kolkata as `d MMM HH:mm` (`10 Nov 09:12`, `Locale.ENGLISH`).
- Never in an email: date of birth, street address lines, landmark, FSSAI number, ID type or number, document links.
- Admin line, exact text: `Admins: https://admin.craves.in/admin/chef-reviews`.
- Local test command (PowerShell; JDK 21 and Maven are at these paths on this PC):
  `$env:JAVA_HOME='C:\Program Files\Java\jdk-21'; & 'C:\Program Files\Apache\maven\mvn\bin\mvn.cmd' -q -f C:\mwaitlist\services\user-chef-service\pom.xml test -Dtest=<TestClass>`
- `ChefOnboardingDatabaseTest` runs only in GitHub CI (it needs `ONBOARDING_TEST_DB_URL` and `GITHUB_ACTIONS=true`). Locally it is skipped. Its new tests are proven by the PR's launch-regression run.

## Review Focus

- **Two replicas run at the same moment.** Expected: one email per event. The fixed request key does this; Task 4 tests that the keys are exact.
- **Applicant with no name and no phone** (old form, Auth lookup failed). Expected: the email still goes. The subject reads `Chef sign-up · no phone` and the headline uses `A chef`. Tested in Task 2.
- **Phone not in `+91XXXXXXXXXX` form** (test numbers, a bare 10-digit number). Expected: shown exactly as stored, no crash. Tested in Task 2.
- **Address setting with stray spaces, or not an email** (`" Waitlist@craves.in "`, `"waitlist"`). Expected: spaces are trimmed; an invalid value keeps the job off and logs a warning. The service never fails to start over it. Tested in Task 4.
- **Step value the job does not know** (`legacy`, null). Expected: that applicant is skipped and the rest of the run carries on. Tested in Tasks 2 and 4.

---

### Task 1: Shared applicant loader

`drafts()` and the job must read the same rows. Add the three fields the email needs, and allow submitted applicants in.

**Files:**
- Modify: `src/main/java/in/craves/userchef/onboarding/ChefOnboardingDtos.java:42-45` (`DraftApplicant`)
- Modify: `src/main/java/in/craves/userchef/onboarding/ChefOnboardingService.java:264-320` (`DraftRow`, `drafts`)
- Modify: `src/main/java/in/craves/userchef/service/ChefApplicationService.java:439` (`listApplicationEvidence`)
- Test: `src/test/java/in/craves/userchef/onboarding/ChefOnboardingDatabaseTest.java`

**Interfaces:**
- Produces:
  - `DraftApplicant(UUID identityId, String firstName, String lastName, String email, boolean emailVerified, String phoneNumber, String step, String reviewStatus, UUID applicationId, Instant startedAt, Instant lastActivityAt, String kitchenName, String city, String postalCode)`. The three new components go at the end, and the admin JSON gains them.
  - `public List<DraftApplicant> applicants(boolean includeSubmitted)` on `ChefOnboardingService`. It does no access check; callers check.
  - `public List<KycDocumentResponse> listApplicationEvidence(UUID applicationId)` on `ChefApplicationService`, now public with no access check. Add a one-line comment saying callers check access.

- [ ] **Step 1: Write the failing database tests** in `ChefOnboardingDatabaseTest`:

```java
@Test void applicantsIncludesSubmittedWhenAsked() {
    // submit a complete application for `user` (reuse the existing submit helper in this class)
    assertTrue(service.drafts(admin).stream().noneMatch(d -> d.identityId().equals(user.identityId())));
    DraftApplicant a = service.applicants(true).stream().filter(d -> d.identityId().equals(user.identityId())).findFirst().orElseThrow();
    assertEquals("waiting", a.step());
}
@Test void applicantsCarriesKitchenCityAndPincode() {
    // save details with kitchenName "Ravi's Tiffins", city "Hyderabad", postalCode "500072"
    DraftApplicant a = service.applicants(false).stream().filter(d -> d.identityId().equals(user.identityId())).findFirst().orElseThrow();
    assertEquals("Ravi's Tiffins", a.kitchenName()); assertEquals("Hyderabad", a.city()); assertEquals("500072", a.postalCode());
}
@Test void visitOnlyApplicantIsSignedIn() {
    service.mine(user);
    assertEquals("signed-in", service.applicants(true).stream().filter(d -> d.identityId().equals(user.identityId())).findFirst().orElseThrow().step());
}
```

- [ ] **Step 2: Compile the tests.** Run the local test command with `-Dtest=ChefOnboardingDatabaseTest`. Expected: COMPILATION ERROR (`applicants`, `kitchenName` not defined).

- [ ] **Step 3: Implement.**
  - `drafts(admin)` becomes `requireAdmin(admin); return applicants(false);`.
  - `applicants(includeSubmitted)` is the old `drafts()` body, with these changes:
    - The CTE filter `WHERE NOT d.submitted` becomes `WHERE (? OR NOT d.submitted)`, bound to `includeSubmitted`.
    - Select `d.submitted` into `DraftRow`. The visit-only branch selects `false`.
    - `step` is `r.details()==null ? "signed-in" : ChefOnboardingPolicy.resume(r.details(), docs, r.submitted() && !"MORE_INFORMATION_REQUIRED".equals(r.reviewStatus()))`.
    - Evidence comes from `applications.listApplicationEvidence(r.applicationId())`.
    - The three new fields come from `r.details()`, or null when there are no details.

- [ ] **Step 4: Run** the local test command with `-Dtest=ChefOnboarding*`. Expected: BUILD SUCCESS. The database tests are skipped locally, so check the count of skipped tests rather than read it as a pass. `ChefOnboardingPolicyTest` passes.

- [ ] **Step 5: Commit**

```bash
git add services/user-chef-service/src
git commit -m "user-chef: share the chef drafts loader with submitted applicants and kitchen area"
```

---

### Task 2: Email text

A pure formatter with no Spring and no I/O, so every wording rule is unit-tested.

**Files:**
- Create: `src/main/java/in/craves/userchef/onboarding/ChefSignupAlertEmail.java`
- Test: `src/test/java/in/craves/userchef/onboarding/ChefSignupAlertEmailTest.java`

**Interfaces:**
- Consumes: `DraftApplicant` (Task 1).
- Produces: `final class ChefSignupAlertEmail`, all static and package-private:
  - `int rank(String step)` returns:

    | step | rank |
    |---|---|
    | `signed-in` | 0 |
    | `personal` | 1 |
    | `kitchen` | 2 |
    | `kitchen-photos` | 3 |
    | `fssai` | 4 |
    | `documents` | 5 |
    | `review` | 6 |
    | `waiting` | 7 |
    | anything else, including null | -1 |

  - `String phone(String stored)`: `+91` followed by 10 digits becomes `+91 98480 12345`; null or blank becomes `no phone`; anything else is returned unchanged.
  - `String subject(DraftApplicant a)` returns `Chef sign-up · <phone>`; `String stallSubject(DraftApplicant a)` returns `Stopped 24 h · chef sign-up · <phone>`.
  - `String stepBody(DraftApplicant a, int rank)`.
  - `String helpBody(DraftApplicant a, int rank, String message)`.
  - `String stallBody(DraftApplicant a, int rank, Instant since)`.

**Wording** (exact copy, from the spec):
- `<who>` is the trimmed first and last name. Without a name it is the formatted phone; without either it is `A chef`.
- **Step headline by rank:**
  - 0: `New chef sign-up: opened the chef application`
  - 1: `<who> started filling the application`
  - 2: `<who> finished: Personal details`
  - 3: `<who> finished: Kitchen details`
  - 4: `<who> finished: Kitchen photos`
  - 5: `<who> finished: FSSAI number`
  - 6: `<who> finished every step but has not submitted`
  - 7: `<who> submitted the application for review`
- **Second line**, ranks 0 to 6 only: `Next step (not done): <next>`. `<next>` is `Personal details` for ranks 0 and 1; `Kitchen details`, `Kitchen photos`, `FSSAI number` or `ID proof` for ranks 2 to 5; and `Submit` for rank 6.
- **Help headline:** `<who> asked for help in the chef application`, a blank line, then `Message: <message>`.
- **Stall headline:** `Stopped at <next> for 24 hours, no progress since <d MMM HH:mm>`.
- **Common tail, after a blank line.** Each line is left out when its value is missing:
  - `Phone:   <phone>`
  - `Email:   <email>`
  - `Kitchen: <kitchenName>, <city> <postalCode>`: join only the parts that are present.
  - `Started: <startedAt> · Last active: <lastActivityAt>`
- **Then a blank line and `Progress`,** followed by rows of the form ` ✓ <label>` or ` ✗ <label>`:
  - `Signed in` is always ticked.
  - `Personal details`, `Kitchen details`, `Kitchen photos`, `FSSAI number` and `ID proof` are rows i = 1 to 5, each ticked when rank > i.
  - `Submitted` is ticked when rank == 7.
- **Last:** a blank line, then the admin line from Global Constraints.

- [ ] **Step 1: Write the failing tests:**

```java
@Test void ranksEveryResumeStep() { assertEquals(0, rank("signed-in")); assertEquals(3, rank("kitchen-photos")); assertEquals(7, rank("waiting")); assertEquals(-1, rank("legacy")); assertEquals(-1, rank(null)); }
@Test void formatsIndianPhones() { assertEquals("+91 98480 12345", phone("+919848012345")); assertEquals("9848012345", phone("9848012345")); assertEquals("+14155550100", phone("+14155550100")); assertEquals("no phone", phone(null)); }
@Test void subjectsKeyOnPhone() { assertEquals("Chef sign-up · +91 98480 12345", subject(ravi())); assertEquals("Stopped 24 h · chef sign-up · +91 98480 12345", stallSubject(ravi())); }
@Test void newSignUpWithOnlyAPhone() { String b = stepBody(phoneOnly(), 0); assertTrue(b.startsWith("New chef sign-up: opened the chef application\nNext step (not done): Personal details")); assertFalse(b.contains("Email:")); assertFalse(b.contains("Kitchen:")); assertTrue(b.contains(" ✓ Signed in\n ✗ Personal details")); }
@Test void kitchenDoneShowsNextStepAndTicks() { String b = stepBody(ravi(), 3); assertTrue(b.startsWith("Ravi Kumar finished: Kitchen details\nNext step (not done): Kitchen photos")); assertTrue(b.contains("Kitchen: Ravi's Tiffins, Hyderabad 500072")); assertTrue(b.contains(" ✓ Kitchen details\n ✗ Kitchen photos")); assertTrue(b.endsWith("Admins: https://admin.craves.in/admin/chef-reviews")); }
@Test void submittedHasNoNextLineAndTicksAll() { String b = stepBody(ravi(), 7); assertFalse(b.contains("Next step")); assertFalse(b.contains("✗")); }
@Test void showsTimesInIst() { assertTrue(stepBody(ravi(), 2).contains("Started: 10 Nov 09:12 · Last active: 10 Nov 09:31")); }
@Test void noNameNoPhoneStillReads() { DraftApplicant x = nobody(); assertEquals("Chef sign-up · no phone", subject(x)); assertTrue(stepBody(x, 2).startsWith("A chef finished: Personal details")); }
@Test void helpCarriesTheMessage() { assertTrue(helpBody(ravi(), 3, "Photo upload fails").startsWith("Ravi Kumar asked for help in the chef application\n\nMessage: Photo upload fails")); }
@Test void stallNamesTheStepAndTime() { assertTrue(stallBody(ravi(), 3, Instant.parse("2026-11-10T04:01:00Z")).startsWith("Stopped at Kitchen photos for 24 hours, no progress since 10 Nov 09:31")); }
@Test void applicantRowCannotCarrySensitiveFields() { var names = Arrays.stream(DraftApplicant.class.getRecordComponents()).map(RecordComponent::getName).toList(); for (String banned : List.of("dateOfBirth","addressLine1","addressLine2","landmark","fssaiNumber","proofKind","otherGovernmentId")) assertFalse(names.contains(banned), banned); }
```

The fixtures: `ravi()` has phone `+919848012345`, Ravi Kumar, `ravi.k@gmail.com`, kitchen `Ravi's Tiffins`, Hyderabad 500072, startedAt `2026-11-10T03:42:00Z`, lastActivityAt `2026-11-10T04:01:00Z`. `phoneOnly()` has only the phone. `nobody()` has all text fields null.

- [ ] **Step 2: Run** the local test command with `-Dtest=ChefSignupAlertEmailTest`. Expected: COMPILATION ERROR (`ChefSignupAlertEmail` missing).
- [ ] **Step 3: Implement `ChefSignupAlertEmail`** with the signatures and copy above. Join lines with `\n`. Use `DateTimeFormatter.ofPattern("d MMM HH:mm", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"))`.
- [ ] **Step 4: Run** the same command. Expected: all 11 tests PASS.
- [ ] **Step 5: Commit** with `git commit -m "user-chef: chef sign-up alert email text"`.

---

### Task 3: Alert table and store

**Files:**
- Create: `src/main/resources/db/migration/V24__chef_signup_alert.sql`
- Create: `src/main/java/in/craves/userchef/onboarding/ChefSignupAlertStore.java`
- Test: `src/test/java/in/craves/userchef/onboarding/ChefOnboardingDatabaseTest.java`

**Interfaces:**
- Produces: `@Repository class ChefSignupAlertStore(JdbcTemplate jdbc)` with:
  - `record AlertRow(int lastRank, Instant lastRankAt, UUID helpAlertedId, boolean stallAlerted, boolean muted)`
  - `record HelpRow(UUID id, String message)`
  - `Optional<AlertRow> find(UUID identityId)`
  - `Optional<HelpRow> latestHelp(UUID identityId)`: the newest `chef_onboarding_help` row by `created_at`.
  - `void insert(UUID identityId, int rank)`: `ON CONFLICT DO NOTHING`, with `last_rank_at = now()`.
  - `void advance(UUID identityId, int rank)`: sets `last_rank = GREATEST(last_rank, ?)` and `last_rank_at = now()`.
  - `void helpAlerted(UUID identityId, UUID helpId)`
  - `void stallAlerted(UUID identityId)`
  - Every write also sets `updated_at = now()`.

- [ ] **Step 1: Write the migration exactly:**

```sql
-- Additive. Which chef sign-up emails Waitlist@craves.in already got; people already in the flow are muted.
CREATE TABLE chef_signup_alert (
    identity_id UUID PRIMARY KEY,
    last_rank SMALLINT NOT NULL,
    last_rank_at TIMESTAMPTZ NOT NULL,
    help_alerted_id UUID,
    stall_alerted BOOLEAN NOT NULL DEFAULT false,
    muted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO chef_signup_alert(identity_id, last_rank, last_rank_at, muted)
SELECT identity_id, 0, now(), true FROM chef_onboarding_visit
UNION
SELECT identity_id, 0, now(), true FROM chef_onboarding_draft
ON CONFLICT (identity_id) DO NOTHING;
```

- [ ] **Step 2: Write the failing database tests:**

```java
@Test void storeRoundTrip() {
    var store = new ChefSignupAlertStore(jdbc); UUID id = UUID.randomUUID();
    assertTrue(store.find(id).isEmpty());
    store.insert(id, 2); store.advance(id, 1);            // never goes down
    assertEquals(2, store.find(id).orElseThrow().lastRank());
    store.advance(id, 4); store.stallAlerted(id); UUID help = UUID.randomUUID(); store.helpAlerted(id, help);
    var row = store.find(id).orElseThrow();
    assertEquals(4, row.lastRank()); assertTrue(row.stallAlerted()); assertEquals(help, row.helpAlertedId()); assertFalse(row.muted());
}
@Test void latestHelpIsNewest() { /* request help twice for `user` via service.requestHelp (resolve the first via service.updateHelp) */ assertEquals(secondHelpId, new ChefSignupAlertStore(jdbc).latestHelp(user.identityId()).orElseThrow().id()); }
```

The muted seed runs once, when Flyway first creates the table, so a fresh test schema seeds nothing. Pin the seed SQL instead: run the migration's `INSERT ... SELECT` again after `service.mine(user)`, then assert `find(user.identityId()).orElseThrow().muted()`.

- [ ] **Step 3: Run** the local test command with `-Dtest=ChefOnboardingDatabaseTest`. Expected: COMPILATION ERROR (`ChefSignupAlertStore` missing).
- [ ] **Step 4: Implement `ChefSignupAlertStore`** with plain `JdbcTemplate` SQL.
- [ ] **Step 5: Run** the local test command with `-Dtest=ChefOnboarding*`. Expected: BUILD SUCCESS. The database tests are skipped locally and are proven in CI.
- [ ] **Step 6: Commit** with `git commit -m "user-chef: chef_signup_alert table (V24) and store"`.

---

### Task 4: Send path and the job

**Files:**
- Modify: `src/main/java/in/craves/userchef/service/NotificationInternalClient.java` (add one method beside `kitchenLaunched`)
- Create: `src/main/java/in/craves/userchef/onboarding/ChefSignupAlertJob.java`
- Modify: `src/main/resources/application.yml` (under `craves:`, next to `kitchen-launch-alerts:`)
- Test: `src/test/java/in/craves/userchef/onboarding/ChefSignupAlertJobTest.java`

**Interfaces:**
- Consumes: `ChefOnboardingService.applicants(true)` (Task 1); `ChefSignupAlertEmail.*` (Task 2); `ChefSignupAlertStore` (Task 3).
- Produces:
  - `public boolean teamEmail(UUID applicantId, String requestKey, String address, String subject, String body)` on `NotificationInternalClient`. It calls `post(new CreateNotificationRequest(requestKey, "user-chef-service", "CHEF_SIGNUP_ALERT", applicantId, null, "EMAIL", null, address, subject, body, "CHEF_SIGNUP", applicantId, Map.of(), 5))`.
  - `@Component public class ChefSignupAlertJob(ChefOnboardingService onboarding, ChefSignupAlertStore store, NotificationInternalClient notifications, @Value("${craves.chef-signup-alerts.email:}") String email)`, with `public void run()` and package-private `void run(Instant now)`.
- Config to add:

```yaml
  chef-signup-alerts:
    # Waitlist@craves.in in production; empty = off.
    email: ${CRAVES_CHEF_SIGNUP_ALERT_EMAIL:}
    fixed-delay-ms: ${CRAVES_CHEF_SIGNUP_ALERTS_FIXED_DELAY_MS:300000}
```

**Job behaviour** (spec "Rules"). `run()` is `@Scheduled(initialDelayString="${craves.chef-signup-alerts.initial-delay-ms:120000}", fixedDelayString="${craves.chef-signup-alerts.fixed-delay-ms:300000}")` and calls `run(Instant.now())`. `run(now)`:

1. The address is the trimmed `email`. If it is blank, return. If it does not match `[^\s@]+@[^\s@]+\.[^\s@]+`, log a warning and return. The constructor never throws.
2. For each `a` in `onboarding.applicants(true)`: `r = rank(a.step())`; skip when `r < 0`. `row = store.find(a.identityId())`; skip when muted.
3. **No row:** send the step email (key `…-rank-r`, `subject(a)`, `stepBody(a, r)`), then `store.insert(id, r)`. Go to the next applicant.
4. **`r > row.lastRank()`:** send the step email, then `store.advance(id, r)`.
5. **Help:** `store.latestHelp(id)` is present and its id differs from `row.helpAlertedId()`: send the help email (key `…-help-<helpId>`, `subject(a)`, `helpBody(a, r, message)`), then `store.helpAlerted(id, helpId)`.
6. **Stall:** no advance happened in step 4, `r < 7`, `!row.stallAlerted()`, and `row.lastRankAt()` is before `now.minus(24h)`. Send the stall email (key `…-stall`, `stallSubject(a)`, `stallBody(a, r, row.lastRankAt())`), then `store.stallAlerted(id)`.
7. **Failure:** if any `teamEmail` returns false, log a warning and return from `run`. The store is written only after a true return.

- [ ] **Step 1: Write the failing tests.** Mock `ChefOnboardingService`, `ChefSignupAlertStore` and `NotificationInternalClient`, as `KitchenLaunchAlertJobTest` does. `NOW = 2026-11-11T04:00:00Z`.

```java
@Test void offWhenAddressEmpty()                       // email "" → verifyNoInteractions(onboarding, store, notifications)
@Test void offWhenAddressInvalid()                     // email "waitlist" → verifyNoInteractions(...)
@Test void trimsTheAddress()                           // email " Waitlist@craves.in " → teamEmail(..., eq("Waitlist@craves.in"), ...)
@Test void newApplicantGetsSignUpEmailThenRow()        // find empty, step "signed-in" → teamEmail(id, "chef-signup-"+id+"-rank-0", ..., "Chef sign-up · +91 98480 12345", startsWith("New chef sign-up")); then store.insert(id, 0)
@Test void sameRankSendsNothing()                      // row lastRank 3, step "kitchen-photos", lastRankAt NOW-1h → verify(notifications, never()).teamEmail(...)
@Test void rankUpSendsOneEmail()                       // row 1, step "kitchen-photos" → one teamEmail with key "-rank-3"; store.advance(id, 3)
@Test void rankDownSendsNothing()                      // row 5, step "kitchen" → never teamEmail; never advance
@Test void failedSendLeavesRowAndStopsRun()            // two applicants, teamEmail returns false → store.insert never called; second applicant never looked up
@Test void mutedApplicantSkipped()                     // row muted → never teamEmail
@Test void unknownStepSkippedOthersContinue()          // applicants [legacy, signed-in] → only the second gets teamEmail
@Test void stallOnceAfter24Hours()                     // row 3 at NOW-25h, not alerted → key "-stall", subject "Stopped 24 h · chef sign-up · +91 98480 12345"; store.stallAlerted(id)
@Test void noStallBefore24HoursOrWhenAlerted()         // NOW-23h → none; NOW-25h with stallAlerted true → none
@Test void noStallAfterSubmit()                        // step "waiting", row 7 at NOW-48h → none
@Test void newHelpRequestSendsHelpEmail()              // latestHelp(helpId,"Photo upload fails"), row.helpAlertedId null → key "-help-"+helpId, body contains "Message: Photo upload fails"; store.helpAlerted(id, helpId)
@Test void alreadyAlertedHelpSendsNothing()            // helpAlertedId == helpId → none
```

- [ ] **Step 2: Run** the local test command with `-Dtest=ChefSignupAlertJobTest`. Expected: COMPILATION ERROR.
- [ ] **Step 3: Implement `teamEmail`, `ChefSignupAlertJob` and the YAML** as specified. Put a one-line class comment that names the replica safety: the request key makes repeats one email, and the row is written only after acceptance.
- [ ] **Step 4: Run** the local test command with `-Dtest=ChefSignupAlertJobTest+ChefSignupAlertEmailTest`. Expected: all PASS.
- [ ] **Step 5: Commit** with `git commit -m "user-chef: email Waitlist about chef sign-up progress (off until CRAVES_CHEF_SIGNUP_ALERT_EMAIL is set)"`.

---

### Task 5: Whole-service check and hand-off

**Files:** none new.

- [ ] **Step 1: Run the full user-chef suite** (the local test command with no `-Dtest`). Expected: BUILD SUCCESS, and no test that passed on `main` now fails.
- [ ] **Step 2: Check the sparse worktree is not hiding a break.**
  - Run `git -C C:\mwaitlist grep -n "DraftApplicant(" origin/main -- apps services`. Expected: Java callers only in user-chef-service.
  - The admin web reads the drafts JSON by field name, so the three added fields are ignored there.
- [ ] **Step 3: Stop and ask the owner** before pushing or opening a PR. A merge deploys to production. It ships switched off, but the V24 migration runs on deploy.
- [ ] **Step 4: Switch-on steps for the owner** are in the spec's "Switch-on" section. Repeat them in the PR description.
