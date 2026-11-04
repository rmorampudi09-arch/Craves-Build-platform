package in.craves.auth.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.auth.deletion.AccountDeletionRepository.Contact;
import in.craves.auth.deletion.AccountErasureClient.Blocker;
import in.craves.auth.deletion.AccountErasureClient.Outcome;
import in.craves.auth.deletion.AccountErasureClient.ServiceCall;
import in.craves.auth.deletion.AdminAccountDeletionController.Detail;
import in.craves.auth.deletion.AdminAccountDeletionController.OpenItems;
import in.craves.auth.deletion.AdminAccountDeletionController.Page;
import in.craves.auth.deletion.AdminAccountDeletionController.ReviewRequest;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.DeletionStep;
import in.craves.auth.deletion.DeletionModel.Phase;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.StepStatus;
import in.craves.auth.deletion.DeletionModel.Via;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.CurrentUser;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.PlatformTransactionManager;

class AdminAccountDeletionControllerTest {
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    static final String REASON = "Payouts are settled, checked with finance";
    static final String PHONE = "+919876543210";

    /** Moves when the test says so: the approval date must come from the moment of approval, not of the request. */
    static final class MovingClock extends Clock {
        volatile Instant now = NOW;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    final UUID adminId = UUID.randomUUID();
    final UUID personId = UUID.randomUUID();
    final UUID correlation = UUID.randomUUID();
    final AccountDeletionRepository deletions = mock(AccountDeletionRepository.class);
    final AuthIdentityRepository identities = mock(AuthIdentityRepository.class);
    final AuthIdentityRoleRepository roles = mock(AuthIdentityRoleRepository.class);
    final DeletionNotices notices = mock(DeletionNotices.class);
    final AccountErasureClient client = mock(AccountErasureClient.class);
    final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    final AccountDeletionProperties properties = new AccountDeletionProperties();
    final MovingClock clock = new MovingClock();
    final List<Runnable> queued = new ArrayList<>();
    AdminAccountDeletionController controller;

    @BeforeEach
    void setUp() {
        properties.setEnabled(true);
        var service = new AccountDeletionService(deletions, identities, roles, notices, client, properties, transactions, clock, queued::add);
        controller = new AdminAccountDeletionController(service, deletions, roles);
    }

    Authentication as(String... heldRoles) {
        return new UsernamePasswordAuthenticationToken(new CurrentUser(adminId, "synthetic", "+10000000000", List.of(heldRoles), 1L), null);
    }

    DeletionRequest row(RequestStatus status, Scope scope, UUID identity, Instant requestedAt, Instant dueAt) {
        return new DeletionRequest(UUID.randomUUID(), identity, scope, status, Via.APP, requestedAt, dueAt, null, null, null,
            null, null, null, null, null, null, null);
    }

    DeletionRequest pending() { return row(RequestStatus.PENDING_REVIEW, Scope.CHEF, personId, NOW.minusSeconds(3600), null); }

    /** The request as the admin finds it, then as it is after the change. */
    @SuppressWarnings("unchecked")
    void exists(DeletionRequest before, DeletionRequest... after) {
        List<Optional<DeletionRequest>> reads = new ArrayList<>();
        reads.add(Optional.of(before));
        for (DeletionRequest next : after) reads.add(Optional.of(next));
        when(deletions.find(before.id())).thenReturn(reads.get(0), reads.subList(1, reads.size()).toArray(new Optional[0]));
        when(deletions.lockOpen(before.identityId())).thenReturn(Optional.of(before));
        when(deletions.transition(eq(before.id()), eq(before.status()), any(), any())).thenReturn(true);
    }

    void everyServiceAnswers(Function<String, ServiceCall> answer) {
        when(client.blockers(anyString(), eq(personId), eq(Scope.CHEF))).thenAnswer(call -> answer.apply(call.getArgument(0)));
    }

