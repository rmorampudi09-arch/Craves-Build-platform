package in.craves.subscription.lifecycle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.CancellableOccurrence;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.OwnedSubscription;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.ScheduleClock;
import in.craves.subscription.policy.SubscriptionPolicyModels.SubscriptionPolicyResponse;
import in.craves.subscription.policy.SubscriptionPolicyRepository;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class SubscriptionLifecycleCutoffTest {
    private static final UUID SUBSCRIPTION = UUID.randomUUID();
    private static final UUID CUSTOMER = UUID.randomUUID();
    private static final UUID PLAN = UUID.randomUUID();
    private static final UUID CHEF = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-09T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 9);
    private static final LocalDate CURSOR = TODAY.plusDays(7);
    private final SubscriptionLifecycleRepository lifecycle = mock(SubscriptionLifecycleRepository.class);
    private final SubscriptionPolicyRepository policies = mock(SubscriptionPolicyRepository.class);
    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final CapacityService capacity = mock(CapacityService.class);
    private final CurrentUser customer = new CurrentUser(CUSTOMER, "fixture-customer", null, List.of("CUSTOMER"));
    private final SubscriptionLifecycleService service = new SubscriptionLifecycleService(
        lifecycle, policies, subscriptions, capacity, Clock.fixed(NOW, ZoneOffset.UTC)
    );

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void callerMustBeCustomerBeforeAnyRepositoryAccess(String action) {
        for (CurrentUser user : new CurrentUser[] {null,
            new CurrentUser(CUSTOMER, "fixture-admin", null, List.of("SUBSCRIPTION_ADMIN"))}) {
            assertError(() -> invoke(action, user), "ROLE_NOT_ALLOWED", 403);
        }
        verifyNoInteractions(lifecycle, policies, subscriptions, capacity);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void missingOrForeignSubscriptionIsNotFoundUnderOwnershipLock(String action) {
        when(lifecycle.lockOwned(SUBSCRIPTION, CUSTOMER)).thenReturn(Optional.empty());
        assertError(() -> invoke(action, customer), "SUBSCRIPTION_NOT_FOUND", 404);
        verify(lifecycle).lockOwned(SUBSCRIPTION, CUSTOMER);
        verify(lifecycle, never()).findOwned(any(), any());
        verifyNoInteractions(policies, subscriptions, capacity);
    }

    @ParameterizedTest
    @CsvSource({"pause,PAUSED,SUBSCRIPTION_NOT_ACTIVE", "pause,PENDING_PAYMENT,SUBSCRIPTION_NOT_ACTIVE",
        "cancel,CANCELLED,SUBSCRIPTION_NOT_CANCELLABLE", "cancel,EXPIRED,SUBSCRIPTION_NOT_CANCELLABLE",
        "cancel,PAYMENT_FAILED,SUBSCRIPTION_NOT_CANCELLABLE"})
    void invalidLockedStateFailsBeforePolicyOrMutation(String action, String state, String code) {
        owned(state, CURSOR);
        assertError(() -> invoke(action, customer), code, 409);
        verifyNoInteractions(policies, subscriptions, capacity);
        noTransition();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void defaultDisabledPolicyDoesNotLockMealsOrMutate(String action) {
        owned("ACTIVE", CURSOR);
        when(policies.findActive(PLAN)).thenReturn(Optional.of(policy(false, null)));
        assertError(() -> invoke(action, customer), action.equals("pause") ? "SUBSCRIPTION_PAUSE_DISABLED" : "SUBSCRIPTION_CANCEL_DISABLED", 403);
        verify(lifecycle, never()).lockCancellableOccurrences(any());
        noTransition();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void missingPolicyFailsClosed(String action) {
        owned("ACTIVE", CURSOR);
        when(policies.findActive(PLAN)).thenReturn(Optional.empty());
        assertError(() -> invoke(action, customer), "SUBSCRIPTION_POLICY_NOT_CONFIGURED", 409);
        noTransition();
    }

    @ParameterizedTest
    @CsvSource({"pause,0", "pause,-1", "cancel,0", "cancel,-1"})
    void advancedCursorCannotBypassGeneratedMealCutoff(String action, long secondsBeyondBoundary) {
        activeFixture();
        when(lifecycle.lockCancellableOccurrences(SUBSCRIPTION)).thenReturn(List.of(
            occurrence("BILLING_PENDING", NOW.plusSeconds(3600 + secondsBeyondBoundary))
        ));
        assertError(() -> invoke(action, customer), cutoffCode(action), 409);
        noTransition();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void everyAffectedMealIsCheckedEvenWhenLaterMealComesFirst(String action) {
        activeFixture();
        when(lifecycle.lockCancellableOccurrences(SUBSCRIPTION)).thenReturn(List.of(
            occurrence("READY_FOR_ORDER", NOW.plusSeconds(7200)),
            occurrence("PAYMENT_PENDING", NOW.plusSeconds(3600))
        ));
        assertError(() -> invoke(action, customer), cutoffCode(action), 409);
        noTransition();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void oneSecondBeforeGeneratedMealCutoffRetainsExistingMutationAndCapacityOrder(String action) {
        activeFixture();
        when(lifecycle.lockCancellableOccurrences(SUBSCRIPTION)).thenReturn(List.of(
            occurrence("READY_FOR_ORDER", NOW.plusSeconds(3601))
        ));
        permitTransition(action, "ACTIVE");
        var response = invoke(action, customer);
        assertThat(response.status()).isEqualTo(action.equals("pause") ? "PAUSED" : "CANCELLED");
        assertThat(response.toString()).doesNotContain(CUSTOMER.toString(), CHEF.toString());
        var ordered = inOrder(lifecycle, policies, subscriptions, capacity);
        ordered.verify(lifecycle).lockOwned(SUBSCRIPTION, CUSTOMER);
        ordered.verify(policies).findActive(PLAN);
        ordered.verify(lifecycle).findActiveScheduleClock(PLAN);
        ordered.verify(lifecycle).findOccurrenceServiceAt(SUBSCRIPTION, CURSOR);
        ordered.verify(lifecycle).lockCancellableOccurrences(SUBSCRIPTION);
        ordered.verify(subscriptions).findSubscriptionById(SUBSCRIPTION);
        if (action.equals("pause")) ordered.verify(lifecycle).pause(SUBSCRIPTION, CUSTOMER, "customer reason");
        else ordered.verify(lifecycle).cancel(SUBSCRIPTION, CUSTOMER, "customer reason");
        ordered.verify(capacity).releaseForPauseOrTerminal(any(), eq(TODAY), anyString());
        ordered.verify(subscriptions).findSubscriptionById(SUBSCRIPTION);
        verify(lifecycle, never()).findOwned(any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void emptyAffectedSetKeepsActiveCursorFallback(String action) {
        activeFixture();
        when(lifecycle.lockCancellableOccurrences(SUBSCRIPTION)).thenReturn(List.of());
        permitTransition(action, "ACTIVE");
        invoke(action, customer);
        verify(lifecycle).findOccurrenceServiceAt(SUBSCRIPTION, CURSOR);
        verify(capacity).releaseForPauseOrTerminal(any(), eq(TODAY), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void existingActiveCursorCutoffStillApplies(String action) {
        activeFixture();
        when(lifecycle.findOccurrenceServiceAt(SUBSCRIPTION, CURSOR)).thenReturn(Optional.of(NOW.plusSeconds(3600)));
        assertError(() -> invoke(action, customer), cutoffCode(action), 409);
        noTransition();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void fallbackRetainsScheduleTimezoneAndExactBoundary(String action) {
        activeFixture();
        owned("ACTIVE", TODAY);
        when(lifecycle.findActiveScheduleClock(PLAN)).thenReturn(Optional.of(new ScheduleClock("Asia/Kolkata", LocalTime.of(16, 30))));
        assertError(() -> invoke(action, customer), cutoffCode(action), 409);
        noTransition();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void missingActiveCursorFailsClosed(String action) {
        activeFixture();
        owned("ACTIVE", null);
        assertError(() -> invoke(action, customer), "NEXT_SERVICE_DATE_MISSING", 409);
        noTransition();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void missingActiveScheduleFailsClosed(String action) {
        activeFixture();
        when(lifecycle.findActiveScheduleClock(PLAN)).thenReturn(Optional.empty());
        assertError(() -> invoke(action, customer), "SUBSCRIPTION_SCHEDULE_NOT_ACTIVE", 409);
        noTransition();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void missingActiveCutoffFailsClosed(String action) {
        activeFixture();
        when(policies.findActive(PLAN)).thenReturn(Optional.of(policy(true, null)));
        assertError(() -> invoke(action, customer), "SUBSCRIPTION_POLICY_INCOMPLETE", 409);
        noTransition();
    }

    @Test
    void pausedCancellationWithoutAffectedMealsRetainsNoCursorScheduleOrCutoffRequirement() {
        owned("PAUSED", null);
        when(policies.findActive(PLAN)).thenReturn(Optional.of(policy(true, null)));
        when(lifecycle.lockCancellableOccurrences(SUBSCRIPTION)).thenReturn(List.of());
        permitTransition("cancel", "PAUSED");
        assertThat(invoke("cancel", customer).status()).isEqualTo("CANCELLED");
        verify(lifecycle, never()).findActiveScheduleClock(any());
        verify(lifecycle, never()).findOccurrenceServiceAt(any(), any());
        verify(capacity).releaseForPauseOrTerminal(any(), eq(TODAY), anyString());
    }

    @Test
    void administratorPausedSubscriptionWithAffectedMealCannotBypassCutoff() {
        owned("PAUSED", null);
        when(policies.findActive(PLAN)).thenReturn(Optional.of(policy(true, 60)));
        when(lifecycle.lockCancellableOccurrences(SUBSCRIPTION)).thenReturn(List.of(occurrence("PAYMENT_PENDING", NOW.plusSeconds(3600))));
        assertError(() -> invoke("cancel", customer), "SUBSCRIPTION_CANCEL_CUTOFF", 409);
        verify(lifecycle, never()).findActiveScheduleClock(any());
        noTransition();
    }

    @Test
    void pausedAffectedMealNeedsConfiguredCutoff() {
        owned("PAUSED", null);
        when(policies.findActive(PLAN)).thenReturn(Optional.of(policy(true, null)));
        when(lifecycle.lockCancellableOccurrences(SUBSCRIPTION)).thenReturn(List.of(occurrence("BILLING_PENDING", NOW.plusSeconds(7200))));
        assertError(() -> invoke("cancel", customer), "SUBSCRIPTION_POLICY_INCOMPLETE", 409);
        noTransition();
    }

    @Test
    void pausedAffectedMealBeforeCutoffCanCancelWithoutActiveSchedule() {
        owned("PAUSED", null);
        when(policies.findActive(PLAN)).thenReturn(Optional.of(policy(true, 60)));
        when(lifecycle.lockCancellableOccurrences(SUBSCRIPTION)).thenReturn(List.of(occurrence("READY_FOR_ORDER", NOW.plusSeconds(3601))));
        permitTransition("cancel", "PAUSED");
        assertThat(invoke("cancel", customer).status()).isEqualTo("CANCELLED");
        verify(lifecycle, never()).findActiveScheduleClock(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void failedStateTransitionDoesNotReleaseCapacity(String action) {
        activeFixture();
        when(subscriptions.findSubscriptionById(SUBSCRIPTION)).thenReturn(Optional.of(full("ACTIVE")));
        assertError(() -> invoke(action, customer), "SUBSCRIPTION_STATE_CHANGED", 409);
        verifyNoInteractions(capacity);
    }

    private void activeFixture() {
        owned("ACTIVE", CURSOR);
        when(policies.findActive(PLAN)).thenReturn(Optional.of(policy(true, 60)));
        when(lifecycle.findActiveScheduleClock(PLAN)).thenReturn(Optional.of(new ScheduleClock("UTC", LocalTime.NOON)));
    }

    private void owned(String state, LocalDate cursor) {
        when(lifecycle.lockOwned(SUBSCRIPTION, CUSTOMER)).thenReturn(Optional.of(new OwnedSubscription(SUBSCRIPTION, CUSTOMER, PLAN, state, cursor)));
    }

    private SubscriptionPolicyResponse policy(boolean enabled, Integer minutes) {
        return new SubscriptionPolicyResponse(UUID.randomUUID(), PLAN, 1, "ACTIVE", enabled, false, enabled, false,
            minutes, null, minutes, null, null, null, null, null, NOW, NOW, NOW);
    }

    private CancellableOccurrence occurrence(String status, Instant serviceAt) {
        return new CancellableOccurrence(UUID.randomUUID(), status, serviceAt);
    }

    private void permitTransition(String action, String state) {
        when(subscriptions.findSubscriptionById(SUBSCRIPTION)).thenReturn(Optional.of(full(state)),
            Optional.of(full(action.equals("pause") ? "PAUSED" : "CANCELLED")));
        if (action.equals("pause")) when(lifecycle.pause(SUBSCRIPTION, CUSTOMER, "customer reason")).thenReturn(true);
        else when(lifecycle.cancel(SUBSCRIPTION, CUSTOMER, "customer reason")).thenReturn(true);
    }

    private SubscriptionResponse full(String state) {
        return new SubscriptionResponse(SUBSCRIPTION, CUSTOMER, PLAN, CHEF, state, TODAY, null, CURSOR,
            UUID.randomUUID(), null, NOW, NOW);
    }

    private in.craves.subscription.web.ApiDtos.CustomerSubscriptionResponse invoke(String action, CurrentUser user) {
        return action.equals("pause") ? service.pause(SUBSCRIPTION, " customer reason ", user)
            : service.cancel(SUBSCRIPTION, " customer reason ", user);
    }

    private void noTransition() {
        verify(lifecycle, never()).pause(any(), any(), any());
        verify(lifecycle, never()).cancel(any(), any(), any());
        verifyNoInteractions(subscriptions, capacity);
    }

    private static String cutoffCode(String action) {
        return action.equals("pause") ? "SUBSCRIPTION_PAUSE_CUTOFF" : "SUBSCRIPTION_CANCEL_CUTOFF";
    }

    private static void assertError(Runnable work, String code, int status) {
        assertThatThrownBy(work::run).isInstanceOfSatisfying(ApiException.class, failure -> {
            assertThat(failure.getCode()).isEqualTo(code);
            assertThat(failure.getStatus()).isEqualTo(status);
        });
    }
}
