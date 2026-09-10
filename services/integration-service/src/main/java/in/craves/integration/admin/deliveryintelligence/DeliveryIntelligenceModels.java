package in.craves.integration.admin.deliveryintelligence;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class DeliveryIntelligenceModels {
    private DeliveryIntelligenceModels() {}

    public record OverviewResponse(
        OffsetDateTime generatedAt,
        int windowHours,
        Metrics metrics,
        List<HourlyActivity> hourlyActivity,
        List<ProviderShare> providerShare,
        RecoveryHealth recoveryHealth,
        List<ActivityItem> recentActivity,
        List<AttentionItem> attentionQueue
    ) {}

    public record Metrics(
        long commandCount,
        long completedCommandCount,
        long deliveryJobCount,
        long deliveredCount,
        long activeDeliveryCount,
        long recoveryCommandCount,
        long attentionCount
    ) {}

    public record HourlyActivity(
        OffsetDateTime bucketStart,
        long commandCount,
        long deliveryEventCount,
        long deliveredCount
    ) {}

    public record ProviderShare(
        String providerId,
        String displayName,
        long selectionCount,
        double percentage
    ) {}

    public record RecoveryHealth(
        long retriedCommandCount,
        long reconciliationCount,
        long providerWaitCount,
        long webhookDeadLetterCount,
        long trackingDeadLetterCount
    ) {}

    public record ActivityItem(
        String activityId,
        UUID orderId,
        UUID chefSubOrderId,
        String providerId,
        String activityType,
        String status,
        String detail,
        OffsetDateTime occurredAt,
        boolean attention
    ) {}

    public record AttentionItem(
        String referenceId,
        UUID orderId,
        String providerId,
        String kind,
        String status,
        OffsetDateTime occurredAt,
        boolean errorRecorded
    ) {}

    public record OrderInvestigationResponse(
        UUID requestCorrelationId,
        String resolvedReference,
        UUID orderId,
        List<DeliveryUnitEvidence> units
    ) {}

    public record DeliveryUnitEvidence(
        UUID chefSubOrderId,
        DeliveryCommandEvidence command,
        DeliveryJobEvidence job,
        AssignmentEvidence assignment,
        List<CandidateEvidence> candidates,
        List<DeliveryEventEvidence> events,
        List<WebhookEvidence> webhooks
    ) {}

    public record DeliveryCommandEvidence(
        UUID commandId,
        UUID orderId,
        UUID chefSubOrderId,
        String commandType,
        String status,
        OffsetDateTime readyAt,
        OffsetDateTime dispatchAt,
        int attemptCount,
        int providerWaitAttemptCount,
        int reconciliationAttemptCount,
        String idempotencyKey,
        OffsetDateTime providerWaitStartedAt,
        OffsetDateTime nextProviderRetryAt,
        String reconciliationProviderId,
        String reconciliationClientReference,
        OffsetDateTime reconciliationStartedAt,
        OffsetDateTime nextReconciliationAt,
        boolean errorRecorded,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}

    public record DeliveryJobEvidence(
        UUID deliveryJobId,
        UUID orderId,
        UUID chefSubOrderId,
        UUID assignmentId,
        String providerId,
        String providerDeliveryId,
        String providerQuoteId,
        String assignedAgentId,
        String status,
        String providerStatus,
        OffsetDateTime bookedAt,
        OffsetDateTime pickedUpAt,
        OffsetDateTime deliveredAt,
        OffsetDateTime lastStatusObservedAt,
        String lastStatusSource,
        int trackingAttemptCount,
        OffsetDateTime trackingDeadLetteredAt,
        boolean trackingErrorRecorded,
        BigDecimal courierLatitude,
        BigDecimal courierLongitude,
        OffsetDateTime courierLocationObservedAt,
        OffsetDateTime estimatedPickupStartAt,
        OffsetDateTime estimatedPickupEndAt,
        OffsetDateTime estimatedDropoffStartAt,
        OffsetDateTime estimatedDropoffEndAt,
        OffsetDateTime telemetryObservedAt,
        String telemetrySource,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}

    public record AssignmentEvidence(
        UUID assignmentId,
        String strategy,
        String status,
        String scoringVersion,
        UUID selectedCandidateId,
        String selectedProviderId,
        String selectedAgentId,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}

    public record CandidateEvidence(
        UUID candidateId,
        String providerId,
        String providerQuoteId,
        String agentId,
        int candidateRank,
        Double pickupDistanceKm,
        Double pickupEtaMinutes,
        BigDecimal quotedCost,
        String currency,
        double predictedSuccessProbability,
        double combinedScore,
        Double liveAvg,
        double storedAvg,
        String momentum,
        double providerQualityScore,
        double proximityScore,
        double finalScore,
        String status,
        OffsetDateTime createdAt
    ) {}

    public record DeliveryEventEvidence(
        UUID eventId,
        String providerId,
        String providerEventId,
        String eventType,
        String normalizedStatus,
        String providerStatus,
        String source,
        boolean applied,
        String ignoredReason,
        OffsetDateTime occurredAt,
        OffsetDateTime createdAt
    ) {}

    public record WebhookEvidence(
        UUID webhookId,
        String providerId,
        String providerEventId,
        String processingStatus,
        String normalizedStatus,
        String processingResult,
        int attemptCount,
        boolean errorRecorded,
        OffsetDateTime receivedAt,
        OffsetDateTime processedAt
    ) {}
}
