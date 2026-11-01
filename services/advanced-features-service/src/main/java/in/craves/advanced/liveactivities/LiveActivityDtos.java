package in.craves.advanced.liveactivities;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.util.UUID;

public final class LiveActivityDtos {
    private LiveActivityDtos() { }

    /** Stages the app draws; step 0–5 for a progress bar. ENDED: rejected, cancelled or refunded. UNKNOWN: a status this build does not know. */
    public enum LiveOrderStage { PAYMENT_PENDING, PLACED, COOKING, READY, ON_THE_WAY, DELIVERED, ENDED, UNKNOWN }

    /** pushToken: the ActivityKit push token as hex. */
    public record LiveActivityRegistration(@NotNull @Pattern(regexp = "[0-9a-fA-F]{32,256}") String pushToken) { }

    /** The ActivityKit content state; final=true means the app should end the activity (dismiss after showing it). */
    public record LiveOrderState(UUID orderId, String orderStatus, LiveOrderStage stage, int step, boolean isFinal, Instant updatedAt) { }

    /** The token is never echoed back. */
    public record LiveActivityView(UUID orderId, boolean active, Instant createdAt, Instant endedAt) { }
}