    static ServiceCall clear() { return new ServiceCall(Outcome.DONE, Map.of(), List.of(), null); }

    static ServiceCall found(String service, String code) {
        return new ServiceCall(Outcome.DONE, Map.of(), List.of(new Blocker(service, code, "synthetic")), null);
    }

    static ServiceCall failed(String error) { return new ServiceCall(Outcome.FAILED, Map.of(), List.of(), error); }

    static Map<String, Object> columns(ArgumentCaptor<Consumer<Map<String, Object>>> captor) {
        Map<String, Object> set = new HashMap<>();
        captor.getValue().accept(set);
        return set;
    }

    static String decoded(String cursor) { return new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8); }

    static void assertRefused(Runnable call, HttpStatus status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(AuthException.class, error -> {
            assertThat(error.getStatus()).isEqualTo(status);
            assertThat(error.getCode()).isEqualTo(code);
        });
    }

    @Test
    void readersSeeTheQueueOldestFirstWithACursor() {
        var a = row(RequestStatus.PENDING_REVIEW, Scope.CHEF, UUID.randomUUID(), NOW.minusSeconds(300), null);
        var b = row(RequestStatus.SCHEDULED, Scope.ALL, UUID.randomUUID(), NOW.minusSeconds(200), NOW.plusSeconds(60));
        var c = row(RequestStatus.PENDING_REVIEW, Scope.CHEF, UUID.randomUUID(), NOW.minusSeconds(100), null);
        when(deletions.page(null, null, null, 3)).thenReturn(List.of(a, b, c));

        ResponseEntity<Page> first = controller.list(as("SUPPORT_ADMIN"), null, null, 2, REASON, correlation.toString());

        assertThat(first.getBody().items()).extracting(AdminAccountDeletionController.Summary::requestId).containsExactly(a.id(), b.id());
        assertThat(first.getBody().items().get(1).status()).isEqualTo("SCHEDULED");
        assertThat(decoded(first.getBody().nextCursor())).isEqualTo(b.requestedAt() + "|" + b.id());
        assertThat(first.getHeaders().getFirst("X-Correlation-ID")).isEqualTo(correlation.toString());
        assertThat(first.getHeaders().getCacheControl()).isEqualTo("no-store");

        when(deletions.page(null, b.requestedAt(), b.id(), 3)).thenReturn(List.of(c));
        Page second = controller.list(as("SUPPORT_ADMIN"), null, first.getBody().nextCursor(), 2, REASON, null).getBody();

        assertThat(second.items()).extracting(AdminAccountDeletionController.Summary::requestId).containsExactly(c.id());
        assertThat(second.nextCursor()).isNull();
    }

    @Test
    void theQueueFiltersByStatusDefaultsTo25AndCapsAt100() {
        when(deletions.page(any(), any(), any(), anyInt())).thenReturn(List.of());

        controller.list(as("AUDIT_ADMIN"), "WAITING_ON_OPEN_ITEMS", null, null, REASON, null);
        controller.list(as("AUDIT_ADMIN"), null, null, 5000, REASON, null);

        verify(deletions).page(RequestStatus.WAITING_ON_OPEN_ITEMS, null, null, 26);
        verify(deletions).page(null, null, null, 101);
    }

