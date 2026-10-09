package in.craves.subscription.lifecycle;

import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.CustomerResumeOccurrences.ResumeOccurrence;
import in.craves.subscription.lifecycle.SubscriptionLifecycleModels.ResumeSubscriptionRequest;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomerResumeRestorationTest {
    private static final Instant NOW = Instant.parse("2026-10-09T06:00:00Z");
    private static final LocalDate DATE = LocalDate.of(2026, 10, 10);
    private final UUID id = UUID.randomUUID(), customer = UUID.randomUUID(), plan = UUID.randomUUID();
    private SubscriptionLifecycleRepository lifecycle;
    private SubscriptionPolicyRepository policies;
    private SubscriptionRepository subscriptions;
    private CapacityService capacity;
    private SubscriptionLifecycleService service;
    private SubscriptionResponse full;
    private CurrentUser user;

    @BeforeEach
    void setUp() {
        lifecycle = mock(SubscriptionLifecycleRepository.class);
        policies = mock(SubscriptionPolicyRepository.class);
        subscriptions = mock(SubscriptionRepository.class);
        capacity = mock(CapacityService.class);
        service = new SubscriptionLifecycleService(lifecycle, policies, subscriptions, capacity,
            Clock.fixed(NOW, ZoneOffset.UTC));
        full = new SubscriptionResponse(id, customer, plan, UUID.randomUUID(), "PAUSED", DATE.minusDays(10), null,
            DATE.plusDays(7), UUID.randomUUID(), null, NOW.minusSeconds(100), NOW);
        user = new CurrentUser(customer, "test", null, List.of("CUSTOMER"));
        when(lifecycle.lockOwned(id, customer)).thenReturn(Optional.of(owned("PAUSED")));
        when(policies.findActive(plan)).thenReturn(Optional.of(policy(true, 60)));
        when(lifecycle.findActiveScheduleClock(plan)).thenReturn(Optional.of(new ScheduleClock("Asia/Kolkata", LocalTime.NOON)));
        when(subscriptions.findSubscriptionById(id)).thenReturn(Optional.of(full));
        when(lifecycle.lockResumeOccurrences(full, DATE)).thenReturn(List.of());
        when(lifecycle.resume(eq(id), eq(customer), eq(DATE), any())).thenReturn(true);
    }

    @Test
    void locksSubscriptionAndValidatesEveryMealBeforeRestoringAny() {
        ResumeOccurrence first = candidate(NOW.plusSeconds(7200));
        ResumeOccurrence second = candidate(NOW.plusSeconds(10800));
        when(lifecycle.lockResumeOccurrences(full, DATE)).thenReturn(List.of(first, second));
        resume();
        var order = inOrder(lifecycle, policies, subscriptions, capacity);
        order.verify(lifecycle).lockOwned(id, customer);
        order.verify(policies).findActive(plan);
        order.verify(lifecycle).findActiveScheduleClock(plan);
        order.verify(subscriptions).findSubscriptionById(id);
        order.verify(lifecycle).lockResumeOccurrences(full, DATE);
        order.verify(capacity).reacquireForResume(full, DATE);
        order.verify(lifecycle).validateResumeOccurrence(full, first, false);
        order.verify(lifecycle).validateResumeOccurrence(full, second, false);
        for (ResumeOccurrence candidate : List.of(first, second)) {
            order.verify(lifecycle).restorePausedOccurrence(candidate, customer);
            order.verify(capacity).markMaterialized(id, DATE, "LUNCH", candidate.id());
            order.verify(lifecycle).validateResumeOccurrence(full, candidate, true);
        }
        order.verify(lifecycle).resume(id, customer, DATE, "back");
        verify(lifecycle, never()).findOwned(any(), any());
    }

    @Test
    void ordinaryResumeWithoutPreservedMealsRetainsExistingPath() {
        resume();
        verify(capacity).reacquireForResume(full, DATE);
        verify(lifecycle).resume(id, customer, DATE, "back");
        verify(lifecycle, never()).validateResumeOccurrence(any(), any(), anyBoolean());
        verify(lifecycle, never()).restorePausedOccurrence(any(), any());
        verify(capacity, never()).markMaterialized(any(), any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ACTIVE", "PENDING_PAYMENT", "PAYMENT_FAILED", "CANCELLED", "EXPIRED", "UNKNOWN"})
    void onlyLockedPausedStateCanProceed(String state) {
        when(lifecycle.lockOwned(id, customer)).thenReturn(Optional.of(owned(state)));
        error("SUBSCRIPTION_NOT_PAUSED");
        verifyNoInteractions(policies, subscriptions, capacity);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"CHEF", "PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN", "SUPPORT_ADMIN"})
    void customerRoleStillRequired(String role) {
        CurrentUser denied = role == null ? null : new CurrentUser(customer, "test", null, List.of(role));
        assertEquals("ROLE_NOT_ALLOWED", assertThrows(ApiException.class,
            () -> service.resume(id, new ResumeSubscriptionRequest(DATE, null), denied)).getCode());
        verifyNoInteractions(lifecycle, policies, subscriptions, capacity);
    }

    @Test
    void missingOwnedSubscriptionIsHiddenBeforePolicyOrCapacityWork() {
        when(lifecycle.lockOwned(id, customer)).thenReturn(Optional.empty());
        error("SUBSCRIPTION_NOT_FOUND");
        verifyNoInteractions(policies, subscriptions, capacity);
    }

    @Test
    void disabledResumeDoesNotInspectOrRestoreMeals() {
        when(policies.findActive(plan)).thenReturn(Optional.of(policy(false, null)));
        error("SUBSCRIPTION_RESUME_DISABLED");
        verify(lifecycle, never()).lockResumeOccurrences(any(), any());
        verifyNoInteractions(subscriptions, capacity);
    }

    @Test
    void missingPolicyFailsClosed() {
        when(policies.findActive(plan)).thenReturn(Optional.empty());
        error("SUBSCRIPTION_POLICY_NOT_CONFIGURED");
        verifyNoInteractions(capacity);
    }

    @Test
    void pastResumeDateIsStillRejected() {
        assertEquals("INVALID_RESUME_DATE", assertThrows(ApiException.class,
            () -> service.resume(id, new ResumeSubscriptionRequest(DATE.minusDays(2), null), user)).getCode());
        verifyNoInteractions(capacity);
    }

    @Test
    void missingScheduleFailsClosed() {
        when(lifecycle.findActiveScheduleClock(plan)).thenReturn(Optional.empty());
        error("SUBSCRIPTION_SCHEDULE_NOT_ACTIVE");
        verifyNoInteractions(capacity);
    }

    @Test
    void invalidScheduleTimezoneFailsClosed() {
        when(lifecycle.findActiveScheduleClock(plan)).thenReturn(Optional.of(new ScheduleClock("Invalid/Zone", LocalTime.NOON)));
        error("INVALID_ACTIVE_SCHEDULE");
        verifyNoInteractions(capacity);
    }

    @Test
    void incompleteLeadPolicyFailsClosed() {
        when(policies.findActive(plan)).thenReturn(Optional.of(policy(true, null)));
        error("SUBSCRIPTION_POLICY_INCOMPLETE");
        verifyNoInteractions(capacity);
    }

    @ParameterizedTest
    @ValueSource(longs = {-1, 0, 1})
    void storedMealLeadBoundaryIsCheckedBeforeCapacityMutation(long deltaNanos) {
        ResumeOccurrence candidate = candidate(NOW.plusSeconds(3600).plusNanos(deltaNanos));
        when(lifecycle.lockResumeOccurrences(full, DATE)).thenReturn(List.of(candidate));
        if (deltaNanos <= 0) {
            error("SUBSCRIPTION_RESUME_LEAD");
            verifyNoInteractions(capacity);
            verify(lifecycle, never()).restorePausedOccurrence(any(), any());
        } else {
            resume();
            verify(capacity).reacquireForResume(full, DATE);
        }
    }

    @Test
    void provenanceFailureDoesNotAcquireCapacity() {
        when(lifecycle.lockResumeOccurrences(full, DATE)).thenThrow(unsafe());
        error("SUBSCRIPTION_STATE_CHANGED");
        verifyNoInteractions(capacity);
    }

    @Test
    void capacityFailureDoesNotRestoreOrActivate() {
        doThrow(unsafe()).when(capacity).reacquireForResume(full, DATE);
        error("SUBSCRIPTION_STATE_CHANGED");
        verify(lifecycle, never()).restorePausedOccurrence(any(), any());
        verify(lifecycle, never()).resume(any(), any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"validate", "restore", "materialize", "verify"})
    void failedRestorationStageCannotActivateSubscription(String stage) {
        ResumeOccurrence candidate = candidate(NOW.plusSeconds(7200));
        when(lifecycle.lockResumeOccurrences(full, DATE)).thenReturn(List.of(candidate));
        switch (stage) {
            case "validate" -> doThrow(unsafe()).when(lifecycle).validateResumeOccurrence(full, candidate, false);
            case "restore" -> doThrow(unsafe()).when(lifecycle).restorePausedOccurrence(candidate, customer);
            case "materialize" -> doThrow(unsafe()).when(capacity).markMaterialized(id, DATE, "LUNCH", candidate.id());
            case "verify" -> doThrow(unsafe()).when(lifecycle).validateResumeOccurrence(full, candidate, true);
            default -> fail("Unexpected stage");
        }
        error("SUBSCRIPTION_STATE_CHANGED");
        verify(lifecycle, never()).resume(any(), any(), any(), any());
    }

    @Test
    void conditionalSubscriptionTransitionFailureStillThrowsForTransactionalRollback() {
        when(lifecycle.resume(any(), any(), any(), any())).thenReturn(false);
        error("SUBSCRIPTION_STATE_CHANGED");
    }

    private void resume() {
        service.resume(id, new ResumeSubscriptionRequest(DATE, "  back  "), user);
    }

    private void error(String code) {
        assertEquals(code, assertThrows(ApiException.class, this::resume).getCode());
    }

    private OwnedSubscription owned(String state) {
        return new OwnedSubscription(id, customer, plan, state, DATE.plusDays(7));
    }

    private ResumeOccurrence candidate(Instant serviceAt) {
        return new ResumeOccurrence(UUID.randomUUID(), DATE, "LUNCH", serviceAt, 1, "READY_FOR_ORDER");
    }

    private SubscriptionPolicyResponse policy(boolean enabled, Integer lead) {
        return new SubscriptionPolicyResponse(UUID.randomUUID(), plan, 1, "ACTIVE", false, enabled, false, false,
            null, lead, null, null, null, null, null, null, NOW, NOW, NOW);
    }

    private ApiException unsafe() {
        return ApiException.conflict("SUBSCRIPTION_STATE_CHANGED", "Test rejection");
    }
}
