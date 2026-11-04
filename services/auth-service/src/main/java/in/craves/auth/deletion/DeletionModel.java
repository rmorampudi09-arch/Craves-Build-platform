package in.craves.auth.deletion;

import java.time.Instant;
import java.util.UUID;

/** Enums and rows of the account deletion tables. Open = PENDING_REVIEW, SCHEDULED, WAITING_ON_OPEN_ITEMS, ERASING. */
public final class DeletionModel {
    private DeletionModel() {}

    public enum Scope { CUSTOMER, CHEF, ALL }
    public enum RequestStatus { PENDING_REVIEW, SCHEDULED, WAITING_ON_OPEN_ITEMS, ERASING, COMPLETED, CANCELLED, REJECTED }
    public enum Via { APP, WEB }
    public enum Phase { PREPARE, ERASE, RELEASE, SWEEP }
    public enum StepStatus { PENDING, DONE, BLOCKED }

    public record DeletionRequest(
        UUID id, UUID identityId, Scope scope, RequestStatus status, Via via,
        Instant requestedAt, Instant dueAt, UUID reviewedBy, Instant reviewedAt, String reviewNote,
        String blockersJson, Instant nextCheckAt, Instant lockedAt, Instant reminderSentAt,
        Instant finalNoticeSentAt, Instant completedAt, Instant cancelledAt
    ) {}

    public record DeletionStep(
        UUID requestId, Phase phase, String service, StepStatus status, int attempts,
        String lastError, Integer erasedCount, Instant nextAttemptAt, Instant completedAt
    ) {}
}
