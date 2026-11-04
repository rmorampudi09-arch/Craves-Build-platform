package in.craves.auth.deletion;

import static org.junit.jupiter.api.Assertions.*;

import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.DeletionStep;
import in.craves.auth.deletion.DeletionModel.Phase;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.StepStatus;
import in.craves.auth.deletion.DeletionModel.Via;
import java.net.URI;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Real PostgreSQL: the unique open-request index, row locks and the SKIP LOCKED lease claim. */
@EnabledIfEnvironmentVariable(named="EMAIL_TEST_DB_URL", matches=".+")
@ResourceLock("disposable-email-auth-migration-schemas")
class AccountDeletionRepositoryDbTest {
    static final String SCHEMA = "account_deletion_test";
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    static final Duration LEAD = Duration.ofDays(7);
    static JdbcTemplate jdbc;
    static TransactionTemplate tx;
    static AccountDeletionRepository repo;

    @BeforeAll static void database() {
        var source = migratedSchema(SCHEMA);
        jdbc = new JdbcTemplate(source);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        repo = new AccountDeletionRepository(jdbc);
    }

    /** A freshly migrated schema on the disposable CI database; anything else is refused. Callers hold the resource lock. */
    static DriverManagerDataSource migratedSchema(String schema) {
        String url = System.getenv("EMAIL_TEST_DB_URL");
        URI uri = URI.create(url.substring("jdbc:".length()));
        if (!("true".equals(System.getenv("GITHUB_ACTIONS")) || "True".equalsIgnoreCase(System.getenv("TF_BUILD"))) || !"true".equals(System.getenv("EMAIL_TEST_DISPOSABLE")) || !"postgresql".equals(uri.getScheme()) ||
            !List.of("localhost", "127.0.0.1").contains(uri.getHost()) || !"/craves_email_test".equals(uri.getPath()) ||
            uri.getQuery() != null || uri.getUserInfo() != null || uri.getFragment() != null)
            throw new IllegalStateException("Only the explicitly disposable CI PostgreSQL service is allowed");
        var admin = new JdbcTemplate(new DriverManagerDataSource(url, System.getenv("EMAIL_TEST_DB_USER"), System.getenv("EMAIL_TEST_DB_PASSWORD")));
        // V7 and V9 own objects outside Flyway's default schema; reset them only after the disposable DB guard.
        admin.execute("DROP SCHEMA IF EXISTS academy_schema CASCADE");
        admin.execute("DROP TABLE IF EXISTS public.admin_explorer_admission CASCADE");
        admin.execute("DROP TABLE IF EXISTS public.admin_explorer_audit CASCADE");
        admin.execute("DROP FUNCTION IF EXISTS public.reject_admin_explorer_audit_mutation()");
        admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        admin.execute("CREATE SCHEMA " + schema);
        var source = new DriverManagerDataSource(url + "?currentSchema=" + schema, System.getenv("EMAIL_TEST_DB_USER"), System.getenv("EMAIL_TEST_DB_PASSWORD"));
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load().migrate();
        return source;
    }

    @BeforeEach void clean() {
        jdbc.execute("DELETE FROM account_deletion_step");
        jdbc.execute("DELETE FROM account_deletion_request");
    }

