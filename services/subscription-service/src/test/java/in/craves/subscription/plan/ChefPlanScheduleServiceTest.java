package in.craves.subscription.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.schedule.PlanCatalogClient;
import in.craves.subscription.schedule.PlanCatalogClient.MenuItem;
import in.craves.subscription.schedule.PlanScheduleModels.PlanScheduleResponse;
import in.craves.subscription.schedule.PlanScheduleModels.PutScheduleRequest;
import in.craves.subscription.schedule.PlanScheduleModels.ScheduleItemRequest;
import in.craves.subscription.schedule.PlanScheduleModels.ScheduleItemResponse;
import in.craves.subscription.schedule.PlanScheduleRepository;
import in.craves.subscription.schedule.PlanScheduleRepository.PlanOwner;
import in.craves.subscription.security.CurrentUser;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ChefPlanScheduleServiceTest {
    private static final UUID CHEF_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID PLAN_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final UUID DISH_ID = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static final CurrentUser CHEF = new CurrentUser(CHEF_ID, "firebase-chef", "+919999999999", List.of("CHEF"));

    private final PlanScheduleRepository repository = mock(PlanScheduleRepository.class);
    private final PlanCatalogClient catalog = mock(PlanCatalogClient.class);
    private final ChefPlanScheduleService service = new ChefPlanScheduleService(repository, catalog);

    @Test
    void weeklyScheduleAllowedOnFortnightlyAndMonthlyPlans() {
        for (String billing : List.of("FORTNIGHTLY", "MONTHLY")) {
            PlanScheduleRepository fresh = mock(PlanScheduleRepository.class);
            ChefPlanScheduleService scoped = new ChefPlanScheduleService(fresh, catalog);
            when(fresh.findPlanOwner(PLAN_ID)).thenReturn(Optional.of(new PlanOwner(PLAN_ID, CHEF_ID, "DRAFT", billing)));
            when(catalog.requireSellableOwnedItem(DISH_ID, CHEF_ID)).thenReturn(dish());

            scoped.putOwned(PLAN_ID, put("WEEKLY", 7, null), CHEF);

            verify(fresh).replaceDraft(eq(PLAN_ID), eq("WEEKLY"), anyString(), anyInt(), anyList(), eq(CHEF_ID));
        }
    }

    @Test
    void dateScheduleRejected() {
        when(repository.findPlanOwner(PLAN_ID)).thenReturn(Optional.of(new PlanOwner(PLAN_ID, CHEF_ID, "DRAFT", "MONTHLY")));

        assertThatThrownBy(() -> service.putOwned(PLAN_ID, put("MONTHLY", null, 5), CHEF))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> {
                assertThat(((ApiException) error).getCode()).isEqualTo("DATE_SCHEDULES_RETIRED");
                assertThat(error.getMessage()).isEqualTo("Set up one week; it repeats every week.");
            });
    }

    @Test
    void submitRejectsLegacyDateSchedule() {
        when(repository.findPlanOwner(PLAN_ID)).thenReturn(Optional.of(new PlanOwner(PLAN_ID, CHEF_ID, "DRAFT", "MONTHLY")));
        when(repository.find(PLAN_ID)).thenReturn(Optional.of(schedule("MONTHLY", null, 5)));

        assertThatThrownBy(() -> service.requireReadyForSubmission(PLAN_ID, CHEF))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> {
                assertThat(((ApiException) error).getCode()).isEqualTo("DATE_SCHEDULES_RETIRED");
                assertThat(error.getMessage()).isEqualTo("This plan was set up by date. Set up one week again before submitting.");
            });
    }

    @Test
    void submitAcceptsWeeklyScheduleOnMonthlyPlan() {
        when(repository.findPlanOwner(PLAN_ID)).thenReturn(Optional.of(new PlanOwner(PLAN_ID, CHEF_ID, "DRAFT", "MONTHLY")));
        PlanScheduleResponse weekly = schedule("WEEKLY", 1, null);
        when(repository.find(PLAN_ID)).thenReturn(Optional.of(weekly));
        when(catalog.requireSellableOwnedItem(any(), any())).thenReturn(dish());

        assertThat(service.requireReadyForSubmission(PLAN_ID, CHEF)).isEqualTo(weekly);
    }

    private static PutScheduleRequest put(String recurrence, Integer weekday, Integer dayOfMonth) {
        return new PutScheduleRequest(recurrence, "Asia/Kolkata", 24, List.of(
            new ScheduleItemRequest(DISH_ID, 1, weekday, dayOfMonth, "LUNCH", LocalTime.of(12, 30), 1)
        ));
    }

    private static PlanScheduleResponse schedule(String recurrence, Integer weekday, Integer dayOfMonth) {
        return new PlanScheduleResponse(PLAN_ID, recurrence, "Asia/Kolkata", null, 24, "DRAFT", 1, List.of(
            new ScheduleItemResponse(UUID.randomUUID(), DISH_ID, "Dal rice", null, null, new BigDecimal("120.00"), "INR",
                1, weekday, dayOfMonth, "LUNCH", LocalTime.of(12, 30), 1)
        ), Instant.now(), Instant.now(), null);
    }

    private static MenuItem dish() {
        return new MenuItem(DISH_ID, UUID.randomUUID(), "Dal rice", null, "VEG", new BigDecimal("120.00"), "INR", true, "ACTIVE");
    }
}
