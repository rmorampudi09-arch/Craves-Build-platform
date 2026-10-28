package in.craves.integration.fleet.dispatch;

import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ShipmentItem;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import in.craves.integration.fleet.FleetDatabase;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Dispatch test data: a kitchen in Madhapur, a customer in Kondapur, riders on shift around them. */
public final class FleetDispatchFixtures {
    public static final double KITCHEN_LAT = 17.4483;
    public static final double KITCHEN_LNG = 78.3915;

    private FleetDispatchFixtures() {
    }

    /**
     * A dispatch policy in force since yesterday: offers 40 s, fleet stage 60 s, radius 5 km, Pidge 600 s. Live pays riders,
     * so for live the seeded rate card is published first, in force since yesterday too.
     */
    public static void policy(JdbcTemplate db, String mode) {
        policy(db, mode, 40, 60, 3, 1, 0);
    }

    /**
     * The same, with these offer rules (Phase 4): seconds per offer, stage seconds, riders at once, rounds, fair band. The
     * policy goes in before the rate card: once riders have terms, new rules need 14 days' notice (V170's trigger).
     */
    public static void policy(JdbcTemplate db, String mode, int offerSeconds, int stageSeconds, int atOnce, int rounds, int fairBandM) {
        db.update("INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, mode, offer_seconds, "
            + "fleet_stage_seconds, radius_m, ranges, offers_at_once, offer_rounds, fair_band_m) VALUES ('2026-09-v9', 'PUBLISHED', "
            + "now() - INTERVAL '1 day', now(), ?, ?, ?, 5000, '{}', ?, ?, ?)", mode, offerSeconds, stageSeconds, atOnce, rounds, fairBandM);
        if ("live".equals(mode)) {
            db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now(), effective_from = now() - INTERVAL '1 day' "
                + "WHERE version = '2026-10-v1' AND status = 'DRAFT'");
        }
    }

    /**
     * An ACTIVE rider with a bound phone, on an open shift, whose last /locations call and last fix were both secondsAgo.
     * Returns the rider id.
     */
    public static UUID riderOnShift(FleetDatabase fleet, String phone, double lat, double lng, int secondsAgo, boolean mock) {
        UUID rider = fleet.rider("Ravi Kumar", phone);
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE', identity_id = ? WHERE id = ?", UUID.randomUUID(), rider);
        fleet.db.update("INSERT INTO fleet_schema.rider_device (id, rider_id, fcm_token, app_version, model, state) "
            + "VALUES (?, ?, ?, '1.0.0', 'Redmi Note 12', 'BOUND')", UUID.randomUUID(), rider, "fcm-" + phone);
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, last_seen_at) "
            + "VALUES (?, ?, ?, now() + INTERVAL '8 hours', now() - make_interval(secs => ?))", UUID.randomUUID(), rider,
            phone.substring(1).repeat(6).substring(0, 64), secondsAgo);
        fix(fleet.db, rider, lat, lng, secondsAgo, mock);
        fleet.db.update("INSERT INTO fleet_schema.test_mode_rider (rider_id) VALUES (?)", rider);
        return rider;
    }

    public static void fix(JdbcTemplate db, UUID rider, double lat, double lng, int secondsAgo, boolean mock) {
        db.update("INSERT INTO fleet_schema.rider_position_latest (rider_id, lat, lng, accuracy_m, mock, recorded_at, received_at) "
            + "VALUES (?, ?, ?, 8, ?, now() - make_interval(secs => ?), now() - make_interval(secs => ?)) "
            + "ON CONFLICT (rider_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, mock = EXCLUDED.mock, "
            + "recorded_at = EXCLUDED.recorded_at, received_at = EXCLUDED.received_at", rider, lat, lng, mock, secondsAgo, secondsAgo);
    }

    /**
     * The rider's open shift last called /locations secondsAgo (the heartbeat), whatever its fixes say. No position can have
     * reached the server after that call, so the latest one's received_at moves back to it if it was later.
     */
    public static void seen(JdbcTemplate db, UUID rider, int secondsAgo) {
        db.update("UPDATE fleet_schema.rider_shift SET last_seen_at = now() - make_interval(secs => ?) WHERE rider_id = ? AND ended_at IS NULL",
            secondsAgo, rider);
        db.update("UPDATE fleet_schema.rider_position_latest SET received_at = LEAST(received_at, now() - make_interval(secs => ?)) "
            + "WHERE rider_id = ?", secondsAgo, rider);
    }

    /** The chef behind a sub-order (from the checkout's finance quote), allow-listed for test mode. Returns the chef id. */
    public static UUID kitchen(JdbcTemplate db, UUID chefSubOrderId, boolean allowListed) {
        UUID chef = UUID.randomUUID();
        db.update("INSERT INTO payment_schema.finance_issued_snapshot (id, checkout_id, chef_order_id, chef_identity_id, snapshot_hash, payload) "
            + "VALUES (?, ?, ?, ?, ?, '{}')", UUID.randomUUID(), UUID.randomUUID(), chefSubOrderId, chef, "a".repeat(64));
        if (allowListed) {
            db.update("INSERT INTO fleet_schema.test_mode_kitchen (chef_id) VALUES (?)", chef);
        }
        return chef;
    }

    public static DeliveryCommandMessage command(UUID chefSubOrderId) {
        UUID checkout = UUID.randomUUID();
        Stop kitchen = new Stop("Plot 7, Road 1, Madhapur", "Lakshmi's Kitchen", "+914012345678", BigDecimal.valueOf(KITCHEN_LAT),
            BigDecimal.valueOf(KITCHEN_LNG), null, null, "Craves order. Match this number with the kitchen.", "Plot 7", "Road 1",
            "Near the metro", "Madhapur", "Hyderabad", "Telangana", "500081", "India");
        Stop drop = new Stop("Flat 2, Kondapur", "Anil Rao", "+919876500000", new BigDecimal("17.4600"), new BigDecimal("78.3600"), null,
            null, "Craves order.", "Flat 2", null, null, "Kondapur", "Hyderabad", "Telangana", "500084", "India");
        QuoteRequest request = new QuoteRequest("Food order", 1500, true, kitchen, drop,
            List.of(new ShipmentItem(UUID.randomUUID(), "Biryani", new BigDecimal("250"), 2, new BigDecimal("500")),
                new ShipmentItem(UUID.randomUUID(), "Raita", new BigDecimal("40"), 1, new BigDecimal("40"))),
            new BigDecimal("540"), "PREPAID", null);
        return new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), checkout, checkout, chefSubOrderId,
            Instant.now().plusSeconds(720), Instant.now(), chefSubOrderId.toString(), 3.5, "Madhapur", 19, 1, request);
    }

    /** The delivery job a rider's accept creates, as craves_fleet with the trip id. */
    public static UUID fleetJob(JdbcTemplate db, UUID chefSubOrderId, UUID orderId, UUID tripId, String status) {
        UUID job = UUID.randomUUID();
        db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status, "
            + "last_status_observed_at, last_status_source, next_tracking_at) VALUES (?, ?, ?, 'craves_fleet', ?, ?, now() - INTERVAL '1 minute', "
            + "'CREATE', now())", job, chefSubOrderId, orderId, tripId.toString(), status);
        return job;
    }
}
