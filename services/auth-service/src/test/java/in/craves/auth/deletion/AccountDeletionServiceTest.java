package in.craves.auth.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.auth.api.IdentityResponse.PendingDeletion;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.Phase;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.CurrentUser;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;

class AccountDeletionServiceTest {
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");

    final UUID identityId = UUID.randomUUID();
    final AccountDeletionRepository deletions = mock(AccountDeletionRepository.class);
    final AuthIdentityRepository identities = mock(AuthIdentityRepository.class);
    final AuthIdentityRoleRepository roles = mock(AuthIdentityRoleRepository.class);
    final DeletionNotices notices = mock(DeletionNotices.class);
    final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    final AccountDeletionProperties properties = new AccountDeletionProperties();
    final List<Runnable> queued = new ArrayList<>();
    final CurrentUser user = new CurrentUser(identityId, "synthetic", "+10000000000", List.of("CUSTOMER"), 1L);
    AccountDeletionService service;

    @BeforeEach
    void setUp() {
        properties.setEnabled(true);
        service = serviceWith(queued::add);
        when(roles.findRoleCodesByIdentityId(identityId)).thenReturn(List.of("CUSTOMER"));
        when(deletions.lockOpen(identityId)).thenReturn(Optional.empty());
        when(deletions.insert(eq(identityId), any(), any(), any(), any(), any())).thenAnswer(call ->
            row(call.getArgument(1), call.getArgument(2), call.getArgument(5)));
    }

    AccountDeletionService serviceWith(Executor executor) {
        return new AccountDeletionService(deletions, identities, roles, notices, properties, transactions,
            Clock.fixed(NOW, ZoneOffset.UTC), executor);
    }

    DeletionRequest row(Scope scope, RequestStatus status, Instant dueAt) {
        return new DeletionRequest(UUID.randomUUID(), identityId, scope, status, Via.APP, NOW, dueAt, null, null, null,
            null, null, null, null, null, null, null);
    }

    @Test
    void customerRequestIsScheduledThirtyDaysOut() {
        var result = service.request(user, Scope.CUSTOMER, Via.WEB);

        assertThat(result.created()).isTrue();
        assertThat(result.view().scope()).isEqualTo("CUSTOMER");
        assertThat(result.view().status()).isEqualTo("SCHEDULED");
        assertThat(result.view().dueAt()).isEqualTo(NOW.plus(Duration.ofDays(30)));
        assertThat(result.view().requestedAt()).isEqualTo(NOW);
        verify(deletions).insert(identityId, Scope.CUSTOMER, RequestStatus.SCHEDULED, Via.WEB, NOW, NOW.plus(Duration.ofDays(30)));
    }

    @Test
    void chefRequestWaitsForReview() {
        when(roles.findRoleCodesByIdentityId(identityId)).thenReturn(List.of("CHEF", "CUSTOMER"));

        var result = service.request(user, Scope.CHEF, Via.APP);

        assertThat(result.view().status()).isEqualTo("PENDING_REVIEW");
        assertThat(result.view().dueAt()).isNull();
        verify(deletions).insert(identityId, Scope.CHEF, RequestStatus.PENDING_REVIEW, Via.APP, NOW, null);
        queued.forEach(Runnable::run);
        verify(notices).requested(any(), eq(true));
    }

    @Test
    void allWithoutChefRoleNeedsNoReview() {
        var result = service.request(user, Scope.ALL, Via.APP);

        assertThat(result.view().status()).isEqualTo("SCHEDULED");
        queued.forEach(Runnable::run);
        verify(notices).requested(any(), eq(false));
    }

    @Test
    void allWithChefRoleWaitsForReview() {
        when(roles.findRoleCodesByIdentityId(identityId)).thenReturn(List.of("CHEF", "CUSTOMER"));

        assertThat(service.request(user, Scope.ALL, Via.APP).view().status()).isEqualTo("PENDING_REVIEW");
    }

    @Test
    void sameScopeTwiceReturnsTheOpenRequest() {
        DeletionRequest open = row(Scope.CUSTOMER, RequestStatus.SCHEDULED, NOW.plusSeconds(60));
        when(deletions.lockOpen(identityId)).thenReturn(Optional.of(open));

        var result = service.request(user, Scope.CUSTOMER, Via.APP);

        assertThat(result.created()).isFalse();
        assertThat(result.view().requestId()).isEqualTo(open.id());
        verify(deletions, never()).insert(any(), any(), any(), any(), any(), any());
        verify(identities, never()).incrementTokenVersion(any());
        assertThat(queued).isEmpty();
    }

