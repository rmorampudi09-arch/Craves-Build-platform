package in.craves.subscription.occurrence;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.subscription.occurrence.OccurrenceRepository.ActiveSchedule;
import in.craves.subscription.occurrence.OccurrenceRepository.ScheduleItem;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OccurrenceGeneratorServiceTest {
    @Test
    void selectsWeeklyItemsAndNextDate() {
        ScheduleItem monday = new ScheduleItem(UUID.randomUUID(), 1, 1, null, 1);
        ScheduleItem wednesday = new ScheduleItem(UUID.randomUUID(), 2, 3, null, 1);
        ActiveSchedule schedule = new ActiveSchedule(
            UUID.randomUUID(), "WEEKLY", "Asia/Kolkata", LocalTime.NOON, 24, 1, List.of(monday, wednesday)
        );
        LocalDate mondayDate = LocalDate.of(2026, 8, 3);

        assertThat(OccurrenceGeneratorService.matchingItems(schedule, mondayDate)).containsExactly(monday);
        assertThat(OccurrenceGeneratorService.nextMatchingDate(schedule, mondayDate))
            .isEqualTo(LocalDate.of(2026, 8, 5));
    }

    @Test
    void selectsMonthlyDayAndRollsAcrossMonth() {
        ScheduleItem item = new ScheduleItem(UUID.randomUUID(), 1, null, 5, 1);
        ActiveSchedule schedule = new ActiveSchedule(
            UUID.randomUUID(), "MONTHLY", "Asia/Kolkata", LocalTime.NOON, 48, 1, List.of(item)
        );
        LocalDate serviceDate = LocalDate.of(2026, 8, 5);

        assertThat(OccurrenceGeneratorService.matchingItems(schedule, serviceDate)).containsExactly(item);
        assertThat(OccurrenceGeneratorService.nextMatchingDate(schedule, serviceDate))
            .isEqualTo(LocalDate.of(2026, 9, 5));
    }
}
