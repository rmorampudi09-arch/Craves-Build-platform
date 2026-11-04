package in.craves.subscription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.subscription.billing.SubscriptionBillingProperties;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.credit.DayCreditRepository;
import in.craves.subscription.credit.DayCreditService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository;
import in.craves.subscription.occurrence.OccurrenceRepository;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanInput;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanResponse;
import in.craves.subscription.plan.ChefPlanRepository;
import in.craves.subscription.plan.ChefPlanScheduleService;
import in.craves.subscription.plan.ChefPlanWorkflowService;
import in.craves.subscription.plan.PlanImageRepository;
import in.craves.subscription.policy.DefaultSubscriptionPolicyService;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.CreateSubscriptionRequest;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** While an account deletion is pending the side being deleted may not start anything new; the other side is untouched. */
class SubscriptionDeletionGuardTest {
    private static final UUID PERSON = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID PLAN_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");

    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final SubscriptionService subscriptionService = new SubscriptionService(
        subscriptions, mock(CapacityService.class), mock(PlanImageRepository.class), new SubscriptionBillingProperties(),
        new DayCreditService(mock(DayCreditRepository.class), mock(SubscriptionBillingRepository.class), mock(OccurrenceRepository.class), false, Clock.systemUTC()),
        mock(SubscriptionLifecycleRepository.class)
    );
    private final ChefPlanRepository plans = mock(ChefPlanRepository.class);
    private final ChefPlanWorkflowService chefPlans = new ChefPlanWorkflowService(
        plans, mock(ChefPlanScheduleService.class), mock(DefaultSubscriptionPolicyService.class), subscriptions,
        mock(CapacityService.class), mock(PlanImageRepository.class)
    );

    private static CurrentUser user(String role, String deletionPendingScope) {
        return new CurrentUser(PERSON, "firebase-test", "+919999999999", List.of(role), deletionPendingScope);
    }

    private static ChefPlanResponse activePlan(boolean accepting) {
        return new ChefPlanResponse(PLAN_ID, "MEAL-ABC", "Weekly lunches", null, "WEEKLY", new BigDecimal("1200.00"), "INR",
            "ACTIVE", null, null, null, Instant.now(), Instant.now(), null, accepting, 0);
    }

    private final CreateSubscriptionRequest request =
        new CreateSubscriptionRequest(PLAN_ID, LocalDate.now().plusDays(1), UUID.randomUUID(), null);

    @Test
    void createSubscriptionIsRefusedWhileCustomerSideDeletionIsPending() {
        for (String scope : new String[]{"CUSTOMER", "ALL"}) {
            assertThatThrownBy(() -> subscriptionService.createSubscription(request, "enroll-key-0001", user("CUSTOMER", scope)))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.getStatus()).isEqualTo(409);
                    assertThat(error.getCode()).isEqualTo("ACCOUNT_DELETION_PENDING");
                    assertThat(error.getMessage()).isEqualTo("Your account is set to be deleted. Tap Keep my account to start a meal plan.");
                });
        }
        verifyNoInteractions(subscriptions);

        // Chef-only deletion, or none, gets past the guard; the empty mocks then stop it at the plan lookup.
        for (String scope : new String[]{"CHEF", null}) {
            assertThatThrownBy(() -> subscriptionService.createSubscription(request, "enroll-key-0001", user("CUSTOMER", scope)))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("PLAN_NOT_ACTIVE"));
        }
    }

    @Test
    void reopeningAPlanIsRefusedWhileChefSideDeletionIsPending() {
        when(plans.requireOwned(PLAN_ID, PERSON)).thenReturn(activePlan(false));
        for (String scope : new String[]{"CHEF", "ALL"}) {
            assertThatThrownBy(() -> chefPlans.setAcceptingSubscribers(PLAN_ID, true, user("CHEF", scope)))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.getStatus()).isEqualTo(409);
                    assertThat(error.getCode()).isEqualTo("ACCOUNT_DELETION_PENDING");
                    assertThat(error.getMessage()).isEqualTo("Your account is set to be deleted. Tap Keep my account to take new subscribers.");
                });
        }
        verify(plans, never()).setAcceptingSubscribers(any(), any(), anyBoolean());

        // Turning it off stays allowed, and so does reopening for a customer-only deletion.
        when(plans.setAcceptingSubscribers(PLAN_ID, PERSON, false)).thenReturn(activePlan(false));
        when(plans.setAcceptingSubscribers(PLAN_ID, PERSON, true)).thenReturn(activePlan(true));
        assertThatCode(() -> chefPlans.setAcceptingSubscribers(PLAN_ID, false, user("CHEF", "ALL"))).doesNotThrowAnyException();
        assertThatCode(() -> chefPlans.setAcceptingSubscribers(PLAN_ID, true, user("CHEF", "CUSTOMER"))).doesNotThrowAnyException();
    }

    @Test
    void creatingAMealPlanIsRefusedWhileChefSideDeletionIsPending() {
        ChefPlanInput input = new ChefPlanInput("Weekly lunches", null, "WEEKLY", new BigDecimal("1200.00"), "INR");
        for (String scope : new String[]{"CHEF", "ALL"}) {
            assertThatThrownBy(() -> chefPlans.create(input, user("CHEF", scope)))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.getStatus()).isEqualTo(409);
                    assertThat(error.getCode()).isEqualTo("ACCOUNT_DELETION_PENDING");
                    assertThat(error.getMessage()).isEqualTo("Your account is set to be deleted. Tap Keep my account to create meal plans.");
                });
        }
        verifyNoInteractions(plans);

        // A customer-only deletion, or none, leaves plan creation alone.
        when(plans.create(any(), any(String.class), any(ChefPlanInput.class))).thenReturn(activePlan(true));
        for (String scope : new String[]{"CUSTOMER", null}) {
            assertThatCode(() -> chefPlans.create(input, user("CHEF", scope))).doesNotThrowAnyException();
        }
    }
}