    @Test
    void theQueueRefusesBadStatusCursorAndReasonBeforeReadingAnything() {
        assertRefused(() -> controller.list(as("AUDIT_ADMIN"), "DONE", null, null, REASON, null), HttpStatus.BAD_REQUEST, "ACCOUNT_DELETION_QUERY_INVALID");
        assertRefused(() -> controller.list(as("AUDIT_ADMIN"), null, "not-a-cursor", null, REASON, null), HttpStatus.BAD_REQUEST, "ACCOUNT_DELETION_QUERY_INVALID");
        String noId = Base64.getUrlEncoder().withoutPadding().encodeToString((NOW + "|nope").getBytes(StandardCharsets.UTF_8));
        assertRefused(() -> controller.list(as("AUDIT_ADMIN"), null, noId, null, REASON, null), HttpStatus.BAD_REQUEST, "ACCOUNT_DELETION_QUERY_INVALID");
        assertRefused(() -> controller.list(as("AUDIT_ADMIN"), null, null, null, "short", null), HttpStatus.BAD_REQUEST, "ADMIN_REASON_INVALID");
        assertRefused(() -> controller.list(as("AUDIT_ADMIN"), null, null, null, null, null), HttpStatus.BAD_REQUEST, "ADMIN_REASON_INVALID");
        assertRefused(() -> controller.list(as("AUDIT_ADMIN"), null, null, null, REASON, "not-a-uuid"), HttpStatus.BAD_REQUEST, "CORRELATION_ID_INVALID");
        verifyNoInteractions(deletions);
    }

    @Test
    void detailShowsStepsAndLiveBlockers() {
        var request = row(RequestStatus.WAITING_ON_OPEN_ITEMS, Scope.ALL, personId, NOW.minusSeconds(60), NOW);
        exists(request);
        when(deletions.contact(personId)).thenReturn(new Contact(PHONE, "person@example.com"));
        when(roles.findRoleCodesByIdentityId(personId)).thenReturn(List.of("CHEF", "CUSTOMER"));
        when(deletions.steps(request.id())).thenReturn(List.of(
            new DeletionStep(request.id(), Phase.PREPARE, "subscription", StepStatus.DONE, 1, null, 0, null, NOW),
            new DeletionStep(request.id(), Phase.PREPARE, "order", StepStatus.BLOCKED, 3, "HTTP 503", null, NOW, null)));
        // order answers 503, catalog refuses with no reasons, referral is down: none of them has answered.
        when(client.blockers(anyString(), eq(personId), eq(Scope.ALL))).thenAnswer(call -> switch ((String) call.getArgument(0)) {
            case "subscription" -> found("subscription", "ACTIVE_SUBSCRIPTION");
            case "order" -> failed("HTTP 503");
            case "catalog" -> new ServiceCall(Outcome.BLOCKED, Map.of(), List.of(), null);
            case "referral" -> failed("TIMEOUT");
            default -> clear();
        });

        Detail detail = controller.detail(as("COMPLIANCE_ADMIN"), request.id(), REASON, correlation.toString()).getBody();

        assertThat(detail.request().requestId()).isEqualTo(request.id());
        assertThat(detail.request().status()).isEqualTo("WAITING_ON_OPEN_ITEMS");
        assertThat(detail.phoneLast4()).isEqualTo("3210");
        assertThat(detail.roles()).containsExactly("CHEF", "CUSTOMER");
        assertThat(detail.steps().stream().map(step -> step.service() + ":" + step.status() + ":" + step.attempts() + ":" + step.lastError()))
            .containsExactly("subscription:DONE:1:null", "order:BLOCKED:3:HTTP 503");
        assertThat(detail.blockers()).containsExactly(
            new Blocker("subscription", "ACTIVE_SUBSCRIPTION", "synthetic"),
            new Blocker("order", "SERVICE_UNREACHABLE", "HTTP 503"),
            new Blocker("referral", "SERVICE_UNREACHABLE", "TIMEOUT"),
            new Blocker("catalog", "SERVICE_UNREACHABLE", "BLOCKED"));
        verify(client, times(8)).blockers(anyString(), eq(personId), eq(Scope.ALL));
    }

    @Test
    void detailOfAnErasedAccountShowsNoPhone() {
        var request = row(RequestStatus.COMPLETED, Scope.ALL, personId, NOW.minusSeconds(60), NOW);
        exists(request);
        when(deletions.contact(personId)).thenReturn(new Contact(personId.toString().replace("-", ""), null));
        when(client.blockers(anyString(), eq(personId), eq(Scope.ALL))).thenReturn(clear());

        assertThat(controller.detail(as("AUDIT_ADMIN"), request.id(), REASON, null).getBody().phoneLast4()).isNull();
    }

