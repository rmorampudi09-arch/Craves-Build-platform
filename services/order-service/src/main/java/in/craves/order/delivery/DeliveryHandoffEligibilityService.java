package in.craves.order.delivery;

import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class DeliveryHandoffEligibilityService {
    private static final Set<String> DELIVERABLE_ORDER_STATUSES = Set.of(
        "CHEF_ACCEPTED", "PREPARING", "READY_FOR_PICKUP"
    );
    private static final Set<String> UNASSIGNED_DELIVERY_STATUSES = Set.of(
        "PENDING", "SEARCHING", "DELAYED"
    );

    private final JdbcTemplate jdbc;

    public DeliveryHandoffEligibilityService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Eligibility check(UUID chefSubOrderId, UUID checkoutId,
                             UUID deliveryJobId, String borzoProviderDeliveryId) {
        if (deliveryJobId == null || !StringUtils.hasText(borzoProviderDeliveryId)) {
            return new Eligibility(false);
        }
        return jdbc.query(
            """
                SELECT o.status, o.accepted_at IS NOT NULL AS chef_accepted,
                       o.refund_requested_at IS NOT NULL AS refund_requested,
                       o.delivery_status, o.delivery_provider_id,
                       o.delivery_job_id, o.delivery_provider_delivery_id,
                       EXISTS (
                           SELECT 1
                           FROM order_schema.order_delivery_status_history h
                           WHERE h.order_id = o.id AND h.delivery_job_id = ?
                             AND h.new_status IN (
                                 'COURIER_ASSIGNED', 'COURIER_TO_PICKUP', 'AT_PICKUP',
                                 'PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF', 'DELIVERED',
                                 'RETURNING', 'RETURNED'
                             )
                       ) AS courier_previously_assigned
                FROM order_schema.customer_order o
                WHERE o.id = ? AND o.checkout_id = ?
                """,
            (rs, rowNumber) -> {
                String deliveryStatus = rs.getString("delivery_status");
                String provider = rs.getString("delivery_provider_id");
                UUID projectedJobId = rs.getObject("delivery_job_id", UUID.class);
                String projectedDeliveryId = rs.getString("delivery_provider_delivery_id");
                boolean awaitingProvider = (projectedJobId == null && provider == null
                        && deliveryStatus == null && projectedDeliveryId == null)
                    || ("borzo".equalsIgnoreCase(provider)
                        && deliveryJobId.equals(projectedJobId)
                        && borzoProviderDeliveryId.equals(projectedDeliveryId)
                        && deliveryStatus != null
                        && UNASSIGNED_DELIVERY_STATUSES.contains(deliveryStatus));
                return new Eligibility(
                    rs.getBoolean("chef_accepted")
                        && !rs.getBoolean("refund_requested")
                        && DELIVERABLE_ORDER_STATUSES.contains(rs.getString("status"))
                        && !rs.getBoolean("courier_previously_assigned")
                        && awaitingProvider
                );
            },
            deliveryJobId,
            chefSubOrderId,
            checkoutId
        ).stream().findFirst().orElse(new Eligibility(false));
    }

    public record Eligibility(boolean eligible) {}
}
