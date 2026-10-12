package in.craves.subscription.lifecycle;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.subscription.billing.SubscriptionBillingProperties;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.OwnedSubscription;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.ScheduleClock;
import in.craves.subscription.lifecycle.SubscriptionLifecycleModels.ResumeSubscriptionRequest;
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

/** Pause and cancel cutoffs protect the earliest meal still ahead, never a stale next_service_date. */
class SubscriptionLifecycleCutoffTest {
    private static final Instant NOW = Instant.parse("2026-10-11T06:00:00Z");
    private static final UUID SUBSCRIPTION_ID = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static final UUID PLAN_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final UUID CUSTOMER_ID = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final CurrentUser CUSTOMER = new CurrentUser(CUSTOMER_ID, "firebase-customer", "+919999999999", List.of("CUSTOMER"));

    private final SubscriptionLifecycleRepository lifecycle = mock(SubscriptionLifecycleRepository.class);
    private final SubscriptionPolicyRepository policies = mock(SubscriptionPolicyRepository.class);
    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final SubscriptionBillingRepository billingRepository = mock(SubscriptionBillingRepository.class);
    private final SubscriptionLifecycleService service = new SubscriptionLifecycleService(
        lifecycle, policies, subscriptions, mock(CapacityService.class), new SubscriptionBillingProperties(),
        billingRepository, Clock.fixed(NOW, ZoneOffset.UTC)
    );

    @BeforeEach
    void activeSubscriptionWithAStaleNextServiceDate() {
        // The occurrence generator is off, so next_service_date still points at a meal day that has passed.
        when(lifecycle.findOwned(SUBSCRIPTION_ID, CUSTOMER_ID)).thenReturn(Optional.of(
            new OwnedSubscription(SUBSCRIPTION_ID, CUSTOMER_ID, PLAN_ID, "ACTIVE", LocalDate.parse("2026-10-01"))
        ));
        when(lifecycle.findActiveScheduleClock(PLAN_ID)).thenReturn(Optional.of(new ScheduleClock("Asia/Kolkata", LocalTime.NOON)));
        when(lifecycle.findOccurrenceServiceAt(any(), any())).thenReturn(Optional.empty());
        when(lifecycle.pause(eq(SUBSCRIPTION_ID), eq(CUSTOMER_ID), any())).thenReturn(true);
        when(lifecycle.cancel(eq(SUBSCRIPTION_ID), eq(CUSTOMER_ID), any())).thenReturn(true);
        when(subscriptions.findSubscriptionById(SUBSCRIPTION_ID)).thenReturn(Optional.of(mock(SubscriptionResponse.class)));
    }

    @Test
    void pauseAndCancelAreAllowedWhenNoMealIsAhead() {
        when(policies.findActive(PLAN_ID)).thenReturn(Optional.of(policy(0, 0)));
        when(lifecycle.findNextUpcomingServiceAt(SUBSCRIPTION_ID, NOW)).thenReturn(Optional.empty());

        assertThatCode(() -> service.pause(SUBSCRIPTION_ID, "Travelling", CUSTOMER)).doesNotThrowAnyException();
        assertThatCode(() -> service.cancel(SUBSCRIPTION_ID, "Moving", CUSTOMER)).doesNotThrowAnyException();
    }

    @Test
    void aMealInsideTheCutoffStillBlocksPause() {
        when(policies.findActive(PLAN_ID)).thenReturn(Optional.of(policy(120, 120)));
        when(lifecycle.findNextUpcomingServiceAt(SUBSCRIPTION_ID, NOW)).thenReturn(Optional.of(NOW.plusSeconds(3600)));

        assertThatThrownBy(() -> service.pause(SUBSCRIPTION_ID, "Travelling", CUSTOMER))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("cutoff");
        verify(lifecycle, never()).pause(any(), any(), anyString());
    }

    @Test
    void aMealOutsideTheCutoffAllowsCancel() {
        when(policies.findActive(PLAN_ID)).thenReturn(Optional.of(policy(120, 120)));
        when(lifecycle.findNextUpcomingServiceAt(SUBSCRIPTION_ID, NOW)).thenReturn(Optional.of(NOW.plusSeconds(3 * 3600)));

        assertThatCode(() -> service.cancel(SUBSCRIPTION_ID, "Moving", CUSTOMER)).doesNotThrowAnyException();
    }

    @Test
    void resumeCarriesPausedPaidDaysForward() {
        pausedSubscription();
        LocalDate resumeOn = LocalDate.parse("2026-10-14");

        service.resume(SUBSCRIPTION_ID, new ResumeSubscriptionRequest(resumeOn, null), CUSTOMER);

        verify(billingRepository).applyPauseCredit(SUBSCRIPTION_ID, resumeOn);
    }

    @Test
    void resumeRejectedByTheLeadTimeAppliesNoCredit() {
        pausedSubscription();
        // Today's noon meal is less than the 24-hour resume lead away.
        LocalDate resumeOn = LocalDate.parse("2026-10-11");

        assertThatThrownBy(() -> service.resume(SUBSCRIPTION_ID, new ResumeSubscriptionRequest(resumeOn, null), CUSTOMER))
            .isInstanceOf(ApiException.class);
        verify(billingRepository, never()).applyPauseCredit(any(), any());
    }

    private void pausedSubscription() {
        when(lifecycle.findOwned(SUBSCRIPTION_ID, CUSTOMER_ID)).thenReturn(Optional.of(
            new OwnedSubscription(SUBSCRIPTION_ID, CUSTOMER_ID, PLAN_ID, "PAUSED", LocalDate.parse("2026-10-01"))
        ));
        when(policies.findActive(PLAN_ID)).thenReturn(Optional.of(policy(0, 0)));
        when(lifecycle.resume(eq(SUBSCRIPTION_ID), eq(CUSTOMER_ID), any(), any())).thenReturn(true);
    }

    private static SubscriptionPolicyResponse policy(int pauseCutoffMinutes, int cancelCutoffMinutes) {
        return new SubscriptionPolicyResponse(
            UUID.randomUUID(), PLAN_ID, 2, "ACTIVE", true, true, true, true,
            pauseCutoffMinutes, 1440, cancelCutoffMinutes, 1440, null, null, null, null, NOW, NOW, NOW
        );
    }
}
