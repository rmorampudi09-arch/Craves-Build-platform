package in.craves.subscription.lifecycle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.subscription.billing.SubscriptionBillingProperties;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleModels.ResumeSubscriptionRequest;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.OwnedSubscription;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.PauseUsage;
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

/** A customer pauses at most 1/3/7 days per weekly/14-day/28-day bill, then the plan restarts by itself. */
class SubscriptionLifecyclePauseAllowanceTest {
    // 11:30 IST on 11 October.
    private static final Instant NOW = Instant.parse("2026-10-11T06:00:00Z");
    private static final UUID SUBSCRIPTION_ID = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static final UUID PLAN_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final UUID CUSTOMER_ID = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final CurrentUser CUSTOMER = new CurrentUser(CUSTOMER_ID, "firebase-customer", "+919999999999", List.of("CUSTOMER"));

    private final SubscriptionLifecycleRepository lifecycle = mock(SubscriptionLifecycleRepository.class);
    private final SubscriptionPolicyRepository policies = mock(SubscriptionPolicyRepository.class);
    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final CapacityService capacity = mock(CapacityService.class);
    private final SubscriptionBillingRepository billingRepository = mock(SubscriptionBillingRepository.class);
    private final SubscriptionResponse subscription = mock(SubscriptionResponse.class);
    private final SubscriptionLifecycleService service = new SubscriptionLifecycleService(
        lifecycle, policies, subscriptions, capacity, new SubscriptionBillingProperties(),
        billingRepository, Clock.fixed(NOW, ZoneOffset.UTC)
    );

    static LocalDate d(String monthDay) { return LocalDate.parse("2026-" + monthDay); }

    @BeforeEach
    void monthlyPlan() {
        when(subscription.id()).thenReturn(SUBSCRIPTION_ID);
        when(subscription.billingPeriod()).thenReturn("MONTHLY");
        when(subscriptions.findSubscriptionById(SUBSCRIPTION_ID)).thenReturn(Optional.of(subscription));
        when(policies.findActive(PLAN_ID)).thenReturn(Optional.of(policy()));
        when(lifecycle.findActiveScheduleClock(PLAN_ID)).thenReturn(Optional.of(new ScheduleClock("Asia/Kolkata", LocalTime.NOON)));
        when(lifecycle.findNextUpcomingServiceAt(any(), any())).thenReturn(Optional.empty());
        when(lifecycle.firstUnservedDate(SUBSCRIPTION_ID, d("10-11"))).thenReturn(d("10-11"));
        when(lifecycle.currentBillStart(eq(SUBSCRIPTION_ID), any())).thenReturn(d("10-04"));
        when(lifecycle.pause(eq(SUBSCRIPTION_ID), eq(CUSTOMER_ID), any(), any(), any(), anyInt(), any())).thenReturn(true);
        when(lifecycle.resume(eq(SUBSCRIPTION_ID), eq(CUSTOMER_ID), any(), any())).thenReturn(true);
    }

