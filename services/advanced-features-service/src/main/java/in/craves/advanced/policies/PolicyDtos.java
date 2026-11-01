package in.craves.advanced.policies;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class PolicyDtos {
    private PolicyDtos() { }

    public enum PolicyType {
        SERVICEABILITY("serviceability"), CANCELLATION("cancellation"), PROVIDER_RANKING("provider-ranking"),
        NOTIFICATION_FREQUENCY("notification-frequency");

        final String slug;

        PolicyType(String slug) {
            this.slug = slug;
        }
    }

    public enum PolicyStatus { DRAFT, ACTIVE, RETIRED }

    // ----- Policy documents (what staff enter; every field is a business value, none has a default) -----

    /** Straight-line distance limit from kitchen to customer, optionally per city, and cities where ordering is paused. */
    public record ServiceabilityPolicy(Integer maxDistanceMeters, Map<String, Integer> cityMaxDistanceMeters, List<String> pausedCities) { }

    public enum CancelStage { PLACED, COOKING, READY, ON_THE_WAY }

    public enum CancelledBy { CUSTOMER, CHEF, PLATFORM }

    /** One rule per stage and party; a missing combination means "not allowed". */
    public record CancellationRule(CancelStage stage, CancelledBy cancelledBy, Boolean allowed, Integer foodRefundPercent, Boolean deliveryFeeRefunded,
                                   Boolean platformFeeRefunded) { }

    public record CancellationPolicy(List<CancellationRule> rules) { }

    /** Weights 0–100 (at least one above 0); disabled providers and an optional ETA ceiling exclude candidates. */
    public record ProviderRankingPolicy(Integer priceWeight, Integer etaWeight, Integer reliabilityWeight, List<String> disabledProviders,
                                        Integer maxEtaMinutes) { }

    public record NotificationCap(Integer maxPerDay, Integer minGapMinutes) { }

    /** Per category caps (rolling 24 hours, minimum gap) and optional India-time quiet hours ("22:00" to "08:00") with exempt categories. */
    public record NotificationFrequencyPolicy(Map<String, NotificationCap> categories, String quietStart, String quietEnd,
                                              List<String> quietExemptCategories) { }

    // ----- Versions -----

    public record PolicyDraftRequest(@NotNull JsonNode document, @Size(max = 500) String note) { }

    public record PolicyVersionView(UUID id, String type, int version, JsonNode document, String note, PolicyStatus status, UUID createdBy,
                                    Instant createdAt, UUID activatedBy, Instant activatedAt) { }

    // ----- Evaluations (pure: nothing is stored) -----

    public record ServiceabilityCheck(@NotNull @DecimalMin("-90") @DecimalMax("90") Double kitchenLatitude,
                                      @NotNull @DecimalMin("-180") @DecimalMax("180") Double kitchenLongitude,
                                      @NotNull @DecimalMin("-90") @DecimalMax("90") Double customerLatitude,
                                      @NotNull @DecimalMin("-180") @DecimalMax("180") Double customerLongitude,
                                      @Size(max = 60) String city) { }

    public record ServiceabilityVerdict(boolean serviceable, String reason, long distanceMeters, int limitMeters, int policyVersion) { }

    public record CancellationCheck(@NotBlank @Size(max = 40) String orderStatus, @NotNull CancelledBy cancelledBy,
                                    @NotNull @Min(0) @Max(10_000_000_000L) Long foodPaise, @NotNull @Min(0) @Max(10_000_000_000L) Long deliveryFeePaise,
                                    @NotNull @Min(0) @Max(10_000_000_000L) Long platformFeePaise, @NotNull @Min(0) @Max(10_000_000_000L) Long paidPaise) { }

    /** reason: OK, NOT_CANCELLABLE (no stage applies), NO_RULE or NOT_ALLOWED. The total never exceeds what was paid. */
    public record CancellationVerdict(boolean allowed, String reason, CancelStage stage, long foodRefundPaise, long deliveryFeeRefundPaise,
                                      long platformFeeRefundPaise, long totalRefundPaise, int policyVersion) { }

    public record ProviderCandidate(@NotNull @Pattern(regexp = "[A-Z0-9_]{2,30}") String provider, @NotNull @Min(0) @Max(10_000_000L) Long pricePaise,
                                    @NotNull @Min(0) @Max(1440) Integer etaMinutes, @DecimalMin("0") @DecimalMax("1") Double successRate) { }

    public record ProviderRankingCheck(@NotNull @Size(min = 1, max = 20) List<@Valid @NotNull ProviderCandidate> candidates) { }

    /** score 0–1000; excluded ones carry a reason (DISABLED, TOO_SLOW) and come last. */
    public record RankedProvider(String provider, boolean eligible, String reason, int score) { }

    public record ProviderRankingVerdict(List<RankedProvider> providers, int policyVersion) { }

    public record NotificationCheck(@NotNull @Pattern(regexp = "[A-Z0-9_]{2,40}") String category, Instant at,
                                    @NotNull @Size(max = 1000) List<@NotNull Instant> sentAt) { }

    /** reason: OK, NOT_CONFIGURED, DAILY_LIMIT, TOO_SOON or QUIET_HOURS; nextAllowedAt is the earliest time the failed rules allow. */
    public record NotificationVerdict(boolean allowed, String reason, Instant nextAllowedAt, int policyVersion) { }
}
