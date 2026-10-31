package in.craves.advanced.experiments;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class ExperimentDtos {
    static final String KEY = "[a-z][a-z0-9-]{1,39}";
    static final String EVENT_NAME = "[a-z][a-z0-9_.]{1,59}";

    private ExperimentDtos() { }

    public enum ExperimentStatus { DRAFT, RUNNING, STOPPED }

    /** weight is relative: a variant with weight 3 gets three times the people of a variant with weight 1. */
    public record ExperimentVariant(@NotNull @Pattern(regexp = KEY) String key, @NotNull @Min(1) @Max(10000) Integer weight) { }

    public record NewExperiment(@NotNull @Pattern(regexp = KEY) String key,
                                @NotBlank @Size(max = 300) String description,
                                @NotNull @Size(min = 2, max = 5) List<@Valid @NotNull ExperimentVariant> variants) { }

    /** Only drafts can change; a running experiment's variants are frozen so nobody moves between them. */
    public record ExperimentDraftChange(@NotBlank @Size(max = 300) String description,
                                        @NotNull @Size(min = 2, max = 5) List<@Valid @NotNull ExperimentVariant> variants,
                                        @NotNull Long expectedVersion) { }

    public record ExperimentTransition(@NotNull Long expectedVersion) { }

    public record ExperimentView(String key, String description, List<ExperimentVariant> variants, ExperimentStatus status, long version,
                                 Instant createdAt, Instant updatedAt, Instant startedAt, Instant stoppedAt) { }

    /** variant is null when the experiment is not running (the app shows its default). */
    public record ExperimentAssignment(String experimentKey, String variant) { }

    public record AnalyticsEvent(@NotNull UUID eventId,
                                 @NotNull @Pattern(regexp = EVENT_NAME) String name,
                                 @Pattern(regexp = KEY) String experimentKey,
                                 @NotNull Instant occurredAt,
                                 @Size(max = 10) Map<@Pattern(regexp = "[a-zA-Z][a-zA-Z0-9_]{0,39}") String, Object> properties) { }

    public record AnalyticsEventBatch(@NotEmpty @Size(max = 50) List<@Valid @NotNull AnalyticsEvent> events) { }

    /** recorded is 0 when the person has not turned on product analytics: nothing is kept. */
    public record AnalyticsReceipt(int accepted, int recorded, boolean consented) { }

    /** Counts under the reporting threshold are null so no small group can be singled out. */
    public record VariantResult(String variant, Long people, Long peopleWithEvent, Long events) { }

    public record ExperimentResults(String experimentKey, String eventName, int suppressedBelow, List<VariantResult> variants) { }

    public record DailyEventCount(LocalDate day, Long people, Long events) { }

    public record EventCounts(String eventName, int suppressedBelow, List<DailyEventCount> days) { }
}