    @Test
    void detailOfAnUnknownRequestIsNotFound() {
        when(deletions.find(any())).thenReturn(Optional.empty());

        assertRefused(() -> controller.detail(as("AUDIT_ADMIN"), UUID.randomUUID(), REASON, null), HttpStatus.NOT_FOUND, "NO_DELETION_REQUEST");
        verifyNoInteractions(client);
    }

    @Test
    void approveSchedulesThirtyDaysFromApproval() {
        var request = pending();
        var scheduled = row(RequestStatus.SCHEDULED, Scope.CHEF, personId, request.requestedAt(), NOW.plus(Duration.ofDays(30)));
        exists(request, scheduled);
        Instant approvedAt = NOW.plus(Duration.ofMinutes(90));
        // The answers take their time: the date must be read after them, under the lock.
        everyServiceAnswers(service -> { clock.now = approvedAt; return clear(); });

        ResponseEntity<?> response = controller.approve(as("COMPLIANCE_ADMIN"), request.id(), new ReviewRequest(REASON), correlation.toString());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((AdminAccountDeletionController.Summary) response.getBody()).status()).isEqualTo("SCHEDULED");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Consumer<Map<String, Object>>> set = ArgumentCaptor.forClass(Consumer.class);
        verify(deletions).transition(eq(request.id()), eq(RequestStatus.PENDING_REVIEW), eq(RequestStatus.SCHEDULED), set.capture());
        assertThat(columns(set)).containsOnly(entry("due_at", approvedAt.plus(Duration.ofDays(30))), entry("reviewed_by", adminId),
            entry("reviewed_at", approvedAt), entry("review_note", REASON));
        verify(identities, never()).incrementTokenVersion(any());
        verify(deletions, never()).insertSteps(any(), any(), any(), any());
        // No HTTP call runs inside the transaction: all 8 answers first, then the transaction.
        var order = inOrder(client, transactions, deletions);
        order.verify(client, times(8)).blockers(anyString(), eq(personId), eq(Scope.CHEF));
        order.verify(transactions).getTransaction(any());
        order.verify(deletions).lockOpen(personId);
        order.verify(deletions).transition(eq(request.id()), any(), any(), any());
        order.verify(transactions).commit(any());
        verify(notices, never()).approved(any());
        queued.forEach(Runnable::run);
        verify(notices).approved(scheduled);
    }

    @Test
    void approveIsRefusedWhileChefSideHasOpenItems() {
        var request = pending();
        exists(request);
        everyServiceAnswers(service -> switch (service) {
            case "catalog" -> found("catalog", "OPEN_ORDERS");
            case "subscription" -> failed("TIMEOUT");
            default -> clear();
        });

        ResponseEntity<?> response = controller.approve(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(REASON), null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        OpenItems body = (OpenItems) response.getBody();
        assertThat(body.code()).isEqualTo("ACCOUNT_DELETION_HAS_OPEN_ITEMS");
        assertThat(body.blockers()).containsExactly(new Blocker("subscription", "SERVICE_UNREACHABLE", "TIMEOUT"),
            new Blocker("catalog", "OPEN_ORDERS", "synthetic"));
        verifyNoInteractions(transactions);
        verify(deletions, never()).transition(any(), any(), any(), any());
        verify(deletions, never()).audit(any(), any(), any(), any(), any());
        assertThat(queued).isEmpty();
    }

    @Test
    void anUnreachableServiceAloneRefusesTheApproval() {
        var request = pending();
        exists(request);
        everyServiceAnswers(service -> "notification".equals(service) ? new ServiceCall(Outcome.BLOCKED, Map.of(), List.of(), null) : clear());

        assertThat(controller.approve(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(REASON), null).getStatusCode())
            .isEqualTo(HttpStatus.CONFLICT);
        verifyNoInteractions(transactions);
    }

    @Test
    void approveLosesToAKeepThatCommittedFirst() {
        var request = pending();
        exists(request);
        when(deletions.transition(eq(request.id()), any(), any(), any())).thenReturn(false);
        everyServiceAnswers(service -> clear());

        assertRefused(() -> controller.approve(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(REASON), null),
            HttpStatus.CONFLICT, "ACCOUNT_DELETION_NOT_REVIEWABLE");
        verify(deletions, never()).audit(any(), any(), any(), any(), any());
        assertThat(queued).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(value = RequestStatus.class, names = "PENDING_REVIEW", mode = EnumSource.Mode.EXCLUDE)
    void approveWorksOnPendingReviewOnly(RequestStatus status) {
        var request = row(status, Scope.CHEF, personId, NOW, null);
        exists(request);

        assertRefused(() -> controller.approve(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(REASON), null),
            HttpStatus.CONFLICT, "ACCOUNT_DELETION_NOT_REVIEWABLE");
        verifyNoInteractions(client, transactions);
    }

    @ParameterizedTest
    @EnumSource(value = RequestStatus.class, names = {"PENDING_REVIEW", "SCHEDULED", "WAITING_ON_OPEN_ITEMS"})
    void rejectNeedsAReasonAndReleases(RequestStatus status) {
        var request = row(status, Scope.CHEF, personId, NOW.minusSeconds(60), status == RequestStatus.PENDING_REVIEW ? null : NOW.plusSeconds(60));
        var rejected = row(RequestStatus.REJECTED, Scope.CHEF, personId, request.requestedAt(), request.dueAt());
        exists(request, rejected);

        assertRefused(() -> controller.reject(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest("too short"), null),
            HttpStatus.BAD_REQUEST, "ADMIN_REASON_INVALID");
        assertRefused(() -> controller.reject(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(null), null),
            HttpStatus.BAD_REQUEST, "ADMIN_REASON_INVALID");
        assertRefused(() -> controller.reject(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest("x".repeat(501)), null),
            HttpStatus.BAD_REQUEST, "ADMIN_REASON_INVALID");
        verifyNoInteractions(transactions);

        var response = controller.reject(as("COMPLIANCE_ADMIN"), request.id(), new ReviewRequest("  " + REASON + "\n"), correlation.toString());

        assertThat(response.getBody().status()).isEqualTo("REJECTED");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Consumer<Map<String, Object>>> set = ArgumentCaptor.forClass(Consumer.class);
        verify(deletions).transition(eq(request.id()), eq(status), eq(RequestStatus.REJECTED), set.capture());
        assertThat(columns(set)).containsOnly(entry("reviewed_by", adminId), entry("reviewed_at", NOW), entry("review_note", REASON));
        verify(deletions).insertSteps(request.id(), Phase.RELEASE, List.of("subscription", "catalog"), NOW);
        verify(identities).incrementTokenVersion(personId);
        verifyNoInteractions(client);
        verify(notices, never()).rejected(any());
        queued.forEach(Runnable::run);
        verify(notices).rejected(rejected);
    }

    @Test
    void rejectingACustomerRequestReleasesNothingButStillRevokesTokens() {
        var request = row(RequestStatus.SCHEDULED, Scope.CUSTOMER, personId, NOW.minusSeconds(60), NOW.plusSeconds(60));
        exists(request, row(RequestStatus.REJECTED, Scope.CUSTOMER, personId, request.requestedAt(), request.dueAt()));

        controller.reject(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(REASON), null);

        verify(deletions, never()).insertSteps(any(), any(), any(), any());
        verify(identities).incrementTokenVersion(personId);
    }

    @ParameterizedTest
    @EnumSource(value = RequestStatus.class, names = {"ERASING", "COMPLETED", "CANCELLED", "REJECTED"})
    void rejectIsRefusedOnceTheRequestIsPastReview(RequestStatus status) {
        var request = row(status, Scope.CHEF, personId, NOW, NOW);
        exists(request);

        assertRefused(() -> controller.reject(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(REASON), null),
            HttpStatus.CONFLICT, "ACCOUNT_DELETION_NOT_REVIEWABLE");
        verifyNoInteractions(transactions);
        verify(identities, never()).incrementTokenVersion(any());
    }

    @Test
    void rejectLosesToAWorkerThatStartedErasingFirst() {
        var request = row(RequestStatus.SCHEDULED, Scope.CHEF, personId, NOW, NOW);
        exists(request);
        // Under the lock the request is already ERASING, so the rejection must not go through.
        when(deletions.lockOpen(personId)).thenReturn(Optional.of(row(RequestStatus.ERASING, Scope.CHEF, personId, NOW, NOW)));

        assertRefused(() -> controller.reject(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(REASON), null),
            HttpStatus.CONFLICT, "ACCOUNT_DELETION_NOT_REVIEWABLE");
        verify(deletions, never()).transition(any(), any(), any(), any());
        verify(identities, never()).incrementTokenVersion(any());
    }

    @Test
    void supportCanReadButNotApprove() {
        var request = pending();
        exists(request);
        when(deletions.contact(personId)).thenReturn(new Contact(PHONE, null));
        when(deletions.page(any(), any(), any(), anyInt())).thenReturn(List.of());
        when(client.blockers(anyString(), any(), any())).thenReturn(clear());
        for (String reader : List.of("PLATFORM_ADMIN", "SUPPORT_ADMIN", "COMPLIANCE_ADMIN", "AUDIT_ADMIN")) {
            assertThat(controller.list(as(reader), null, null, null, REASON, null).getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(controller.detail(as(reader), request.id(), REASON, null).getStatusCode()).isEqualTo(HttpStatus.OK);
        }
        for (String other : List.of("CUSTOMER", "CHEF", "ADMIN", "PAYMENTS_ADMIN", "CHEF_ADMIN")) {
            assertRefused(() -> controller.list(as(other), null, null, null, REASON, null), HttpStatus.FORBIDDEN, "ADMIN_ROLE_REQUIRED");
            assertRefused(() -> controller.detail(as(other), request.id(), REASON, null), HttpStatus.FORBIDDEN, "ADMIN_ROLE_REQUIRED");
        }
        assertRefused(() -> controller.list(null, null, null, null, REASON, null), HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED");
        clearInvocations(client, transactions);

        for (String reader : List.of("SUPPORT_ADMIN", "AUDIT_ADMIN", "CHEF_ADMIN", "CUSTOMER")) {
            assertRefused(() -> controller.approve(as(reader), request.id(), new ReviewRequest(REASON), null), HttpStatus.FORBIDDEN, "ADMIN_ROLE_REQUIRED");
            assertRefused(() -> controller.reject(as(reader), request.id(), new ReviewRequest(REASON), null), HttpStatus.FORBIDDEN, "ADMIN_ROLE_REQUIRED");
        }
        verifyNoInteractions(client, transactions);
        verify(deletions, never()).transition(any(), any(), any(), any());
    }

    @Test
    void nobodyActsOnTheirOwnRequest() {
        var own = row(RequestStatus.PENDING_REVIEW, Scope.CHEF, adminId, NOW, null);
        exists(own);

        assertRefused(() -> controller.approve(as("PLATFORM_ADMIN"), own.id(), new ReviewRequest(REASON), null),
            HttpStatus.FORBIDDEN, "ACCOUNT_DELETION_OWN_REQUEST");
        assertRefused(() -> controller.reject(as("COMPLIANCE_ADMIN"), own.id(), new ReviewRequest(REASON), null),
            HttpStatus.FORBIDDEN, "ACCOUNT_DELETION_OWN_REQUEST");
        verifyNoInteractions(client, transactions);
        verify(deletions, never()).audit(any(), any(), any(), any(), any());
    }

    @Test
    void everyCallIsAudited() {
        var request = pending();
        var scheduled = row(RequestStatus.SCHEDULED, Scope.CHEF, personId, request.requestedAt(), NOW.plus(Duration.ofDays(30)));
        var rejected = row(RequestStatus.REJECTED, Scope.CHEF, personId, request.requestedAt(), null);
        exists(request, request, scheduled);
        when(deletions.page(any(), any(), any(), anyInt())).thenReturn(List.of(request));
        when(deletions.contact(personId)).thenReturn(new Contact(PHONE, "person@example.com"));
        when(deletions.steps(request.id())).thenReturn(List.of());
        everyServiceAnswers(service -> clear());
        ArgumentCaptor<String> details = ArgumentCaptor.forClass(String.class);

        controller.list(as("AUDIT_ADMIN"), "PENDING_REVIEW", null, null, REASON, correlation.toString());
        verify(deletions).audit(isNull(), eq("ACCOUNT_DELETION_READ"), eq(adminId), anyString(), eq(correlation));
        controller.detail(as("SUPPORT_ADMIN"), request.id(), REASON, correlation.toString());
        verify(deletions).audit(eq(personId), eq("ACCOUNT_DELETION_READ"), eq(adminId), anyString(), eq(correlation));
        controller.approve(as("PLATFORM_ADMIN"), request.id(), new ReviewRequest(REASON), correlation.toString());
        verify(deletions).audit(eq(personId), eq("ACCOUNT_DELETION_APPROVED"), eq(adminId), anyString(), eq(correlation));

        var again = pending();
        exists(again, rejected);
        controller.reject(as("COMPLIANCE_ADMIN"), again.id(), new ReviewRequest(REASON), correlation.toString());
        verify(deletions).audit(eq(personId), eq("ACCOUNT_DELETION_REJECTED"), eq(adminId), anyString(), eq(correlation));

        // One row per call, and no phone, email or free text in any of them.
        verify(deletions, times(4)).audit(any(), anyString(), any(), details.capture(), any());
        assertThat(details.getAllValues()).hasSize(4).allSatisfy(text -> assertThat(text)
            .doesNotContain(PHONE).doesNotContain("example.com").doesNotContain(REASON));
        assertThat(details.getAllValues().get(2)).contains(request.id().toString());
        assertThat(details.getAllValues().get(3)).contains(again.id().toString());
    }

    @Test
    void aMissingCorrelationIdGetsAFreshOne() {
        when(deletions.page(any(), any(), any(), anyInt())).thenReturn(List.of());
        ArgumentCaptor<UUID> id = ArgumentCaptor.forClass(UUID.class);

        var response = controller.list(as("AUDIT_ADMIN"), null, null, null, REASON, null);

        verify(deletions).audit(isNull(), eq("ACCOUNT_DELETION_READ"), eq(adminId), anyString(), id.capture());
        assertThat(response.getHeaders().getFirst("X-Correlation-ID")).isEqualTo(id.getValue().toString());
    }

    @Test
    void routesAre503WhileSwitchedOff() {
        properties.setEnabled(false);
        UUID id = UUID.randomUUID();

        assertRefused(() -> controller.list(as("PLATFORM_ADMIN"), null, null, null, REASON, null), HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_DELETION_NOT_ENABLED");
        assertRefused(() -> controller.detail(as("PLATFORM_ADMIN"), id, REASON, null), HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_DELETION_NOT_ENABLED");
        assertRefused(() -> controller.approve(as("PLATFORM_ADMIN"), id, new ReviewRequest(REASON), null), HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_DELETION_NOT_ENABLED");
        assertRefused(() -> controller.reject(as("PLATFORM_ADMIN"), id, new ReviewRequest(REASON), null), HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_DELETION_NOT_ENABLED");
        verifyNoInteractions(deletions, client, transactions, identities);
    }
}
