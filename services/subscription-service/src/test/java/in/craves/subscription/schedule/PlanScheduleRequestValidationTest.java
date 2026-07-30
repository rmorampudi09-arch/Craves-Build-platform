package in.craves.subscription.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.subscription.schedule.PlanScheduleModels.PutScheduleRequest;
import in.craves.subscription.schedule.PlanScheduleModels.ScheduleItemRequest;
import jakarta.validation.Validation;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PlanScheduleRequestValidationTest {
    @Test
    void rejectsEmptyScheduleItems() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            PutScheduleRequest request = new PutScheduleRequest(
                "WEEKLY", "Asia/Kolkata", LocalTime.NOON, 24, List.of()
            );
            assertThat(factory.getValidator().validate(request)).isNotEmpty();
        }
    }

    @Test
    void acceptsBoundedWeeklyItemShape() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            PutScheduleRequest request = new PutScheduleRequest(
                "WEEKLY",
                "Asia/Kolkata",
                LocalTime.of(12, 30),
                24,
                List.of(new ScheduleItemRequest(UUID.randomUUID(), 1, 1, null, 1))
            );
            assertThat(factory.getValidator().validate(request)).isEmpty();
        }
    }
}
