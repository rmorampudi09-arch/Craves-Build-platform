package in.craves.subscription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.subscription.billing.SubscriptionBillingProperties;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.plan.PlanImageRepository;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.CreateSubscriptionRequest;
import in.craves.subscription.web.ApiDtos.CustomerSubscriptionResponse;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import in.craves.subscription.web.ApiDtos.PublicPlanResponse;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SubscriptionServiceOwnershipTest {
    private static final UUID CHEF_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID CUSTOMER_ID = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    private final SubscriptionRepository repository = mock(SubscriptionRepository.class);
    private final CapacityService capacityService = mock(CapacityService.class);
    private final PlanImageRepository planImages = mock(PlanImageRepository.class);
    private final SubscriptionBillingRepository billingRepository = mock(SubscriptionBillingRepository.class);

    private final SubscriptionService service =
        new SubscriptionService(repository, capacityService, planImages, billing(true, 7), billingRepository);

    private static final UUID SUBSCRIPTION_ID = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static final CurrentUser ADMIN = new CurrentUser(
        UUID.fromString("22222222-2222-4222-8222-222222222222"), "firebase-admin", "+917777777777", List.of("SUBSCRIPTION_ADMIN")
    );

    @Test
    void chefCannotUseAdministratorPlanListing() {
        CurrentUser chef = new CurrentUser(CHEF_ID, "firebase-chef", "+919999999999", List.of("CHEF"));

        assertThatThrownBy(() -> service.listAllPlans(chef))
            .isInstanceOf(ApiException.class)
            .extracting(error -> ((ApiException) error).getCode())
            .isEqualTo("ROLE_NOT_ALLOWED");
    }

    @Test
    void publicPlanDoesNotExposeChefIdentityWhenCapacityIsBookable() {
        UUID planId = UUID.fromString("44444444-4444-4444-8444-444444444444");
        PlanResponse stored = plan(CHEF_ID, "ACTIVE");
        when(repository.findActivePlanById(planId)).thenReturn(Optional.of(stored));
        when(capacityService.isPlanBookable(stored)).thenReturn(true);

        Object publicPlan = service.getPlan(planId);

        assertThat(publicPlan).hasNoNullFieldsOrPropertiesExcept("description", "imageUrl");
        assertThat(publicPlan.toString()).doesNotContain(CHEF_ID.toString());
    }

    @Test
    void publicPlanCarriesImageUrlOnlyWhenAnImageExists() {
        UUID planId = UUID.fromString("44444444-4444-4444-8444-444444444444");
        PlanResponse stored = plan(CHEF_ID, "ACTIVE");
        when(repository.findActivePlanById(planId)).thenReturn(Optional.of(stored));
        when(capacityService.isPlanBookable(stored)).thenReturn(true);

        assertThat(service.getPlan(planId).imageUrl()).isNull();

        String path = "/api/v1/subscriptions/plans/" + planId + "/image?v=1790000000";
        when(planImages.findImagePath(planId)).thenReturn(path);
        PublicPlanResponse withImage = service.getPlan(planId);

        assertThat(withImage.imageUrl()).isEqualTo(path);
    }

    @Test
    void planNotAcceptingSubscribersIsRejectedBeforeAnySubscriptionIsCreated() {
        CurrentUser customer = new CurrentUser(CUSTOMER_ID, "firebase-customer", "+918888888888", List.of("CUSTOMER"));
        UUID planId = UUID.fromString("44444444-4444-4444-8444-444444444444");
        PlanResponse stored = plan(CHEF_ID, "ACTIVE");
        when(repository.findActivePlanById(planId)).thenReturn(Optional.of(stored));
        when(repository.isPlanAcceptingSubscribers(planId)).thenReturn(false);
        when(capacityService.isPlanBookable(stored)).thenReturn(true);
        CreateSubscriptionRequest request = new CreateSubscriptionRequest(
            planId, LocalDate.now().plusDays(1), UUID.fromString("66666666-6666-4666-8666-666666666666"), null
        );

        assertThatThrownBy(() -> service.createSubscription(request, "enroll-key-0001", customer))
            .isInstanceOfSatisfying(ApiException.class, error -> {
                assertThat(error.getStatus()).isEqualTo(409);
                assertThat(error.getCode()).isEqualTo("PLAN_NOT_ACCEPTING_SUBSCRIBERS");
            });

        verify(repository, never()).createSubscription(any(), any(), any(), any(), any(), any());
    }

    @Test
    void missingPlanImageIsAnApiNotFound() {
        UUID planId = UUID.fromString("44444444-4444-4444-8444-444444444444");
        when(planImages.findImage(planId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getPlanImage(planId))
            .isInstanceOfSatisfying(ApiException.class, error -> {
                assertThat(error.getStatus()).isEqualTo(404);
                assertThat(error.getCode()).isEqualTo("PLAN_IMAGE_NOT_FOUND");
            });
    }

    @Test
    void soldOutPlanIsHiddenFromPublicDetail() {
        UUID planId = UUID.fromString("44444444-4444-4444-8444-444444444444");
        PlanResponse stored = plan(CHEF_ID, "ACTIVE");
        when(repository.findActivePlanById(planId)).thenReturn(Optional.of(stored));
        when(capacityService.isPlanBookable(stored)).thenReturn(false);

        assertThatThrownBy(() -> service.getPlan(planId))
            .isInstanceOf(ApiException.class)
            .extracting(error -> ((ApiException) error).getCode())
            .isEqualTo("PLAN_NOT_BOOKABLE");
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
            Instant.parse("2026-07-30T00:00:00Z"),
            "Weekly meals",
            "WEEKLY",
            new BigDecimal("1200.00"),
            "INR",
            TODAY.plusDays(10),
            "/api/v1/subscriptions/plans/44444444-4444-4444-8444-444444444444/image?v=1790000000"
        );
        when(repository.findSubscriptionById(subscriptionId)).thenReturn(Optional.of(stored));

        CustomerSubscriptionResponse response = service.getMine(subscriptionId, customer);

        assertThat(response.toString()).doesNotContain(CUSTOMER_ID.toString(), CHEF_ID.toString());
        assertThat(response.planName()).isEqualTo("Weekly meals");
        assertThat(response.billingPeriod()).isEqualTo("WEEKLY");
        assertThat(response.amount()).isEqualByComparingTo("1200.00");
        assertThat(response.currency()).isEqualTo("INR");
        // The cycle starting in 10 days is charged 7 days early.
        assertThat(response.nextBillingDate()).isEqualTo(TODAY.plusDays(3));
        assertThat(response.planImageUrl()).endsWith("/image?v=1790000000");
    }

    @Test
    void nextChargeDateIsTheBillingLeadBeforeTheNextCycleAndNeverInThePast() {
        LocalDate today = LocalDate.parse("2026-10-11");
        assertThat(SubscriptionService.nextChargeDate(LocalDate.parse("2026-10-25"), billing(true, 7), today))
            .isEqualTo("2026-10-18");
        // A weekly cycle that already started: its successor is charged now, not a week late.
        assertThat(SubscriptionService.nextChargeDate(LocalDate.parse("2026-10-15"), billing(true, 7), today))
            .isEqualTo(today);
        assertThat(SubscriptionService.nextChargeDate(null, billing(true, 7), today)).isNull();
        // With automatic billing off nothing renews, so no date is promised.
        assertThat(SubscriptionService.nextChargeDate(LocalDate.parse("2026-10-25"), billing(false, 7), today)).isNull();
    }

    @Test
    void adminResumeCarriesPausedPaidDaysForward() {
        when(repository.findSubscriptionById(SUBSCRIPTION_ID)).thenReturn(Optional.of(subscription("PAUSED", null)));

        service.adminChangeStatus(SUBSCRIPTION_ID, "ACTIVE", "Customer asked by phone", ADMIN);

        // With no next service date the admin resume starts today.
        verify(billingRepository).applyPauseCredit(SUBSCRIPTION_ID, TODAY);
    }

    @Test
    void adminActivationOfAnUnpaidSignUpAppliesNoCredit() {
        when(repository.findSubscriptionById(SUBSCRIPTION_ID)).thenReturn(Optional.of(subscription("PENDING_PAYMENT", null)));

        service.adminChangeStatus(SUBSCRIPTION_ID, "ACTIVE", "Paid by bank transfer", ADMIN);

        verify(billingRepository, never()).applyPauseCredit(any(), any());
    }

    private static SubscriptionResponse subscription(String status, LocalDate nextServiceDate) {
        return new SubscriptionResponse(
            SUBSCRIPTION_ID, CUSTOMER_ID, UUID.fromString("44444444-4444-4444-8444-444444444444"), CHEF_ID, status,
            TODAY.minusDays(14), null, nextServiceDate, UUID.fromString("66666666-6666-4666-8666-666666666666"), null,
            Instant.parse("2026-07-30T00:00:00Z"), Instant.parse("2026-07-30T00:00:00Z"),
            "Weekly meals", "WEEKLY", new BigDecimal("1200.00"), "INR", TODAY, null
        );
    }

    private static SubscriptionBillingProperties billing(boolean generatorEnabled, int horizonDays) {
        SubscriptionBillingProperties properties = new SubscriptionBillingProperties();
        properties.setGeneratorEnabled(generatorEnabled);
        properties.setHorizonDays(horizonDays);
        return properties;
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
