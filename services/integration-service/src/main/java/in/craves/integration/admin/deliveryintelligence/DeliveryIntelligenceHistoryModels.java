package in.craves.integration.admin.deliveryintelligence;

import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.ActivityItem;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.AttentionItem;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.HourlyActivity;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.Metrics;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.ProviderShare;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.RecoveryHealth;
import java.time.OffsetDateTime;
import java.util.List;

public final class DeliveryIntelligenceHistoryModels {
    private DeliveryIntelligenceHistoryModels() {}

    public record OverviewResponse(
        OffsetDateTime generatedAt,
        int windowHours,
        OffsetDateTime windowStart,
        OffsetDateTime windowEnd,
        int pageSize,
        int activityOffset,
        int attentionOffset,
        boolean activityHasMore,
        boolean attentionHasMore,
        Metrics metrics,
        List<HourlyActivity> hourlyActivity,
        List<ProviderShare> providerShare,
        RecoveryHealth recoveryHealth,
        List<ActivityItem> recentActivity,
        List<AttentionItem> attentionQueue
    ) {}
}