    @Test
    void otherScopeWhileOpenIsRefused() {
        when(deletions.lockOpen(identityId)).thenReturn(Optional.of(row(Scope.CUSTOMER, RequestStatus.SCHEDULED, NOW)));

        assertRefused(() -> service.request(user, Scope.ALL, Via.APP), HttpStatus.CONFLICT, "ACCOUNT_DELETION_ALREADY_REQUESTED");
        verify(deletions, never()).insert(any(), any(), any(), any(), any(), any());
    }

    @Test
    void riderCannotAskForWholeAccount() {
        when(roles.findRoleCodesByIdentityId(identityId)).thenReturn(List.of("CUSTOMER", "RIDER"));

        assertRefused(() -> service.request(user, Scope.ALL, Via.APP), HttpStatus.CONFLICT, "ACCOUNT_DELETION_SCOPE_NOT_ALLOWED");
        verify(deletions, never()).insert(any(), any(), any(), any(), any(), any());
    }

    @Test
    void riderCanStillAskForTheCustomerSide() {
        when(roles.findRoleCodesByIdentityId(identityId)).thenReturn(List.of("CUSTOMER", "RIDER"));

        assertThat(service.request(user, Scope.CUSTOMER, Via.APP).view().status()).isEqualTo("SCHEDULED");
    }

    @Test
    void customerCannotAskForChefSide() {
        assertRefused(() -> service.request(user, Scope.CHEF, Via.APP), HttpStatus.CONFLICT, "ACCOUNT_DELETION_SCOPE_NOT_ALLOWED");
        verify(deletions, never()).insert(any(), any(), any(), any(), any(), any());
    }

    @Test
    void requestBumpsTokenVersionAndInsertsEightPrepareSteps() {
        var result = service.request(user, Scope.CUSTOMER, Via.APP);

        assertThat(AccountErasureClient.ERASE_ORDER).hasSize(8);
        verify(deletions).insertSteps(result.view().requestId(), Phase.PREPARE, AccountErasureClient.ERASE_ORDER, NOW);
        verify(identities).incrementTokenVersion(identityId);
    }

    @Test
    void noticesGoOutAfterCommitAndOffTheRequestThread() {
        serviceWith(Runnable::run).request(user, Scope.CUSTOMER, Via.APP);

        var order = inOrder(transactions, notices);
        order.verify(transactions).commit(any());
        order.verify(notices).requested(any(), eq(false));

        service.request(user, Scope.CUSTOMER, Via.APP);
        assertThat(queued).hasSize(1);
    }

    @Test
    void aFullNoticeQueueDoesNotFailTheRequest() {
        var full = serviceWith(task -> { throw new RejectedExecutionException("full"); });

        assertThatCode(() -> full.request(user, Scope.CUSTOMER, Via.APP)).doesNotThrowAnyException();
        verify(notices, never()).requested(any(), anyBoolean());
    }

    @ParameterizedTest
    @EnumSource(value = Scope.class, names = {"CHEF", "ALL"})
    void keepCancelsAndQueuesReleaseForChefScopes(Scope scope) {
        DeletionRequest open = row(scope, RequestStatus.PENDING_REVIEW, null);
        when(deletions.lockOpen(identityId)).thenReturn(Optional.of(open));
        when(deletions.transition(eq(open.id()), eq(RequestStatus.PENDING_REVIEW), eq(RequestStatus.CANCELLED), any())).thenReturn(true);
        when(deletions.find(open.id())).thenReturn(Optional.of(row(scope, RequestStatus.CANCELLED, null)));

        var view = service.keep(user);

        assertThat(view.status()).isEqualTo("CANCELLED");
        verify(deletions).insertSteps(open.id(), Phase.RELEASE, List.of("subscription", "catalog"), NOW);
        verify(identities).incrementTokenVersion(identityId);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Consumer<Map<String, Object>>> columns = ArgumentCaptor.forClass(Consumer.class);
        verify(deletions).transition(eq(open.id()), eq(RequestStatus.PENDING_REVIEW), eq(RequestStatus.CANCELLED), columns.capture());
        Map<String, Object> set = new HashMap<>();
        columns.getValue().accept(set);
        assertThat(set).containsOnly(Map.entry("cancelled_at", NOW));
    }