    @Test
    void pauseWithNoDaysLeftIsRejected() {
        owned("ACTIVE");
        when(lifecycle.pauseUsage(SUBSCRIPTION_ID)).thenReturn(new PauseUsage(d("10-04"), 7, null, null));

        assertThatThrownBy(() -> service.pause(SUBSCRIPTION_ID, "Travelling", CUSTOMER))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> {
                assertThat(((ApiException) error).getCode()).isEqualTo("SUBSCRIPTION_PAUSE_ALLOWANCE_USED");
                assertThat(error.getMessage()).isEqualTo("You've used all 7 pause days for this bill.");
            });
        verify(lifecycle, never()).pause(any(), any(), any(), any(), any(), anyInt(), any());
    }

    @Test
    void pauseStoresTheRestartDateFromTheDaysLeft() {
        owned("ACTIVE");
        when(lifecycle.pauseUsage(SUBSCRIPTION_ID)).thenReturn(new PauseUsage(d("10-04"), 3, null, null));

        service.pause(SUBSCRIPTION_ID, "Travelling", CUSTOMER);

        verify(lifecycle).pause(SUBSCRIPTION_ID, CUSTOMER_ID, "Travelling", d("10-11"), d("10-04"), 3, d("10-15"));
    }

    @Test
    void aNewBillResetsTheDaysUsed() {
        owned("ACTIVE");
        when(lifecycle.pauseUsage(SUBSCRIPTION_ID)).thenReturn(new PauseUsage(d("09-06"), 7, null, null));

        service.pause(SUBSCRIPTION_ID, "Travelling", CUSTOMER);

        verify(lifecycle).pause(SUBSCRIPTION_ID, CUSTOMER_ID, "Travelling", d("10-11"), d("10-04"), 0, d("10-18"));
    }

    @Test
    void customerPauseKeepsCapacity() {
        owned("ACTIVE");
        when(lifecycle.pauseUsage(SUBSCRIPTION_ID)).thenReturn(new PauseUsage(null, 0, null, null));

        service.pause(SUBSCRIPTION_ID, "Travelling", CUSTOMER);

        verify(capacity, never()).releaseForPauseOrTerminal(any(), any(), any());
    }

    @Test
    void resumeAfterAutoRestartDateIsRejected() {
        owned("PAUSED");
        when(lifecycle.pauseUsage(SUBSCRIPTION_ID)).thenReturn(new PauseUsage(d("10-04"), 0, d("10-20"), d("10-27")));

        assertThatThrownBy(() -> service.resume(SUBSCRIPTION_ID, new ResumeSubscriptionRequest(d("10-28"), null), CUSTOMER))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> {
                assertThat(((ApiException) error).getCode()).isEqualTo("RESUME_AFTER_AUTO_RESTART");
                assertThat(error.getMessage()).isEqualTo("Your plan restarts by itself on 27 Oct.");
            });
        verify(lifecycle, never()).resume(any(), any(), any(), any());
    }

    @Test
    void resumeKeepsHeldCapacityAndRecordsTheDaysUsed() {
        owned("PAUSED");
        when(lifecycle.pauseUsage(SUBSCRIPTION_ID)).thenReturn(new PauseUsage(d("10-04"), 0, d("10-11"), d("10-18")));
        when(capacity.hasCommittedCapacity(SUBSCRIPTION_ID)).thenReturn(true);

        service.resume(SUBSCRIPTION_ID, new ResumeSubscriptionRequest(d("10-14"), null), CUSTOMER);

        verify(capacity, never()).reacquireForResume(any(), any());
        verify(lifecycle).closePause(SUBSCRIPTION_ID, d("10-14"));
        verify(billingRepository).applyPauseCredit(SUBSCRIPTION_ID, d("10-14"));
    }

    @Test
    void resumeReacquiresCapacityOnlyWhenReleased() {
        owned("PAUSED");
        when(lifecycle.pauseUsage(SUBSCRIPTION_ID)).thenReturn(new PauseUsage(null, 0, null, null));
        when(capacity.hasCommittedCapacity(SUBSCRIPTION_ID)).thenReturn(false);

        service.resume(SUBSCRIPTION_ID, new ResumeSubscriptionRequest(d("10-14"), null), CUSTOMER);

        verify(capacity).reacquireForResume(subscription, d("10-14"));
    }

    @Test
    void resumeAllowedOnceTheAutomaticRestartIsOverdue() {
        owned("PAUSED");
        // The restart was due on 8 October but never ran (switched off or failed): the customer must still get out.
        when(lifecycle.pauseUsage(SUBSCRIPTION_ID)).thenReturn(new PauseUsage(d("10-04"), 0, d("10-05"), d("10-08")));
        when(capacity.hasCommittedCapacity(SUBSCRIPTION_ID)).thenReturn(true);

        service.resume(SUBSCRIPTION_ID, new ResumeSubscriptionRequest(d("10-14"), null), CUSTOMER);

        verify(lifecycle).resume(eq(SUBSCRIPTION_ID), eq(CUSTOMER_ID), eq(d("10-14")), any());
    }

    @Test
    void autoResumeRestoresReleasedCapacityWithoutStrictChecks() {
        when(capacity.hasCommittedCapacity(SUBSCRIPTION_ID)).thenReturn(false);

        assertThat(service.autoResume(SUBSCRIPTION_ID, CUSTOMER_ID, d("10-14"))).isTrue();

        verify(capacity).restoreForAutoResume(subscription);
        verify(capacity, never()).reacquireForResume(any(), any());
        verify(lifecycle).closePause(SUBSCRIPTION_ID, d("10-14"));
    }

    private void owned(String status) {
        when(subscription.status()).thenReturn(status);
        when(lifecycle.findOwned(SUBSCRIPTION_ID, CUSTOMER_ID)).thenReturn(Optional.of(
            new OwnedSubscription(SUBSCRIPTION_ID, CUSTOMER_ID, PLAN_ID, status, d("10-12"))
        ));
    }

    private static SubscriptionPolicyResponse policy() {
        return new SubscriptionPolicyResponse(
            UUID.randomUUID(), PLAN_ID, 2, "ACTIVE", true, true, true, true,
            0, 1440, 0, 1440, null, null, null, null, NOW, NOW, NOW
        );
    }
}
