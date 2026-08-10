package in.craves.subscription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.CreatePlanRequest;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SubscriptionServiceOwnershipTest {
    private static final UUID CHEF_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID OTHER_CHEF_ID = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID CUSTOMER_ID = UUID.fromString("33333333-3333-4333-8333-333333333333");

    private final SubscriptionRepository repository = mock(SubscriptionRepository.class);
    private final SubscriptionService service = new SubscriptionService(repository);

    @Test
    void chefCannotCreateOrManageMealPlans() {
        CurrentUser chef = new CurrentUser(CHEF_ID, "firebase-chef", "+919999999999", List.of("CHEF"));
        CreatePlanRequest request = new CreatePlanRequest(
            "WEEKLY-01",
            OTHER_CHEF_ID,
            "Weekly meals",
            "Chef plan",
            "WEEKLY",
            new BigDecimal("1200.00"),
            "INR"
        );

        assertThatThrownBy(() -> service.createPlan(request, chef))
            .isInstanceOf(ApiException.class)
            .extracting(error -> ((ApiException) error).getCode())
            .isEqualTo("ROLE_NOT_ALLOWED");
        assertThatThrownBy(() -> service.listAllPlans(chef))
            .isInstanceOf(ApiException.class)
            .extracting(error -> ((ApiException) error).getCode())
            .isEqualTo("ROLE_NOT_ALLOWED");
    }

    @Test
    void subscriptionAdminAssignsApprovedChefReferenceToPlan() {
        CurrentUser admin = new CurrentUser(
            UUID.fromString("77777777-7777-4777-8777-777777777777"),
            "firebase-admin",
            "+919000000000",
            List.of("SUBSCRIPTION_ADMIN")
        );
        CreatePlanRequest request = new CreatePlanRequest(
            "WEEKLY-01",
            CHEF_ID,
            "Weekly meals",
            "Chef plan",
            "WEEKLY",
            new BigDecimal("1200.00"),
            "INR"
        );
        PlanResponse created = plan(CHEF_ID, "DRAFT");
        when(repository.createPlan(any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(created);

        PlanResponse response = service.createPlan(request, admin);

        assertThat(response.chefIdentityId()).isEqualTo(CHEF_ID);
        verify(repository).createPlan(
            eq("WEEKLY-01"),
            eq(CHEF_ID),
            eq("Weekly meals"),
            eq("Chef plan"),
            eq("WEEKLY"),
            eq(new BigDecimal("1200.00")),
            eq("INR"),
            eq(admin.identityId())
        );
    }

    @Test
    void publicPlanDoesNotExposeChefIdentity() {
        UUID planId = UUID.fromString("44444444-4444-4444-8444-444444444444");
        when(repository.findActivePlanById(planId)).thenReturn(Optional.of(plan(CHEF_ID, "ACTIVE")));

        Object publicPlan = service.getPlan(planId);

        assertThat(publicPlan).hasNoNullFieldsOrPropertiesExcept("description");
        assertThat(publicPlan.toString()).doesNotContain(CHEF_ID.toString());
    }

    @Test
    void customerSubscriptionResponseDoesNotExposeIdentityIds() {
        CurrentUser customer = new CurrentUser(CUSTOMER_ID, "firebase-customer", "+918888888888", List.of("CUSTOMER"));
        UUID subscriptionId = UUID.fromString("55555555-5555-4555-8555-555555555555");
        SubscriptionResponse stored = new SubscriptionResponse(
            subscriptionId,
            CUSTOMER_ID,
            UUID.fromString("44444444-4444-4444-8444-444444444444"),
            CHEF_ID,
            "ACTIVE",
            LocalDate.now(),
            null,
            LocalDate.now().plusDays(1),
            UUID.fromString("66666666-6666-4666-8666-666666666666"),
            null,
            Instant.parse("2026-07-30T00:00:00Z"),
            Instant.parse("2026-07-30T00:00:00Z")
        );
        when(repository.findSubscriptionById(subscriptionId)).thenReturn(Optional.of(stored));

        Object response = service.getMine(subscriptionId, customer);

        assertThat(response.toString()).doesNotContain(CUSTOMER_ID.toString(), CHEF_ID.toString());
    }

    private static PlanResponse plan(UUID chefIdentityId, String status) {
        return new PlanResponse(
            UUID.fromString("44444444-4444-4444-8444-444444444444"),
            "WEEKLY-01",
            chefIdentityId,
            "Weekly meals",
            "Chef plan",
            "WEEKLY",
            new BigDecimal("1200.00"),
            "INR",
            status,
            Instant.parse("2026-07-30T00:00:00Z"),
            Instant.parse("2026-07-30T00:00:00Z")
        );
    }
}