    @Test
    void keepOnACustomerRequestQueuesNoReleaseButStillRevokesTokens() {
        DeletionRequest open = row(Scope.CUSTOMER, RequestStatus.SCHEDULED, NOW.plusSeconds(60));
        when(deletions.lockOpen(identityId)).thenReturn(Optional.of(open));
        when(deletions.transition(eq(open.id()), eq(RequestStatus.SCHEDULED), eq(RequestStatus.CANCELLED), any())).thenReturn(true);
        when(deletions.find(open.id())).thenReturn(Optional.of(row(Scope.CUSTOMER, RequestStatus.CANCELLED, null)));

        service.keep(user);

        verify(deletions, never()).insertSteps(any(), any(), any(), any());
        verify(identities).incrementTokenVersion(identityId);
    }

    @Test
    void keepWhileErasingIsRefused() {
        when(deletions.lockOpen(identityId)).thenReturn(Optional.of(row(Scope.CUSTOMER, RequestStatus.ERASING, NOW)));

        assertRefused(() -> service.keep(user), HttpStatus.CONFLICT, "ACCOUNT_DELETION_IN_PROGRESS");
        verify(deletions, never()).transition(any(), any(), any(), any());
        verify(identities, never()).incrementTokenVersion(any());
    }

    @Test
    void keepWithNothingOpenIsNotFound() {
        assertRefused(() -> service.keep(user), HttpStatus.NOT_FOUND, "NO_DELETION_REQUEST");
    }

    @Test
    void currentShowsTheLatestRequestOfAnyStatus() {
        when(deletions.findLatest(identityId)).thenReturn(Optional.of(row(Scope.CUSTOMER, RequestStatus.CANCELLED, NOW)));

        assertThat(service.current(identityId).status()).isEqualTo("CANCELLED");
    }

    @Test
    void currentWithNoRequestIsNotFound() {
        when(deletions.findLatest(identityId)).thenReturn(Optional.empty());

        assertRefused(() -> service.current(identityId), HttpStatus.NOT_FOUND, "NO_DELETION_REQUEST");
    }

    @Test
    void reviewNoteShowsOnlyWhenRejected() {
        assertThat(DeletionView.of(reviewed(RequestStatus.REJECTED)).reviewNote()).isEqualTo("Open payout");
        assertThat(DeletionView.of(reviewed(RequestStatus.CANCELLED)).reviewNote()).isNull();
    }

    @Test
    void pendingIsTheOpenRequestAndNothingElse() {
        DeletionRequest open = row(Scope.ALL, RequestStatus.WAITING_ON_OPEN_ITEMS, NOW.plusSeconds(5));
        when(deletions.findOpen(identityId)).thenReturn(Optional.of(open));

        assertThat(service.pending(identityId))
            .contains(new PendingDeletion(open.id(), "ALL", "WAITING_ON_OPEN_ITEMS", NOW.plusSeconds(5)));

        when(deletions.findOpen(identityId)).thenReturn(Optional.empty());
        assertThat(service.pending(identityId)).isEmpty();
    }

    @Test
    void routesAre503WhileSwitchedOff() {
        properties.setEnabled(false);

        assertRefused(() -> service.request(user, Scope.CUSTOMER, Via.APP), HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_DELETION_NOT_ENABLED");
        assertRefused(() -> service.current(identityId), HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_DELETION_NOT_ENABLED");
        assertRefused(() -> service.keep(user), HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_DELETION_NOT_ENABLED");
        verifyNoInteractions(deletions, identities);
    }

    @Test
    void pendingStillReadsTheDatabaseWhileSwitchedOff() {
        properties.setEnabled(false);
        when(deletions.findOpen(identityId)).thenReturn(Optional.of(row(Scope.CUSTOMER, RequestStatus.SCHEDULED, NOW)));

        assertThat(service.pending(identityId)).isPresent();
    }

    private DeletionRequest reviewed(RequestStatus status) {
        return new DeletionRequest(UUID.randomUUID(), identityId, Scope.CHEF, status, Via.APP, NOW, null, null, NOW,
            "Open payout", null, null, null, null, null, null, null);
    }

    private static void assertRefused(Runnable call, HttpStatus status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(AuthException.class, error -> {
            assertThat(error.getStatus()).isEqualTo(status);
            assertThat(error.getCode()).isEqualTo(code);
        });
    }
}