    static UUID identity() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth_identity(id,firebase_uid,phone_number) VALUES(?,?,?)", id, "synthetic-" + id, "s-" + id.toString().substring(0, 25));
        return id;
    }

    static DeletionRequest scheduled(Instant requestedAt, Instant dueAt) {
        return repo.insert(identity(), Scope.CUSTOMER, RequestStatus.SCHEDULED, Via.APP, requestedAt, dueAt);
    }

    @Test void oneOpenRequestPerIdentity() {
        UUID id = identity();
        DeletionRequest first = repo.insert(id, Scope.CUSTOMER, RequestStatus.SCHEDULED, Via.APP, NOW, NOW.plus(30, ChronoUnit.DAYS));
        assertEquals(first, repo.findOpen(id).orElseThrow());
        assertEquals(first, repo.find(first.id()).orElseThrow());
        assertThrows(DuplicateKeyException.class, () -> repo.insert(id, Scope.CHEF, RequestStatus.PENDING_REVIEW, Via.WEB, NOW, null));

        assertTrue(repo.transition(first.id(), RequestStatus.SCHEDULED, RequestStatus.CANCELLED, m -> m.put("cancelled_at", NOW)));
        assertTrue(repo.findOpen(id).isEmpty());
        DeletionRequest second = repo.insert(id, Scope.CHEF, RequestStatus.PENDING_REVIEW, Via.WEB, NOW.plusSeconds(1), null);
        assertEquals(second, repo.findOpen(id).orElseThrow());
        assertEquals(second, repo.findLatest(id).orElseThrow());
        assertNull(second.dueAt());
    }

    @Test void concurrentRequestsLeaveOneOpenRequest() throws Exception {
        UUID id = identity();
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        List<Callable<Void>> askers = new ArrayList<>();
        for (int i = 0; i < 2; i++) askers.add(() -> {
            start.await();
            tx.executeWithoutResult(s -> {
                if (repo.lockOpen(id).isEmpty()) {
                    // Hold the lock long enough that the other thread is certainly waiting on it.
                    try { Thread.sleep(300); } catch (InterruptedException e) { throw new IllegalStateException(e); }
                    repo.insert(id, Scope.CUSTOMER, RequestStatus.SCHEDULED, Via.APP, NOW, NOW.plus(30, ChronoUnit.DAYS));
                }
            });
            return null;
        });
        List<Future<Void>> results = new ArrayList<>();
        for (var asker : askers) results.add(pool.submit(asker));
        start.countDown();
        for (var result : results) result.get(30, TimeUnit.SECONDS);
        pool.shutdownNow();
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM account_deletion_request WHERE identity_id=?", Integer.class, id));
    }

    @Test void claimDueSkipsLeasedRows() {
        for (int i = 0; i < 4; i++) scheduled(NOW.minus(40, ChronoUnit.DAYS), NOW.minusSeconds(60));
        scheduled(NOW.minus(1, ChronoUnit.DAYS), NOW.plus(29, ChronoUnit.DAYS)); // not due, reminder not due either
        Duration lease = Duration.ofMinutes(5);

        List<UUID> a = repo.claimDue(NOW, 2, lease, LEAD), b = repo.claimDue(NOW, 2, lease, LEAD);
        assertEquals(2, a.size());
        assertEquals(2, b.size());
        assertTrue(new HashSet<>(a).stream().noneMatch(b::contains), "claimers must get disjoint ids");
        assertTrue(repo.claimDue(NOW.plusSeconds(60), 10, lease, LEAD).isEmpty(), "leased rows are skipped");
        repo.releaseLease(a.get(0), NOW.plus(lease));
        assertEquals(List.of(a.get(0)), repo.claimDue(NOW.plusSeconds(60), 10, lease, LEAD), "a released lease is claimable at once");
        Instant later = NOW.plus(6, ChronoUnit.MINUTES);
        assertEquals(4, repo.claimDue(later, 10, lease, LEAD).size(), "an expired lease is claimable again");
        // The first worker overran its lease and releases late: the second worker's newer lease stands.
        repo.releaseLease(b.get(0), NOW.plus(lease));
        assertTrue(repo.claimDue(later.plusSeconds(60), 10, lease, LEAD).isEmpty(), "a stale release frees nothing");
        repo.releaseLease(b.get(0), later.plus(lease));
        assertEquals(List.of(b.get(0)), repo.claimDue(later.plusSeconds(60), 10, lease, LEAD));

        // A row another transaction holds locked is skipped, not waited for: a busy request never stalls the worker.
        jdbc.execute("UPDATE account_deletion_request SET lease_until = NULL");
        UUID busy = jdbc.queryForObject("SELECT id FROM account_deletion_request WHERE due_at < ? LIMIT 1", UUID.class, Timestamp.from(NOW));
        List<UUID> others = tx.execute(s -> {
            jdbc.queryForList("SELECT id FROM account_deletion_request WHERE id = ? FOR UPDATE", busy);
            return CompletableFuture.supplyAsync(() -> repo.claimDue(NOW, 10, lease, LEAD)).orTimeout(10, TimeUnit.SECONDS).join();
        });
        assertEquals(3, others.size());
        assertFalse(others.contains(busy));
    }

    @Test void claimDueFindsEveryKindOfWork() {
        Duration lease = Duration.ofMinutes(5);
        UUID reminder = scheduled(NOW.minus(24, ChronoUnit.DAYS), NOW.plus(6, ChronoUnit.DAYS)).id();
        UUID reminded = scheduled(NOW.minus(24, ChronoUnit.DAYS), NOW.plus(6, ChronoUnit.DAYS)).id();
        repo.transition(reminded, RequestStatus.SCHEDULED, RequestStatus.SCHEDULED, m -> m.put("reminder_sent_at", NOW));
        DeletionRequest waiting = scheduled(NOW.minus(40, ChronoUnit.DAYS), NOW.minus(1, ChronoUnit.DAYS));
        repo.transition(waiting.id(), RequestStatus.SCHEDULED, RequestStatus.WAITING_ON_OPEN_ITEMS, m -> m.put("next_check_at", NOW.plusSeconds(3600)));
        UUID withStep = scheduled(NOW.minus(1, ChronoUnit.DAYS), NOW.plus(29, ChronoUnit.DAYS)).id();
        repo.insertSteps(withStep, Phase.PREPARE, List.of("order"), NOW.minusSeconds(1));
        UUID stepLater = scheduled(NOW.minus(1, ChronoUnit.DAYS), NOW.plus(29, ChronoUnit.DAYS)).id();
        repo.insertSteps(stepLater, Phase.PREPARE, List.of("order"), NOW.plusSeconds(600));

        assertEquals(List.of(withStep), repo.claimDue(NOW, 10, lease, Duration.ofDays(5)), "the reminder lead is the caller's");
        jdbc.execute("UPDATE account_deletion_request SET lease_until = NULL");
        assertEquals(new HashSet<>(List.of(reminder, withStep)), new HashSet<>(repo.claimDue(NOW, 10, lease, LEAD)));
        // The worker has handled both; later: the daily re-check of a blocked request and a step after its backoff.
        repo.transition(reminder, RequestStatus.SCHEDULED, RequestStatus.SCHEDULED, m -> m.put("reminder_sent_at", NOW));
        repo.recordStep(withStep, Phase.PREPARE, "order", StepStatus.DONE, null, null, null);
        assertEquals(new HashSet<>(List.of(waiting.id(), stepLater)), new HashSet<>(repo.claimDue(NOW.plusSeconds(3601 + 600), 10, lease, LEAD)));
    }

    @Test void claimDueFindsErasingRequestsThatNoStepWillWake() {
        Duration lease = Duration.ofMinutes(5);
        UUID allDone = erasing();
        repo.insertSteps(allDone, Phase.ERASE, List.of("order", "auth"), NOW);
        repo.recordStep(allDone, Phase.ERASE, "order", StepStatus.DONE, 1, null, null);
        repo.recordStep(allDone, Phase.ERASE, "auth", StepStatus.DONE, 1, null, null);
        UUID noSteps = erasing();
        UUID waitingOnBackoff = erasing();
        repo.insertSteps(waitingOnBackoff, Phase.ERASE, List.of("order"), NOW.plusSeconds(600));
        UUID waitingOnBlocked = erasing();
        repo.insertSteps(waitingOnBlocked, Phase.ERASE, List.of("order"), NOW.plusSeconds(600));
        repo.recordStep(waitingOnBlocked, Phase.ERASE, "order", StepStatus.BLOCKED, null, null, NOW.plus(1, ChronoUnit.DAYS));

        assertEquals(new HashSet<>(List.of(allDone, noSteps)), new HashSet<>(repo.claimDue(NOW, 10, lease, LEAD)),
            "crashed after the last step or before the first one: claimed; a step that is merely waiting: not");
    }

    @Test void claimDueTreatsNullTimesAsDueNow() {
        Duration lease = Duration.ofMinutes(5);
        UUID nullStep = scheduled(NOW.minus(1, ChronoUnit.DAYS), NOW.plus(29, ChronoUnit.DAYS)).id();
        repo.insertSteps(nullStep, Phase.PREPARE, List.of("order"), null);
        DeletionRequest nullCheck = scheduled(NOW.minus(40, ChronoUnit.DAYS), NOW.minus(1, ChronoUnit.DAYS));
        repo.transition(nullCheck.id(), RequestStatus.SCHEDULED, RequestStatus.WAITING_ON_OPEN_ITEMS, m -> {});

        assertEquals(new HashSet<>(List.of(nullStep, nullCheck.id())), new HashSet<>(repo.claimDue(NOW, 10, lease, LEAD)));
    }

    @Test void closedRequestsKeepOnlyReleaseAndSweepWorkClaimable() {
        Duration lease = Duration.ofMinutes(5);
        UUID cancelledRelease = closed(RequestStatus.CANCELLED, Phase.RELEASE, StepStatus.PENDING);
        UUID completedSweep = closed(RequestStatus.COMPLETED, Phase.SWEEP, StepStatus.BLOCKED);
        closed(RequestStatus.CANCELLED, Phase.PREPARE, StepStatus.PENDING);
        closed(RequestStatus.REJECTED, Phase.PREPARE, StepStatus.BLOCKED);
        closed(RequestStatus.COMPLETED, Phase.ERASE, StepStatus.PENDING);

        assertEquals(new HashSet<>(List.of(cancelledRelease, completedSweep)), new HashSet<>(repo.claimDue(NOW, 10, lease, LEAD)));
    }

    UUID erasing() {
        return repo.insert(identity(), Scope.CUSTOMER, RequestStatus.ERASING, Via.APP, NOW.minus(31, ChronoUnit.DAYS), NOW.minus(1, ChronoUnit.DAYS)).id();
    }

    /** A request in a closed status with one step of the given phase, due since a minute ago. */
    UUID closed(RequestStatus status, Phase phase, StepStatus stepStatus) {
        UUID id = repo.insert(identity(), Scope.CUSTOMER, status, Via.APP, NOW.minus(31, ChronoUnit.DAYS), NOW.minus(1, ChronoUnit.DAYS)).id();
        repo.insertSteps(id, phase, List.of("order"), NOW.minusSeconds(60));
        if (stepStatus != StepStatus.PENDING) repo.recordStep(id, phase, "order", stepStatus, null, null, NOW.minusSeconds(60));
        return id;
    }

    @Test void stepsAreInsertedOnceAndRecorded() {
        UUID id = scheduled(NOW, NOW.plus(30, ChronoUnit.DAYS)).id();
        repo.insertSteps(id, Phase.PREPARE, List.of("subscription", "order"), NOW);
        repo.insertSteps(id, Phase.PREPARE, List.of("subscription", "order"), NOW.plusSeconds(99));
        repo.insertSteps(id, Phase.SWEEP, List.of("notification"), NOW);
        repo.insertSteps(id, Phase.ERASE, List.of("order"), NOW);
        repo.insertSteps(id, Phase.RELEASE, List.of("catalog"), NOW);
        assertEquals(List.of("PREPARE order", "PREPARE subscription", "ERASE order", "RELEASE catalog", "SWEEP notification"),
            repo.steps(id).stream().map(s -> s.phase() + " " + s.service()).toList(), "lifecycle order, not alphabetical");
        DeletionStep order = step(id, Phase.PREPARE, "order");
        assertEquals(StepStatus.PENDING, order.status());
        assertEquals(0, order.attempts());
        assertEquals(NOW, order.nextAttemptAt(), "the second insert must not overwrite the first");

        Instant retry = NOW.plus(5, ChronoUnit.MINUTES);
        repo.recordStep(id, Phase.PREPARE, "order", StepStatus.PENDING, null, "HTTP 503", retry);
        repo.recordStep(id, Phase.PREPARE, "order", StepStatus.PENDING, null, "x".repeat(400), retry.plusSeconds(60));
        order = step(id, Phase.PREPARE, "order");
        assertEquals(2, order.attempts());
        assertEquals(300, order.lastError().length());
        assertEquals(retry.plusSeconds(60), order.nextAttemptAt());
        assertNull(order.completedAt());

        repo.recordStep(id, Phase.PREPARE, "order", StepStatus.BLOCKED, null, null, NOW.plus(1, ChronoUnit.DAYS));
        assertEquals(StepStatus.BLOCKED, step(id, Phase.PREPARE, "order").status());
        assertEquals(2, step(id, Phase.PREPARE, "order").attempts(), "a blocked answer is not a failed attempt");

        repo.recordStep(id, Phase.PREPARE, "order", StepStatus.DONE, 7, null, null);
        order = step(id, Phase.PREPARE, "order");
        assertEquals(StepStatus.DONE, order.status());
        assertEquals(7, order.erasedCount());
        assertNull(order.lastError());
        assertNull(order.nextAttemptAt());
        assertNotNull(order.completedAt());
        assertEquals(StepStatus.PENDING, step(id, Phase.PREPARE, "subscription").status(), "other steps are untouched");
        assertEquals(StepStatus.PENDING, step(id, Phase.ERASE, "order").status(), "same service, other phase is untouched");
        assertThrows(IllegalStateException.class, () -> repo.recordStep(id, Phase.SWEEP, "order", StepStatus.DONE, null, null, null));
        assertThrows(Exception.class, () -> repo.insertSteps(id, Phase.PREPARE, List.of("nonsense"), NOW));
    }

    @Test void recordStepNeverUndoesADoneStep() {
        UUID id = scheduled(NOW, NOW.plus(30, ChronoUnit.DAYS)).id();
        repo.insertSteps(id, Phase.PREPARE, List.of("order"), NOW);
        repo.recordStep(id, Phase.PREPARE, "order", StepStatus.DONE, 7, null, null);
        DeletionStep done = step(id, Phase.PREPARE, "order");

        // A worker that overran its lease records its late answer after another worker finished the step.
        repo.recordStep(id, Phase.PREPARE, "order", StepStatus.PENDING, null, "HTTP 503", NOW.plus(5, ChronoUnit.MINUTES));
        repo.recordStep(id, Phase.PREPARE, "order", StepStatus.BLOCKED, null, null, NOW.plus(1, ChronoUnit.DAYS));
        repo.recordStep(id, Phase.PREPARE, "order", StepStatus.DONE, 9, null, null);

        assertEquals(done, step(id, Phase.PREPARE, "order"));
    }

    static DeletionStep step(UUID id, Phase phase, String service) {
        return repo.steps(id).stream().filter(s -> s.phase() == phase && s.service().equals(service)).findFirst().orElseThrow();
    }

    @Test void hasErasingCustomerSideOnlyForCustomerOrAllWhileErasing() {
        assertTrue(erasing(Scope.CUSTOMER, RequestStatus.ERASING));
        assertTrue(erasing(Scope.ALL, RequestStatus.ERASING));
        assertFalse(erasing(Scope.CHEF, RequestStatus.ERASING));
        assertFalse(erasing(Scope.CUSTOMER, RequestStatus.SCHEDULED));
        assertFalse(erasing(Scope.ALL, RequestStatus.WAITING_ON_OPEN_ITEMS));
        assertFalse(erasing(Scope.CUSTOMER, RequestStatus.COMPLETED));
        assertFalse(repo.hasErasingCustomerSide(identity()));
    }

    boolean erasing(Scope scope, RequestStatus status) {
        UUID id = identity();
        repo.insert(id, scope, status, Via.APP, NOW, NOW);
        return repo.hasErasingCustomerSide(id);
    }

    @Test void transitionMovesOnlyFromTheExpectedStatusAndOnlyKnownColumns() {
        UUID reviewer = identity();
        DeletionRequest pending = repo.insert(identity(), Scope.CHEF, RequestStatus.PENDING_REVIEW, Via.APP, NOW, null);
        Instant due = NOW.plus(30, ChronoUnit.DAYS);

        assertFalse(repo.transition(pending.id(), RequestStatus.SCHEDULED, RequestStatus.ERASING, m -> {}), "wrong from-status changes nothing");
        assertEquals(RequestStatus.PENDING_REVIEW, repo.find(pending.id()).orElseThrow().status());
        assertThrows(IllegalArgumentException.class, () -> repo.transition(pending.id(), RequestStatus.PENDING_REVIEW, RequestStatus.SCHEDULED, m -> m.put("identity_id", reviewer)));
        assertThrows(IllegalArgumentException.class, () -> repo.transition(pending.id(), RequestStatus.PENDING_REVIEW, RequestStatus.SCHEDULED, m -> m.put("status = 'COMPLETED', due_at", due)));

        assertTrue(repo.transition(pending.id(), RequestStatus.PENDING_REVIEW, RequestStatus.SCHEDULED, m -> {
            m.put("due_at", due); m.put("reviewed_by", reviewer); m.put("reviewed_at", NOW); m.put("review_note", "ok"); m.put("blockers_json", "[]");
        }));
        DeletionRequest approved = repo.find(pending.id()).orElseThrow();
        assertEquals(RequestStatus.SCHEDULED, approved.status());
        assertEquals(due, approved.dueAt());
        assertEquals(reviewer, approved.reviewedBy());
        assertEquals(NOW, approved.reviewedAt());
        assertEquals("ok", approved.reviewNote());
        assertEquals("[]", approved.blockersJson());

        assertTrue(repo.transition(pending.id(), RequestStatus.SCHEDULED, RequestStatus.WAITING_ON_OPEN_ITEMS, m -> m.put("blockers_json", null)));
        assertNull(repo.find(pending.id()).orElseThrow().blockersJson());
    }

    @Test void pageIsOldestFirstWithAKeysetCursor() {
        DeletionRequest a = scheduled(NOW, NOW), b = scheduled(NOW.plusSeconds(1), NOW), c = scheduled(NOW.plusSeconds(2), NOW);
        repo.transition(b.id(), RequestStatus.SCHEDULED, RequestStatus.CANCELLED, m -> {});

        List<DeletionRequest> first = repo.page(null, null, null, 2);
        assertEquals(List.of(a.id(), b.id()), first.stream().map(DeletionRequest::id).toList());
        List<DeletionRequest> next = repo.page(null, first.get(1).requestedAt(), first.get(1).id(), 2);
        assertEquals(List.of(c.id()), next.stream().map(DeletionRequest::id).toList());
        assertEquals(List.of(b.id()), repo.page(RequestStatus.CANCELLED, null, null, 10).stream().map(DeletionRequest::id).toList());
    }

    @Test void auditWritesOneAuthAuditRowForAPersonOrForTheQueue() {
        UUID actor = identity(), person = identity(), correlation = UUID.randomUUID();

        repo.audit(person, "ACCOUNT_DELETION_APPROVED", actor, "requestId=r;scope=CHEF", correlation);
        repo.audit(null, "ACCOUNT_DELETION_READ", actor, "status=ANY;count=2", correlation);

        var rows = jdbc.queryForList("SELECT identity_id, action, actor_identity_id, details FROM auth_audit WHERE correlation_id = ? ORDER BY action",
            correlation.toString());
        assertEquals(2, rows.size());
        assertEquals(person, rows.get(0).get("identity_id"));
        assertEquals("ACCOUNT_DELETION_APPROVED", rows.get(0).get("action"));
        assertEquals(actor, rows.get(0).get("actor_identity_id"));
        assertEquals("requestId=r;scope=CHEF", rows.get(0).get("details"));
        assertNull(rows.get(1).get("identity_id"));
        assertEquals("status=ANY;count=2", rows.get(1).get("details"));
    }
}
