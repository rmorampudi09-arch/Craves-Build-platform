package in.craves.subscription.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanInput;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanResponse;
import in.craves.subscription.plan.ChefPlanModels.ReviewChefPlanRequest;
import in.craves.subscription.policy.DefaultSubscriptionPolicyService;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.schedule.PlanScheduleModels.PlanScheduleResponse;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class ChefPlanWorkflowServiceTest {
    private static final UUID CHEF_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID PLAN_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final UUID ADMIN_ID = UUID.fromString("77777777-7777-4777-8777-777777777777");

    private final ChefPlanRepository repository = mock(ChefPlanRepository.class);
    private final ChefPlanScheduleService schedules = mock(ChefPlanScheduleService.class);
    private final DefaultSubscriptionPolicyService defaultPolicy = mock(DefaultSubscriptionPolicyService.class);
    private final SubscriptionRepository subscriptionRepository = mock(SubscriptionRepository.class);
    private final CapacityService capacity = mock(CapacityService.class);
    private final PlanImageRepository images = mock(PlanImageRepository.class);
    private final ChefPlanWorkflowService service = new ChefPlanWorkflowService(repository, schedules, defaultPolicy, subscriptionRepository, capacity, images);

    @Test
    void chefCreatesPlanForOwnIdentityAndServerGeneratesCode() {
        CurrentUser chef = new CurrentUser(CHEF_ID, "firebase-chef", "+919999999999", List.of("CHEF"));
        ChefPlanInput input = new ChefPlanInput("Weekly lunches", "Home lunches", "WEEKLY", new BigDecimal("1200.00"), "INR");
        when(repository.create(eq(CHEF_ID), any(String.class), any(ChefPlanInput.class)))
            .thenAnswer(invocation -> plan("DRAFT", invocation.getArgument(1)));

        ChefPlanResponse response = service.create(input, chef);

        assertThat(response.planCode()).startsWith("MEAL-");
        verify(repository).create(eq(CHEF_ID), any(String.class), any(ChefPlanInput.class));
        verify(defaultPolicy).ensureActiveDefault(PLAN_ID, CHEF_ID);
    }

    @Test
    void nonChefCannotCreateMealPlan() {
        CurrentUser customer = new CurrentUser(CHEF_ID, "firebase-customer", "+919999999999", List.of("CUSTOMER"));
        ChefPlanInput input = new ChefPlanInput("Weekly lunches", null, "WEEKLY", new BigDecimal("1200.00"), "INR");

        assertThatThrownBy(() -> service.create(input, customer))
            .isInstanceOf(ApiException.class)
            .extracting(error -> ((ApiException) error).getCode())
            .isEqualTo("ROLE_NOT_ALLOWED");
    }

    @Test
    void submitRequiresChefOwnedReadySchedule() {
        CurrentUser chef = new CurrentUser(CHEF_ID, "firebase-chef", "+919999999999", List.of("CHEF"));
        when(repository.requireOwned(PLAN_ID, CHEF_ID)).thenReturn(plan("DRAFT", "MEAL-ABC"));
        when(repository.submit(PLAN_ID, CHEF_ID, "Ready")).thenReturn(plan("PENDING_APPROVAL", "MEAL-ABC"));
        when(schedules.requireReadyForSubmission(PLAN_ID, chef)).thenReturn(mock(PlanScheduleResponse.class));

        ChefPlanResponse response = service.submit(PLAN_ID, "Ready", chef);

        assertThat(response.status()).isEqualTo("PENDING_APPROVAL");
        verify(schedules).requireReadyForSubmission(PLAN_ID, chef);
        verify(repository).submit(PLAN_ID, CHEF_ID, "Ready");
    }

    @Test
    void adminRejectsSubmittedPlanWithoutAuthoringMeals() {
        CurrentUser admin = new CurrentUser(ADMIN_ID, "firebase-admin", "+919000000000", List.of("SUBSCRIPTION_ADMIN"));
        when(repository.find(PLAN_ID)).thenReturn(Optional.of(plan("PENDING_APPROVAL", "MEAL-ABC")));
        when(repository.review(PLAN_ID, ADMIN_ID, false, "Change lunch timing")).thenReturn(plan("REJECTED", "MEAL-ABC"));

        ChefPlanResponse response = service.review(PLAN_ID, new ReviewChefPlanRequest("REJECT", "Change lunch timing"), admin);

        assertThat(response.status()).isEqualTo("REJECTED");
        verify(repository).review(PLAN_ID, ADMIN_ID, false, "Change lunch timing");
    }

    @Test
    void adminApprovalAutomaticallyEnsuresSafePlatformPolicy() {
        CurrentUser admin = new CurrentUser(ADMIN_ID, "firebase-admin", "+919000000000", List.of("PLATFORM_ADMIN"));
        when(repository.find(PLAN_ID)).thenReturn(Optional.of(plan("PENDING_APPROVAL", "MEAL-ABC")));
        when(schedules.activateSubmittedDraft(PLAN_ID, admin)).thenReturn(mock(PlanScheduleResponse.class));
        when(repository.review(PLAN_ID, ADMIN_ID, true, "Approved for launch")).thenReturn(plan("ACTIVE", "MEAL-ABC"));
        PlanResponse active = activePlan();
        when(subscriptionRepository.findPlanById(PLAN_ID)).thenReturn(Optional.of(active));
        when(capacity.isPlanBookable(active)).thenReturn(true);

        ChefPlanResponse response = service.review(PLAN_ID, new ReviewChefPlanRequest("APPROVE", "Approved for launch"), admin);

        assertThat(response.status()).isEqualTo("ACTIVE");
        verify(defaultPolicy).ensureActiveDefault(PLAN_ID, ADMIN_ID);
        verify(schedules).activateSubmittedDraft(PLAN_ID, admin);
    }

    @Test
    void approvalRequiresBookableChefCapacityAfterMealRevalidation() {
        CurrentUser admin = new CurrentUser(ADMIN_ID, "firebase-admin", "+919000000000", List.of("SUBSCRIPTION_ADMIN"));
        when(repository.find(PLAN_ID)).thenReturn(Optional.of(plan("PENDING_APPROVAL", "MEAL-ABC")));
        when(schedules.activateSubmittedDraft(PLAN_ID, admin)).thenReturn(mock(PlanScheduleResponse.class));
        when(repository.review(PLAN_ID, ADMIN_ID, true, "Approved for launch")).thenReturn(plan("ACTIVE", "MEAL-ABC"));
        PlanResponse active = activePlan();
        when(subscriptionRepository.findPlanById(PLAN_ID)).thenReturn(Optional.of(active));
        when(capacity.isPlanBookable(active)).thenReturn(false);

        assertThatThrownBy(() -> service.review(PLAN_ID, new ReviewChefPlanRequest("APPROVE", "Approved for launch"), admin))
            .isInstanceOf(ApiException.class)
            .extracting(error -> ((ApiException) error).getCode())
            .isEqualTo("PLAN_CAPACITY_NOT_READY");

        verify(defaultPolicy).ensureActiveDefault(PLAN_ID, ADMIN_ID);
        verify(schedules).activateSubmittedDraft(PLAN_ID, admin);
    }

    @Test
    void chefReplacesThePhotoOfADraftOrRejectedPlanAndTheContentTypeComesFromTheBytes() {
        CurrentUser chef = chef();
        byte[] jpeg = PlanImageValidatorTest.image("jpg", 32, 32);
        for (String status : List.of("DRAFT", "REJECTED")) {
            when(repository.requireOwned(PLAN_ID, CHEF_ID)).thenReturn(plan(status, "MEAL-ABC"));

            // The part claims image/png, but only the bytes decide the stored type.
            ChefPlanResponse response = service.putImage(PLAN_ID, upload("image/png", jpeg), chef);

            assertThat(response.status()).isEqualTo(status);
        }
        verify(images, times(2)).upsert(PLAN_ID, CHEF_ID, "image/jpeg", jpeg);
    }

    @Test
    void photoCannotChangeOnceThePlanIsSubmittedOrLiveAndTheFileIsNeverRead() throws Exception {
        CurrentUser chef = chef();
        MultipartFile file = mock(MultipartFile.class);
        for (String status : List.of("PENDING_APPROVAL", "ACTIVE", "INACTIVE")) {
            when(repository.requireOwned(PLAN_ID, CHEF_ID)).thenReturn(plan(status, "MEAL-ABC"));

            assertThatThrownBy(() -> service.putImage(PLAN_ID, file, chef))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.getCode()).isEqualTo("PLAN_NOT_EDITABLE");
                    assertThat(error.getStatus()).isEqualTo(409);
                });
        }
        verify(file, never()).getBytes();
        verify(images, never()).upsert(any(), any(), any(), any());
    }

    @Test
    void photoOfAPlanOwnedByAnotherChefLooksLikeAMissingPlanAndTheFileIsNeverRead() throws Exception {
        MultipartFile file = mock(MultipartFile.class);
        when(repository.requireOwned(PLAN_ID, CHEF_ID))
            .thenThrow(ApiException.notFound("PLAN_NOT_FOUND", "Meal plan was not found in your Chef workspace"));

        assertThatThrownBy(() -> service.putImage(PLAN_ID, file, chef()))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("PLAN_NOT_FOUND"));
        verify(file, never()).getBytes();
        verify(images, never()).upsert(any(), any(), any(), any());
    }

    @Test
    void unsupportedUndecodableOrEmptyPhotosAreRejectedBeforeAnythingIsStored() {
        when(repository.requireOwned(PLAN_ID, CHEF_ID)).thenReturn(plan("DRAFT", "MEAL-ABC"));
        byte[] jpegHeaderOnly = new byte[512];
        jpegHeaderOnly[0] = (byte) 0xFF;
        jpegHeaderOnly[1] = (byte) 0xD8;
        jpegHeaderOnly[2] = (byte) 0xFF;
        byte[] pngSignatureOnly = new byte[512];
        System.arraycopy(new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, 0, pngSignatureOnly, 0, 8);

        for (byte[] unsupported : List.of("GIF89a....".getBytes(), jpegHeaderOnly, pngSignatureOnly)) {
            assertThatThrownBy(() -> service.putImage(PLAN_ID, upload("image/jpeg", unsupported), chef()))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("PLAN_IMAGE_TYPE_UNSUPPORTED"));
        }
        assertThatThrownBy(() -> service.putImage(PLAN_ID, upload("image/jpeg", new byte[0]), chef()))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("PLAN_IMAGE_SIZE_INVALID"));
        assertThatThrownBy(() -> service.putImage(PLAN_ID, upload("image/jpeg", new byte[PlanImageValidator.MAX_BYTES + 1]), chef()))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("PLAN_IMAGE_SIZE_INVALID"));
        assertThatThrownBy(() -> service.putImage(PLAN_ID, null, chef()))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("PLAN_IMAGE_SIZE_INVALID"));
        verify(images, never()).upsert(any(), any(), any(), any());
    }

    @Test
    void anUploadThatCannotBeReadIsRejectedAsAnInvalidImage() throws Exception {
        when(repository.requireOwned(PLAN_ID, CHEF_ID)).thenReturn(plan("DRAFT", "MEAL-ABC"));
        MultipartFile broken = mock(MultipartFile.class);
        when(broken.getBytes()).thenThrow(new IOException("client went away"));

        assertThatThrownBy(() -> service.putImage(PLAN_ID, broken, chef()))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("PLAN_IMAGE_SIZE_INVALID"));
        verify(images, never()).upsert(any(), any(), any(), any());
    }

    @Test
    void onlyChefsCanUploadAPhotoOrFlipTheSwitch() {
        CurrentUser customer = new CurrentUser(CHEF_ID, "firebase-customer", "+919999999999", List.of("CUSTOMER"));

        assertThatThrownBy(() -> service.putImage(PLAN_ID, upload("image/jpeg", PlanImageValidatorTest.image("jpg", 8, 8)), customer))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("ROLE_NOT_ALLOWED"));
        assertThatThrownBy(() -> service.setAcceptingSubscribers(PLAN_ID, false, customer))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("ROLE_NOT_ALLOWED"));
    }

    @Test
    void chefTurnsNewSubscriptionsOffAndOnForAnActivePlan() {
        when(repository.requireOwned(PLAN_ID, CHEF_ID)).thenReturn(plan("ACTIVE", "MEAL-ABC"));
        when(repository.setAcceptingSubscribers(PLAN_ID, CHEF_ID, false)).thenReturn(plan("ACTIVE", "MEAL-ABC", false));
        when(repository.setAcceptingSubscribers(PLAN_ID, CHEF_ID, true)).thenReturn(plan("ACTIVE", "MEAL-ABC", true));

        assertThat(service.setAcceptingSubscribers(PLAN_ID, false, chef()).acceptingSubscribers()).isFalse();
        assertThat(service.setAcceptingSubscribers(PLAN_ID, true, chef()).acceptingSubscribers()).isTrue();
    }

    @Test
    void acceptingSubscribersSwitchIsRefusedUnlessThePlanIsActive() {
        for (String status : List.of("DRAFT", "PENDING_APPROVAL", "REJECTED", "INACTIVE")) {
            when(repository.requireOwned(PLAN_ID, CHEF_ID)).thenReturn(plan(status, "MEAL-ABC"));

            assertThatThrownBy(() -> service.setAcceptingSubscribers(PLAN_ID, false, chef()))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.getCode()).isEqualTo("PLAN_NOT_ACTIVE");
                    assertThat(error.getStatus()).isEqualTo(409);
                });
        }
        verify(repository, never()).setAcceptingSubscribers(any(), any(), anyBoolean());
    }

    @Test
    void acceptingSubscribersSwitchOnAnotherChefsPlanLooksLikeAMissingPlan() {
        when(repository.requireOwned(PLAN_ID, CHEF_ID))
            .thenThrow(ApiException.notFound("PLAN_NOT_FOUND", "Meal plan was not found in your Chef workspace"));

        assertThatThrownBy(() -> service.setAcceptingSubscribers(PLAN_ID, true, chef()))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("PLAN_NOT_FOUND"));
    }

    private static MultipartFile upload(String clientContentType, byte[] bytes) {
        return new MockMultipartFile("file", "photo", clientContentType, bytes);
    }

    private static CurrentUser chef() {
        return new CurrentUser(CHEF_ID, "firebase-chef", "+919999999999", List.of("CHEF"));
    }

    private static PlanResponse activePlan() {
        return new PlanResponse(
            PLAN_ID, "MEAL-ABC", CHEF_ID, "Weekly lunches", null, "WEEKLY",
            new BigDecimal("1200.00"), "INR", "ACTIVE", Instant.now(), Instant.now()
        );
    }

    private static ChefPlanResponse plan(String status, String code) {
        return plan(status, code, true);
    }

    private static ChefPlanResponse plan(String status, String code, boolean acceptingSubscribers) {
        return new ChefPlanResponse(
            PLAN_ID, code, "Weekly lunches", "Home lunches", "WEEKLY", new BigDecimal("1200.00"), "INR",
            status, null, null, null, Instant.parse("2026-08-13T00:00:00Z"), Instant.parse("2026-08-13T00:00:00Z"), null, acceptingSubscribers
        );
    }
}
