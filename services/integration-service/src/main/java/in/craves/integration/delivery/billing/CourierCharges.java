package in.craves.integration.delivery.billing;

import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * With CRAVES_DELIVERY_COURIER_CHARGE_ENABLED: keeps what a courier company shows as its price for a booking
 * (delivery_schema.courier_charge, V199), from the courier's answer the caller already holds. A record only: it calls no
 * courier, pays nobody and changes no booking. Its statements run in savepoints and every failure ends in one
 * CRAVES_ALERT line, so the booking or cancel that called it goes on as it would without it. Off, nothing is read or written.
 */
@Component
public class CourierCharges {
    public static final String BOOKING = "BOOKING";
    public static final String CANCEL = "CANCEL";
    private static final Logger log = LoggerFactory.getLogger(CourierCharges.class);

    private final JdbcTemplate jdbc;
    private final DeliveryCommandProperties properties;
    private final DeliveryStatusRepository savepoints;

    public CourierCharges(JdbcTemplate jdbc, DeliveryCommandProperties properties, DeliveryStatusRepository savepoints) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.savepoints = savepoints;
    }

    public boolean enabled() {
        return properties.isCourierChargeEnabled();
    }

    /** The booking became the order's delivery: the courier's price as its answer shows it. */
    public void booked(UUID orderId, UUID chefSubOrderId, UUID deliveryJobId, ProviderDelivery delivery) {
        record(BOOKING, orderId, chefSubOrderId, deliveryJobId, delivery, false);
    }

    /**
     * The courier shows the booking Craves cancelled cancelled. Its amount replaces the booking price: 0 when the caller read,
     * before cancelling, that no rider was assigned (free on Borzo and Pidge); otherwise NULL, unknown, for the wallet statement
     * to decide. Never the price the courier's record shows after the cancel, which is the booking price repeated.
     */
    public void cancelled(UUID orderId, UUID chefSubOrderId, UUID deliveryJobId, ProviderDelivery delivery, boolean beforeRider) {
        record(CANCEL, orderId, chefSubOrderId, deliveryJobId, delivery, beforeRider);
    }

    /**
     * What the courier showed just before Craves cancelled says no rider was assigned: still being placed or searched for, and
     * no rider with an id (the same test as BorzoPidgeHandoffWorker's). Anything else, or nothing read, is not known.
     */
    public static boolean beforeRider(TrackingSnapshot seen) {
        return seen != null && seen.delivery() != null
            && (seen.delivery().status() == DeliveryStatus.PENDING || seen.delivery().status() == DeliveryStatus.SEARCHING)
            && (seen.courier() == null || seen.courier().providerCourierId() == null || seen.courier().providerCourierId().isBlank());
    }

    /**
     * The courier's price in a courier's answer, in rupees. Pidge's paymentAmount is what the customer is billed, so its
     * price is the delivery charge; every other courier's is the order total.
     */
    static BigDecimal price(ProviderDelivery delivery) {
        return "pidge".equals(delivery.providerId()) ? delivery.deliveryFeeAmount() : delivery.paymentAmount();
    }

    /** Rupees to whole paise: half a paisa and above rounds up. Null stays null; an amount too large for a long throws. */
    static Long paise(BigDecimal rupees) {
        return rupees == null ? null : rupees.setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
    }

    private void record(String kind, UUID orderId, UUID chefSubOrderId, UUID deliveryJobId, ProviderDelivery delivery, boolean beforeRider) {
        if (!enabled() || delivery == null) {
            return;
        }
        try {
            Long paise = CANCEL.equals(kind) ? (beforeRider ? Long.valueOf(0L) : null) : paise(price(delivery));
            boolean written = Boolean.TRUE.equals(savepoints.inSavepoint(() -> jdbc.update("""
                INSERT INTO delivery_schema.courier_charge
                    (provider_id, provider_delivery_id, chef_sub_order_id, order_id, delivery_job_id, kind, amount_paise, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'API')
                ON CONFLICT (provider_id, provider_delivery_id, kind) WHERE kind IN ('BOOKING', 'CANCEL') DO NOTHING
                """, delivery.providerId(), delivery.providerDeliveryId(), chefSubOrderId, orderId, deliveryJobId, kind, paise) == 1));
            if (written && paise != null && BOOKING.equals(kind)) {
                try {
                    // A savepoint of its own: a threshold that cannot be checked leaves the charge row written.
                    savepoints.inSavepoint(() -> {
                        thresholds(delivery, chefSubOrderId, paise);
                        return null;
                    });
                } catch (RuntimeException failure) {
                    log.error("CRAVES_ALERT alert=COURIER_CHARGE_THRESHOLD_NOT_CHECKED provider={} chefSubOrderId={} delivery={} error={}",
                        delivery.providerId(), chefSubOrderId, delivery.providerDeliveryId(), safe(failure));
                }
            }
        } catch (RuntimeException failure) {
            log.error("CRAVES_ALERT alert=COURIER_CHARGE_NOT_RECORDED provider={} chefSubOrderId={} delivery={} kind={} error={}",
                delivery.providerId(), chefSubOrderId, delivery.providerDeliveryId(), kind, safe(failure));
        }
    }

    /** The admin's two alert thresholds, when set: a line for ops and nothing else. The booking is already made. */
    private void thresholds(ProviderDelivery delivery, UUID chefSubOrderId, long paise) {
        List<Map<String, Object>> setting = jdbc.queryForList("SELECT per_order_alert_paise, per_day_alert_paise "
            + "FROM delivery_schema.courier_billing_setting WHERE provider_id = ? ORDER BY id DESC LIMIT 1", delivery.providerId());
        if (setting.isEmpty()) {
            return;
        }
        Long perOrder = (Long) setting.get(0).get("per_order_alert_paise");
        Long perDay = (Long) setting.get(0).get("per_day_alert_paise");
        if (perOrder != null && paise > perOrder) {
            log.error("CRAVES_ALERT alert=COURIER_CHARGE_OVER_ORDER_THRESHOLD provider={} chefSubOrderId={} delivery={} amountPaise={} "
                + "thresholdPaise={}", delivery.providerId(), chefSubOrderId, delivery.providerDeliveryId(), paise, perOrder);
        }
        if (perDay == null) {
            return;
        }
        // Today in India. Whole paise, summed by the database.
        Long today = jdbc.queryForObject("SELECT COALESCE(sum(amount_paise), 0)::bigint FROM delivery_schema.courier_charge "
            + "WHERE provider_id = ? AND kind = 'BOOKING' AND charged_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') "
            + "AT TIME ZONE 'Asia/Kolkata'", Long.class, delivery.providerId());
        if (today != null && today > perDay && jdbc.update("INSERT INTO delivery_schema.courier_spend_alert (provider_id, day) "
            + "VALUES (?, (now() AT TIME ZONE 'Asia/Kolkata')::date) ON CONFLICT DO NOTHING", delivery.providerId()) == 1) {
            log.error("CRAVES_ALERT alert=COURIER_SPEND_OVER_DAY_THRESHOLD provider={} bookedTodayPaise={} thresholdPaise={}",
                delivery.providerId(), today, perDay);
        }
    }

    private static String safe(RuntimeException error) {
        String message = error.getMessage() == null || error.getMessage().isBlank() ? error.getClass().getSimpleName()
            : error.getMessage().replace('\n', ' ').replace('\r', ' ');
        return message.length() <= 300 ? message : message.substring(0, 300);
    }
}
