package in.craves.auth.deletion;

import static in.craves.auth.deletion.DeletionModel.Phase.ERASE;
import static in.craves.auth.deletion.DeletionModel.Phase.PREPARE;
import static in.craves.auth.deletion.DeletionModel.Phase.RELEASE;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.CANCELLED;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.ERASING;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.SCHEDULED;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.WAITING_ON_OPEN_ITEMS;
import static in.craves.auth.deletion.DeletionModel.StepStatus.BLOCKED;
import static in.craves.auth.deletion.DeletionModel.StepStatus.DONE;
import static in.craves.auth.deletion.DeletionModel.StepStatus.PENDING;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.deletion.AccountErasureClient.Blocker;
import in.craves.auth.deletion.AccountErasureClient.Outcome;
import in.craves.auth.deletion.AccountErasureClient.ServiceCall;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.DeletionStep;
import in.craves.auth.deletion.DeletionModel.Phase;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.StepStatus;
import in.craves.auth.deletion.DeletionModel.Via;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class AccountDeletionEngineTest {
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    static final ServiceCall OK = new ServiceCall(Outcome.DONE, Map.of(), List.of(), null);
    static final Instant LEASE_UNTIL = NOW.plus(Duration.ofMinutes(5));

    final MutableClock clock = new MutableClock(NOW);
    final AccountDeletionRepository deletions = mock(AccountDeletionRepository.class);
    final DeletionNotices notices = mock(DeletionNotices.class);
    final AccountLock lock = mock(AccountLock.class);
    final AccountDeletionProperties properties = new AccountDeletionProperties();
    final JwtProperties jwt = new JwtProperties();
    final FakeTransactions transactions = new FakeTransactions();
    final FakeClient client = new FakeClient();
    final List<UUID> claimed = new CopyOnWriteArrayList<>();
    final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    final Logger logger = (Logger) LoggerFactory.getLogger(AccountDeletionEngine.class);
    AccountDeletionEngine engine;

    @BeforeEach
    void setUp() {
        jwt.setAccessTokenTtl(Duration.ofMinutes(10));
        engine = engine();
        when(deletions.claimDue(any(), anyInt(), any(), any())).thenAnswer(call -> List.copyOf(claimed));
        when(deletions.transition(any(), any(), any(), any())).thenReturn(true);
        logs.start();
        logger.addAppender(logs);
        logger.setAdditive(false); // the expected alerts stay out of the test output
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(logs);
        logger.setAdditive(true);
    }

    AccountDeletionEngine engine() {
        return new AccountDeletionEngine(deletions, client, notices, lock, properties, jwt, transactions, clock);
    }

    @Test
    void prepareStepsRunAndRetryWithBackoff() {
        DeletionRequest request = scheduled(NOW.plus(Duration.ofDays(29)), NOW.minus(Duration.ofDays(1)));
        given(request, List.of(
            step(request, PREPARE, "advanced", PENDING, 6, NOW),
            step(request, PREPARE, "catalog", PENDING, 2, NOW.minusSeconds(1)),
            step(request, PREPARE, "integration", PENDING, 0, NOW.plusSeconds(1)),
            step(request, PREPARE, "order", PENDING, 0, null),
            step(request, PREPARE, "referral", PENDING, 9, NOW),
            step(request, PREPARE, "subscription", PENDING, 0, NOW),
            step(request, PREPARE, "user-chef", DONE, 0, null)));
        client.answers.put("prepare advanced", failed("HTTP 500"));
        client.answers.put("prepare catalog", failed("TIMEOUT"));
        client.answers.put("prepare order", failed("HTTP 503"));
        client.answers.put("prepare referral", failed("HTTP 502"));
        client.answers.put("prepare subscription", new ServiceCall(Outcome.DONE, Map.of("plans", 2), List.of(), null));

        engine.runOnce(NOW);

        assertEquals(List.of("prepare advanced", "prepare catalog", "prepare order", "prepare referral", "prepare subscription"),
            client.calls, "due steps only, never one waiting for its retry time or done");
        UUID id = request.id();
        // attempts + 1, retried after min(5 min x 2^(attempts - 1), 6 h)
        verify(deletions).recordStep(id, PREPARE, "order", PENDING, null, "HTTP 503", NOW.plus(Duration.ofMinutes(5)));
        verify(deletions).recordStep(id, PREPARE, "catalog", PENDING, null, "TIMEOUT", NOW.plus(Duration.ofMinutes(20)));
        verify(deletions).recordStep(id, PREPARE, "advanced", PENDING, null, "HTTP 500", NOW.plus(Duration.ofMinutes(320)));
        verify(deletions).recordStep(id, PREPARE, "referral", PENDING, null, "HTTP 502", NOW.plus(Duration.ofHours(6)));
        verify(deletions).recordStep(id, PREPARE, "subscription", DONE, 2, null, null);
        verify(deletions, never()).recordStep(any(), any(), eq("integration"), any(), any(), any(), any());
        verify(deletions).releaseLease(id, LEASE_UNTIL);
        verifyNoInteractions(lock, notices);
    }

    @Test
    void blockedPrepareRetriesNextDay() {
        DeletionRequest request = scheduled(NOW.plus(Duration.ofDays(29)), null);
        given(request, List.of(
            step(request, PREPARE, "catalog", BLOCKED, 0, NOW),
            step(request, PREPARE, "referral", PENDING, 3, NOW)));
        client.answers.put("prepare referral", new ServiceCall(Outcome.BLOCKED, Map.of(),
            List.of(new Blocker("referral", "FORFEIT_AWAITING_FINANCE", "")), null));

        engine.runOnce(NOW);

        verify(deletions).recordStep(request.id(), PREPARE, "referral", BLOCKED, null, null, NOW.plus(Duration.ofDays(1)));
        verify(deletions).recordStep(request.id(), PREPARE, "catalog", DONE, 0, null, null);
        assertEquals(List.of(), alerts(), "a refusal is not a failure");
    }

    @Test
    void alertFromTheFifthAttempt() {
        DeletionRequest request = scheduled(NOW.plus(Duration.ofDays(29)), null);
        given(request, List.of(
            step(request, PREPARE, "catalog", PENDING, 4, NOW),
            step(request, PREPARE, "order", PENDING, 3, NOW)));
        client.answers.put("prepare catalog", failed("HTTP 503"));
        client.answers.put("prepare order", failed("TIMEOUT"));

        engine.runOnce(NOW);

        assertEquals(List.of("CRAVES_ALERT alert=ACCOUNT_DELETION_STEP_FAILING requestId=" + request.id()
            + " phase=PREPARE service=catalog attempts=5 error=HTTP 503"), alerts());
    }

    @Test
    void dueRequestWithBlockersWaitsAndRechecksDaily() {
        DeletionRequest request = scheduled(NOW.minusSeconds(60), NOW.minus(Duration.ofDays(7)));
        given(request, allPrepared(request));
        client.answers.put("blockers order", new ServiceCall(Outcome.DONE, Map.of(),
            List.of(new Blocker("order", "ORDER_IN_PROGRESS", "1 order")), null));
        client.answers.put("blockers catalog", failed("HTTP 503"));

        engine.runOnce(NOW);

        assertEquals(AccountErasureClient.ERASE_ORDER.stream().map(service -> "blockers " + service).toList(), client.calls);
        Map<String, Object> waiting = columns(request.id(), SCHEDULED, WAITING_ON_OPEN_ITEMS);
        assertEquals(NOW.plus(Duration.ofDays(1)), waiting.get("next_check_at"));
        assertEquals("[{\"service\":\"order\",\"code\":\"ORDER_IN_PROGRESS\",\"detail\":\"1 order\"},"
            + "{\"service\":\"catalog\",\"code\":\"SERVICE_UNREACHABLE\",\"detail\":\"HTTP 503\"}]", waiting.get("blockers_json"));
        verifyNoInteractions(lock);
        verify(deletions, never()).insertSteps(any(), any(), any(), any());

        // A day later the order is delivered and catalog answers: the re-check finds nothing open.
        Instant tomorrow = NOW.plus(Duration.ofDays(1));
        DeletionRequest waitingRequest = with(request, WAITING_ON_OPEN_ITEMS, tomorrow);
        given(waitingRequest, allPrepared(request));
        client.answers.clear();
        client.calls.clear();
        clock.set(tomorrow);

        engine.runOnce(tomorrow);

        assertEquals(8, client.calls.size());
        assertEquals(tomorrow, columns(request.id(), WAITING_ON_OPEN_ITEMS, ERASING).get("locked_at"));
        verify(lock).lock(waitingRequest);
    }

    @Test
    void waitingAWeekPastDueAlerts() {
        DeletionRequest sixDays = with(scheduled(NOW.minus(Duration.ofDays(6)), NOW), WAITING_ON_OPEN_ITEMS, NOW);
        DeletionRequest sevenDays = with(scheduled(NOW.minus(Duration.ofDays(7)), NOW), WAITING_ON_OPEN_ITEMS, NOW.minusSeconds(1));
        DeletionRequest notYet = with(scheduled(NOW.minus(Duration.ofDays(30)), NOW), WAITING_ON_OPEN_ITEMS, NOW.plusSeconds(1));
        for (DeletionRequest request : List.of(sixDays, sevenDays, notYet)) given(request, allPrepared(request));
        client.answers.put("blockers referral", new ServiceCall(Outcome.DONE, Map.of(),
            List.of(new Blocker("referral", "FORFEIT_AWAITING_FINANCE", "")), null));

        engine.runOnce(NOW);

        assertEquals(List.of("CRAVES_ALERT alert=ACCOUNT_DELETION_WAITING requestId=" + sevenDays.id() + " days=7"), alerts());
        assertEquals(16, client.calls.size(), "a request whose daily re-check has not come is not checked");
        verify(deletions, never()).transition(eq(notYet.id()), any(), any(), any());
    }

    @Test
    void dueRequestWithAPrepareStepNotDoneWaits() {
        DeletionRequest request = scheduled(NOW, NOW.minus(Duration.ofDays(7)));
        given(request, allPrepared(request,
            step(request, PREPARE, "catalog", PENDING, 2, NOW.plusSeconds(600)),
            step(request, PREPARE, "order", BLOCKED, 0, NOW.plus(Duration.ofHours(3)))));

        engine.runOnce(NOW);

        assertEquals("[{\"service\":\"catalog\",\"code\":\"PREPARE_NOT_DONE\",\"detail\":\"\"},"
            + "{\"service\":\"order\",\"code\":\"PREPARE_NOT_DONE\",\"detail\":\"\"}]",
            columns(request.id(), SCHEDULED, WAITING_ON_OPEN_ITEMS).get("blockers_json"));
        verifyNoInteractions(lock);
    }

    @Test
    void dueRequestWithNothingOpenLocksAndSchedulesEraseAfterTheTokenLifetime() {
        DeletionRequest request = scheduled(NOW.minusSeconds(1), NOW.minus(Duration.ofDays(7)));
        given(request, allPrepared(request));
        List<String> seen = new CopyOnWriteArrayList<>();
        when(deletions.transition(eq(request.id()), any(), any(), any())).thenAnswer(call -> seen.add("transition " + transaction()));
        doAnswer(call -> seen.add("lock " + transaction())).when(lock).lock(any());
        doAnswer(call -> seen.add("insertSteps " + transaction())).when(deletions).insertSteps(any(), any(), any(), any());
        // Kept between the claim and the check: the move to ERASING finds another status and nothing is locked.
        DeletionRequest kept = scheduled(NOW.minusSeconds(1), NOW.minus(Duration.ofDays(7)));
        given(kept, allPrepared(kept));
        when(deletions.transition(eq(kept.id()), any(), any(), any())).thenReturn(false);

        engine.runOnce(NOW);

        assertEquals(List.of("transition active#1", "lock active#1", "insertSteps active#1"), seen,
            "the move to ERASING, the lock and the erase steps commit together, in one transaction");
        Map<String, Object> erasing = columns(request.id(), SCHEDULED, ERASING);
        assertEquals(NOW, erasing.get("locked_at"));
        assertTrue(erasing.containsKey("blockers_json"));
        assertNull(erasing.get("blockers_json"));
        var order = inOrder(deletions, lock);
        order.verify(deletions).lockOpen(request.identityId()); // the identity row first, in the same order as "keep"
        order.verify(deletions).transition(eq(request.id()), eq(SCHEDULED), eq(ERASING), any());
        order.verify(lock).lock(request);
        order.verify(deletions).insertSteps(request.id(), ERASE,
            Stream.concat(AccountErasureClient.ERASE_ORDER.stream(), Stream.of("auth")).toList(),
            NOW.plus(Duration.ofMinutes(11))); // access token lifetime (10 min here) + 1 min
        verify(lock, never()).lock(kept);
        verify(deletions, never()).insertSteps(eq(kept.id()), any(), any(), any());
    }

    @Test
    void reminderIsSentOnceSevenDaysBefore() {
        DeletionRequest due = scheduled(NOW.plus(Duration.ofDays(7)), null);
        DeletionRequest early = scheduled(NOW.plus(Duration.ofDays(7)).plusSeconds(1), null);
        DeletionRequest sent = scheduled(NOW.plus(Duration.ofDays(3)), NOW.minus(Duration.ofDays(4)));
        for (DeletionRequest request : List.of(due, early, sent)) given(request, List.of());

        engine.runOnce(NOW);

        verify(deletions).claimDue(NOW, 10, Duration.ofMinutes(5), Duration.ofDays(7));
        var order = inOrder(notices, deletions);
        order.verify(notices).reminder(due);
        order.verify(deletions).transition(eq(due.id()), eq(SCHEDULED), eq(SCHEDULED), any());
        assertEquals(Map.of("reminder_sent_at", NOW), columns(due.id(), SCHEDULED, SCHEDULED));
        verify(notices, never()).reminder(early);
        verify(notices, never()).reminder(sent);
        verify(deletions, never()).transition(eq(early.id()), any(), any(), any());
        verify(deletions, never()).transition(eq(sent.id()), any(), any(), any());
    }

    @Test
    void releaseStepsRunAfterKeep() {
        DeletionRequest kept = with(request(Scope.CHEF, SCHEDULED, NOW.plus(Duration.ofDays(20)), null), CANCELLED, null);
        given(kept, List.of(
            step(kept, PREPARE, "catalog", PENDING, 1, NOW),
            step(kept, PREPARE, "subscription", DONE, 0, null),
            step(kept, RELEASE, "catalog", PENDING, 0, NOW),
            step(kept, RELEASE, "subscription", PENDING, 0, NOW)));
        client.answers.put("release subscription", failed("HTTP 503"));

        engine.runOnce(NOW);

        assertEquals(List.of("release catalog", "release subscription"), client.calls, "a kept request prepares nothing more");
        verify(deletions).recordStep(kept.id(), RELEASE, "catalog", DONE, 0, null, null);
        verify(deletions).recordStep(kept.id(), RELEASE, "subscription", PENDING, null, "HTTP 503", NOW.plus(Duration.ofMinutes(5)));
        verify(deletions, never()).transition(any(), any(), any(), any());
        verifyNoInteractions(lock, notices);
    }

    /** Two-worker exclusion itself is the SQL claim's (AccountDeletionRepositoryDbTest.claimDueSkipsLeasedRows). */
    @Test
    void leaseIsReleasedOnlyAfterTheStepIsRecorded() throws Exception {
        DeletionRequest request = scheduled(NOW.plus(Duration.ofDays(29)), null);
        given(request, List.of(step(request, PREPARE, "order", PENDING, 0, NOW)));
        // As the SQL claim does: a leased request is not handed out again until its lease is released.
        Set<UUID> leased = ConcurrentHashMap.newKeySet();
        when(deletions.claimDue(any(), anyInt(), any(), any())).thenAnswer(call -> claimed.stream().filter(leased::add).toList());
        doAnswer(call -> leased.remove(call.<UUID>getArgument(0))).when(deletions).releaseLease(any(), any());
        CountDownLatch inCall = new CountDownLatch(1);
        CountDownLatch secondDone = new CountDownLatch(1);
        client.during = call -> {
            inCall.countDown();
            await(secondDone);
        };

        CompletableFuture<Void> first = CompletableFuture.runAsync(() -> engine.runOnce(NOW));
        await(inCall);
        engine().runOnce(NOW);
        secondDone.countDown();
        first.get(10, TimeUnit.SECONDS);

        assertEquals(List.of("prepare order"), client.calls);
        var order = inOrder(deletions);
        order.verify(deletions).recordStep(request.id(), PREPARE, "order", DONE, 0, null, null);
        order.verify(deletions).releaseLease(request.id(), LEASE_UNTIL);
        assertTrue(leased.isEmpty(), "the lease is released once the work is recorded");
    }

    @Test
    void noHttpCallInsideATransaction() {
        DeletionRequest due = scheduled(NOW, null);
        given(due, allPrepared(due, step(due, PREPARE, "order", PENDING, 0, NOW)), allPrepared(due));
        DeletionRequest soon = scheduled(NOW.plus(Duration.ofDays(3)), null);
        given(soon, List.of());
        DeletionRequest kept = with(request(Scope.ALL, SCHEDULED, NOW.plus(Duration.ofDays(9)), null), CANCELLED, null);
        given(kept, List.of(step(kept, RELEASE, "catalog", PENDING, 0, NOW)));
        doAnswer(call -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(), "notice sent inside a transaction");
            return null;
        }).when(notices).reminder(any());

        engine.runOnce(NOW);

        assertTrue(client.calls.containsAll(List.of("prepare order", "blockers order", "blockers notification", "release catalog")),
            client.calls.toString());
        verify(notices).reminder(soon);
        verify(lock).lock(due);
        assertEquals(1, transactions.begun, "only the lock opens a transaction");
    }

    @Test
    void writesUseTheTimeAfterEachCallNotTheTickStart() {
        client.during = call -> clock.advance(Duration.ofMinutes(1)); // every call takes a minute
        DeletionRequest failing = scheduled(NOW.plus(Duration.ofDays(29)), NOW);
        given(failing, List.of(step(failing, PREPARE, "catalog", PENDING, 0, NOW), step(failing, PREPARE, "order", PENDING, 0, NOW)));
        client.answers.put("prepare catalog", new ServiceCall(Outcome.BLOCKED, Map.of(), List.of(), null));
        client.answers.put("prepare order", failed("HTTP 503"));
        DeletionRequest clear = scheduled(NOW, NOW.minus(Duration.ofDays(7)));
        given(clear, allPrepared(clear));
        // The identity row can be held by a "keep" or a sign-in: the lock reads the time once it has the row.
        when(deletions.lockOpen(clear.identityId())).thenAnswer(call -> {
            clock.advance(Duration.ofMinutes(2));
            return Optional.empty();
        });

        engine.runOnce(NOW);

        verify(deletions).recordStep(failing.id(), PREPARE, "catalog", BLOCKED, null, null, NOW.plus(Duration.ofMinutes(1)).plus(Duration.ofDays(1)));
        verify(deletions).recordStep(failing.id(), PREPARE, "order", PENDING, null, "HTTP 503", NOW.plus(Duration.ofMinutes(2 + 5)));
        Instant lockedAt = NOW.plus(Duration.ofMinutes(2 + 8 + 2)); // 2 prepare calls, 8 blockers calls, the wait for the row
        assertEquals(lockedAt, columns(clear.id(), SCHEDULED, ERASING).get("locked_at"));
        verify(deletions).insertSteps(eq(clear.id()), eq(ERASE), any(), eq(lockedAt.plus(Duration.ofMinutes(11))));

        // A later tick that still started at NOW: the re-check and the reminder are dated when their calls return.
        claimed.clear();
        DeletionRequest open = scheduled(NOW, NOW.minus(Duration.ofDays(7)));
        given(open, allPrepared(open));
        client.answers.put("blockers order", new ServiceCall(Outcome.DONE, Map.of(), List.of(new Blocker("order", "ORDER_IN_PROGRESS", "")), null));
        DeletionRequest soon = scheduled(NOW.plus(Duration.ofDays(3)), null);
        given(soon, List.of());
        doAnswer(call -> clock.advance(Duration.ofMinutes(1))).when(notices).reminder(soon);

        engine.runOnce(NOW);

        assertEquals(lockedAt.plus(Duration.ofMinutes(8)).plus(Duration.ofDays(1)),
            columns(open.id(), SCHEDULED, WAITING_ON_OPEN_ITEMS).get("next_check_at"));
        assertEquals(Map.of("reminder_sent_at", lockedAt.plus(Duration.ofMinutes(9))), columns(soon.id(), SCHEDULED, SCHEDULED));
    }

    @Test
    void blockersAnsweredWithBlockedAreKept() {
        DeletionRequest request = scheduled(NOW, NOW.minus(Duration.ofDays(7)));
        given(request, allPrepared(request));
        client.answers.put("blockers referral", new ServiceCall(Outcome.BLOCKED, Map.of(),
            List.of(new Blocker("referral", "FORFEIT_AWAITING_FINANCE", "balance")), null));
        client.answers.put("blockers advanced", new ServiceCall(Outcome.BLOCKED, Map.of(), List.of(), null));

        engine.runOnce(NOW);

        assertEquals("[{\"service\":\"referral\",\"code\":\"FORFEIT_AWAITING_FINANCE\",\"detail\":\"balance\"},"
                + "{\"service\":\"advanced\",\"code\":\"SERVICE_UNREACHABLE\",\"detail\":\"BLOCKED\"}]",
            columns(request.id(), SCHEDULED, WAITING_ON_OPEN_ITEMS).get("blockers_json"),
            "a refusal keeps its reasons; a refusal with none is not an answer");
        verifyNoInteractions(lock);
    }

    @Test
    void aRequestThatFailsAlertsAndReleasesItsLease() {
        DeletionRequest broken = scheduled(NOW.plus(Duration.ofDays(29)), null);
        given(broken, List.of());
        when(deletions.steps(broken.id())).thenThrow(new IllegalStateException("synthetic +910000000000"));
        DeletionRequest next = scheduled(NOW.plus(Duration.ofDays(29)), null);
        given(next, List.of(step(next, PREPARE, "order", PENDING, 0, NOW)));

        engine.runOnce(NOW);

        assertEquals(List.of("CRAVES_ALERT alert=ACCOUNT_DELETION_REQUEST_FAILING requestId=" + broken.id() + " error=IllegalStateException"),
            alerts(), "the exception class only, never its message");
        verify(deletions).releaseLease(broken.id(), LEASE_UNTIL);
        assertEquals(List.of("prepare order"), client.calls, "the rest of the batch still runs");
    }

    @Test
    void noReminderForARequestAlreadyDue() {
        DeletionRequest late = scheduled(NOW, null);
        given(late, allPrepared(late));

        engine.runOnce(NOW);

        verifyNoInteractions(notices);
        verify(deletions, never()).transition(eq(late.id()), eq(SCHEDULED), eq(SCHEDULED), any());
        verify(lock).lock(late);
    }

    // --- helpers

    DeletionRequest request(Scope scope, RequestStatus status, Instant dueAt, Instant reminderSentAt) {
        return new DeletionRequest(UUID.randomUUID(), UUID.randomUUID(), scope, status, Via.APP, NOW.minus(Duration.ofDays(30)),
            dueAt, null, null, null, null, null, null, reminderSentAt, null, null, null);
    }

    DeletionRequest scheduled(Instant dueAt, Instant reminderSentAt) {
        return request(Scope.CUSTOMER, SCHEDULED, dueAt, reminderSentAt);
    }

    static DeletionRequest with(DeletionRequest r, RequestStatus status, Instant nextCheckAt) {
        return new DeletionRequest(r.id(), r.identityId(), r.scope(), status, r.via(), r.requestedAt(), r.dueAt(), r.reviewedBy(),
            r.reviewedAt(), r.reviewNote(), r.blockersJson(), nextCheckAt, r.lockedAt(), r.reminderSentAt(), r.finalNoticeSentAt(),
            r.completedAt(), r.cancelledAt());
    }

    static DeletionStep step(DeletionRequest request, Phase phase, String service, StepStatus status, int attempts, Instant nextAttemptAt) {
        return new DeletionStep(request.id(), phase, service, status, attempts, null, null, nextAttemptAt, null);
    }

    /** A PREPARE step per service, in the repository's order (phase, then service): {@code instead} or else done. */
    static List<DeletionStep> allPrepared(DeletionRequest request, DeletionStep... instead) {
        return AccountErasureClient.ERASE_ORDER.stream().sorted().map(service -> Stream.of(instead)
            .filter(step -> step.service().equals(service)).findFirst()
            .orElse(step(request, PREPARE, service, DONE, 0, null))).toList();
    }

    @SafeVarargs
    final void given(DeletionRequest request, List<DeletionStep> steps, List<DeletionStep>... later) {
        if (!claimed.contains(request.id())) claimed.add(request.id());
        when(deletions.find(request.id())).thenReturn(Optional.of(request));
        when(deletions.steps(request.id())).thenReturn(steps, later);
    }

    static ServiceCall failed(String error) {
        return new ServiceCall(Outcome.FAILED, Map.of(), List.of(), error);
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> columns(UUID id, RequestStatus from, RequestStatus to) {
        ArgumentCaptor<Consumer<Map<String, Object>>> captor = ArgumentCaptor.forClass(Consumer.class);
        verify(deletions).transition(eq(id), eq(from), eq(to), captor.capture());
        Map<String, Object> columns = new HashMap<>();
        captor.getValue().accept(columns);
        return columns;
    }

    List<String> alerts() {
        return logs.list.stream().filter(event -> event.getFormattedMessage().startsWith("CRAVES_ALERT"))
            .peek(event -> assertEquals(Level.ERROR, event.getLevel()))
            .map(ILoggingEvent::getFormattedMessage).toList();
    }

    String transaction() {
        return (TransactionSynchronizationManager.isActualTransactionActive() ? "active#" : "none#") + transactions.begun;
    }

    static void await(CountDownLatch latch) {
        try {
            assertTrue(latch.await(10, TimeUnit.SECONDS));
        } catch (InterruptedException error) {
            throw new IllegalStateException(error);
        }
    }

    static final class MutableClock extends Clock {
        private volatile Instant now;
        MutableClock(Instant now) { this.now = now; }
        void set(Instant at) { now = at; }
        Instant advance(Duration by) { return now = now.plus(by); }
        @Override public Instant instant() { return now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
    }

    /** A real transaction lifecycle with no database: TransactionSynchronizationManager sees it as active. */
    static class FakeTransactions extends AbstractPlatformTransactionManager {
        volatile int begun;
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) { begun++; }
        @Override protected void doCommit(DefaultTransactionStatus status) {}
        @Override protected void doRollback(DefaultTransactionStatus status) {}
    }

    /** Answers from a script (default: done, nothing open) and fails the test if called inside a transaction. */
    static class FakeClient extends AccountErasureClient {
        final List<String> calls = new CopyOnWriteArrayList<>();
        final Map<String, ServiceCall> answers = new ConcurrentHashMap<>();
        volatile Consumer<String> during = call -> {};

        FakeClient() {
            super(new AccountDeletionProperties(), Clock.fixed(NOW, ZoneOffset.UTC));
        }

        ServiceCall answer(String call) {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(), "HTTP call inside a transaction: " + call);
            calls.add(call);
            during.accept(call);
            return answers.getOrDefault(call, OK);
        }

        @Override public ServiceCall blockers(String service, UUID identityId, Scope scope) { return answer("blockers " + service); }
        @Override public ServiceCall prepare(String service, UUID requestId, UUID identityId, Scope scope) { return answer("prepare " + service); }
        @Override public ServiceCall erase(String service, UUID requestId, UUID identityId, Scope scope) { return answer("erase " + service); }
        @Override public ServiceCall release(String service, UUID requestId, UUID identityId, Scope scope) { return answer("release " + service); }
    }
}
