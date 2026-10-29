package in.craves.integration.fleet.rider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetRules;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Phase 4: everything Craves keeps about one rider, as one JSON document (DPDP Act 2023 s.11; Telangana Act 21 of 2026;
 * docs/riders/DISPATCH.md "Your data"). The rider reads it from the app (GET /my-data); ops downloads it for a rider who asks
 * support (GET /admin/fleet/riders/{id}/data-export, audited). Other people's data stays out: a trip shows the kitchen and
 * drop areas, never the customer's name, phone or address. Files (documents, selfies, delivery photos) and on-trip GPS points
 * are listed or counted, not included.
 */
public final class RiderDataExport {
    /** Each list holds at most the newest this many rows. */
    static final int LIMIT = 5000;
    private static final ObjectMapper JSON = new ObjectMapper();
    /** Columns read as JSON text (the driver's JSON type is not on the compile classpath). */
    private static final Set<String> JSON_COLUMNS = Set.of("phoneHealth", "payLines", "whyThisOffer", "finalPayLines");
    private static final List<Section> SECTIONS = List.of(
        new Section("documents", """
            SELECT type, %s AS status, expires_on AS "expiresOn", reason, content_type AS "contentType", size_bytes AS "sizeBytes",
                   uploaded_at AS "uploadedAt", reviewed_at AS "reviewedAt"
            FROM fleet_schema.rider_document WHERE rider_id = ? ORDER BY uploaded_at DESC""".formatted(FleetRules.DOCUMENT_STATUS_SQL)),
        new Section("phones", """
            SELECT model, app_version AS "appVersion", state, first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt",
                   approved_at AS "approvedAt"
            FROM fleet_schema.rider_device WHERE rider_id = ? ORDER BY first_seen_at DESC"""),
        new Section("shifts", """
            SELECT id AS "shiftId", started_at AS "startedAt", ended_at AS "endedAt", selfie_state AS "selfieState",
                   selfie_reason AS "selfieReason", selfie_blob IS NOT NULL AS "selfieKept", in_zone_seconds AS "inZoneSeconds",
                   last_seen_at AS "lastSeenAt", max_silence_seconds AS "maxSilenceSeconds", silences_over_60s AS "silencesOver60s",
                   health::text AS "phoneHealth", heading_home_until AS "headingHomeUntil"
            FROM fleet_schema.rider_shift WHERE rider_id = ? ORDER BY started_at DESC"""),
        new Section("breaks", """
            SELECT shift_id AS "shiftId", started_at AS "startedAt", ends_at AS "endsAt"
            FROM fleet_schema.rider_break WHERE rider_id = ? ORDER BY started_at DESC"""),
        new Section("offers", """
            SELECT o.id AS "offerId", o.trip_id AS "tripId", t.order_code AS "orderCode", o.state, o.offered_at AS "offeredAt",
                   o.expires_at AS "expiresAt", o.decided_at AS "decidedAt", o.pay_paise AS "payPaise", o.pay_lines::text AS "payLines",
                   o.pickup_distance_m AS "pickupDistanceM", o.drop_distance_m AS "dropDistanceM", o.round, o.reason::text AS "whyThisOffer",
                   o.rang_at AS "rangAt", o.rang_channel AS "rangChannel", o.pickup_minutes AS "predictedPickupMinutes",
                   o.drop_minutes AS "predictedDropMinutes"
            FROM fleet_schema.trip_offer o JOIN fleet_schema.trip t ON t.id = o.trip_id
            WHERE o.rider_id = ? ORDER BY o.offered_at DESC"""),
        new Section("trips", """
            SELECT id AS "tripId", order_code AS "orderCode", state, kitchen_area AS "kitchenArea", drop_area AS "dropArea",
                   pickup_distance_m AS "pickupDistanceM", drop_distance_m AS "dropDistanceM", rate_card_version AS "rateCardVersion",
                   pay_paise AS "offeredPayPaise", final_pay_paise AS "finalPayPaise", final_pay_lines::text AS "finalPayLines",
                   pay_held AS "payHeld", hold_reason AS "holdReason", accepted_at AS "acceptedAt",
                   arrived_kitchen_at AS "arrivedKitchenAt", picked_up_at AS "pickedUpAt", arrived_drop_at AS "arrivedDropAt",
                   finished_at AS "finishedAt", cancel_reason AS "cancelReason", pickup_minutes AS "predictedPickupMinutes"
            FROM fleet_schema.trip WHERE rider_id = ? ORDER BY created_at DESC"""),
        // No step coordinates: the drop steps would place the customer's door.
        new Section("tripSteps", """
            SELECT e.trip_id AS "tripId", e.kind, e.created_at AS "at"
            FROM fleet_schema.trip t JOIN fleet_schema.trip_event e ON e.trip_id = t.id AND e.actor_type = 'RIDER' AND e.actor_id = t.rider_id
            WHERE t.rider_id = ? ORDER BY e.created_at DESC"""),
        new Section("earnings", """
            SELECT trip_id AS "tripId", slot_id AS "slotId", component, label, revision, gross_paise AS "grossPaise",
                   withheld_paise AS "withheldPaise", net_paise AS "netPaise", rate_card_version AS "rateCardVersion", reason,
                   withdrawable_at AS "withdrawableAt", created_at AS "createdAt"
            FROM fleet_schema.rider_earning WHERE rider_id = ? ORDER BY created_at DESC"""),
        new Section("payHolds", """
            SELECT trip_id AS "tripId", reason, release_on AS "releaseOn", state, created_at AS "createdAt",
                   released_at AS "releasedAt"
            FROM fleet_schema.rider_pay_hold WHERE rider_id = ? ORDER BY created_at DESC"""),
        new Section("payouts", """
            SELECT kind, payout_date AS "payoutDate", amount_paise AS "amountPaise", state, utr, failure_reason AS "failureReason",
                   created_at AS "createdAt", marked_at AS "markedAt"
            FROM fleet_schema.rider_payout_instruction WHERE rider_id = ? ORDER BY created_at DESC"""),
        new Section("payoutAccounts", """
            SELECT method, masked_account AS "maskedAccount", ifsc, holder_name AS "holderName", state, set_at AS "setAt",
                   payouts_paused_at AS "payoutsPausedAt", paused_reason AS "pausedReason"
            FROM fleet_schema.rider_payout_account WHERE rider_id = ? ORDER BY set_at DESC"""),
        new Section("withdrawals", """
            SELECT request_date AS "requestDate", amount_paise AS "amountPaise", requested_at AS "requestedAt"
            FROM fleet_schema.rider_withdrawal_day WHERE rider_id = ? ORDER BY request_date DESC"""),
        new Section("recoveries", """
            SELECT week_start AS "weekStart", amount_paise AS "amountPaise", created_at AS "createdAt"
            FROM fleet_schema.rider_recovery WHERE rider_id = ? ORDER BY week_start DESC"""),
        new Section("slots", """
            SELECT s.id AS "slotId", s.zone_name AS "zoneName", s.starts_at AS "startsAt", s.ends_at AS "endsAt",
                   s.guaranteed_per_hour_paise AS "guaranteedPerHourPaise", s.status, s.in_zone_seconds AS "inZoneSeconds",
                   s.cancelled_reason AS "cancelledReason", st.guaranteed_paise AS "guaranteedPaise", st.trip_pay_paise AS "tripPayPaise",
                   st.top_up_paise AS "topUpPaise"
            FROM fleet_schema.rider_slot s LEFT JOIN fleet_schema.rider_slot_settlement st ON st.slot_id = s.id
            WHERE s.rider_id = ? ORDER BY s.starts_at DESC"""),
        new Section("statusChanges", """
            SELECT kind, reason, evidence_summary AS "evidenceSummary", deadline, review_by AS "reviewBy",
                   appeal_phone AS "appealPhone", approver_name AS "decidedBy", status_before AS "statusBefore",
                   status_after AS "statusAfter", created_at AS "createdAt"
            FROM fleet_schema.rider_status_event WHERE rider_id = ? ORDER BY created_at DESC"""),
        new Section("supportIssues", """
            SELECT trip_id AS "tripId", category, note, state, resolution, created_at AS "createdAt",
                   acknowledged_at AS "acknowledgedAt", fixed_at AS "fixedAt"
            FROM fleet_schema.support_issue WHERE rider_id = ? ORDER BY created_at DESC"""),
        new Section("sos", """
            SELECT trip_id AS "tripId", lat, lng, created_at AS "createdAt", alerted_at AS "alertedAt"
            FROM fleet_schema.sos_event WHERE rider_id = ? ORDER BY created_at DESC"""),
        new Section("termsAccepted", """
            SELECT version, language, accepted_at AS "acceptedAt"
            FROM fleet_schema.rider_terms_acceptance WHERE rider_id = ? ORDER BY accepted_at DESC"""),
        new Section("privacyNoticesAccepted", """
            SELECT version, language, accepted_at AS "acceptedAt"
            FROM fleet_schema.rider_privacy_acceptance WHERE rider_id = ? ORDER BY accepted_at DESC"""),
        // No summaries: some name another rider or quote an ops note about someone else.
        new Section("opsActions", """
            SELECT action, actor_name AS "by", at
            FROM fleet_schema.admin_audit WHERE rider_id = ? ORDER BY at DESC"""));

    private RiderDataExport() {
    }

    /**
     * The rider's data, newest first in each list; at, when it was put together. withHomeSpot (Phase 5): the rider's own copy
     * holds their home spot; the copy ops downloads for them says only whether one is kept, as ops never sees it.
     * shortcut: trip has no full rider_id index, so each export scans it once a section; add one if exports get slow.
     */
    public static Map<String, Object> build(JdbcTemplate jdbc, UUID riderId, Instant at, boolean withHomeSpot) {
        Map<String, Object> export = new LinkedHashMap<>();
        List<String> notIncluded = new ArrayList<>(List.of(
            "Photos of your documents, shift selfies and delivery photos: ask rider support to see one.",
            "GPS points on your trips (counted in tripGpsPoints), kept 90 days: ask rider support for a copy.",
            "Customers' names, phone numbers and addresses: they are the customers' data."));
        if (!withHomeSpot) {
            notIncluded.add("Your home spot for heading home: Craves staff never see it. The app's own copy (Profile, Your data) has it.");
        }
        export.put("about", Map.of(
            "generatedAt", at.toString(),
            "eachListHoldsAtMost", LIMIT,
            "tripGpsPoints", jdbc.queryForObject("SELECT count(*) FROM fleet_schema.trip_track k JOIN fleet_schema.trip t ON t.id = k.trip_id "
                + "AND t.rider_id = k.rider_id WHERE t.rider_id = ?", Long.class, riderId),
            "notIncluded", List.copyOf(notIncluded)));
        export.put("profile", jdbc.queryForList("""
            SELECT id AS "riderId", name, phone, language, status, vehicle_kind AS "vehicleKind", vehicle_label AS "vehicleLabel",
                   vehicle_reg_number AS "vehicleRegNumber", max_pickup_m AS "maxPickupM", max_drop_m AS "maxDropM",
                   %s, home_saved_at AS "homeSavedAt", home_used_at AS "homeUsedAt", created_at AS "createdAt"
            FROM fleet_schema.rider WHERE id = ?""".formatted(withHomeSpot ? "home_lat AS \"homeLat\", home_lng AS \"homeLng\""
                : "home_lat IS NOT NULL AS \"homeSpotKept\""), riderId).stream().map(RiderDataExport::plain).findFirst().orElse(Map.of()));
        export.put("latestPosition", jdbc.queryForList("""
            SELECT lat, lng, accuracy_m AS "accuracyM", recorded_at AS "recordedAt"
            FROM fleet_schema.rider_position_latest WHERE rider_id = ?""", riderId).stream().map(RiderDataExport::plain).findFirst()
            .orElse(null));
        for (Section section : SECTIONS) {
            export.put(section.name(), jdbc.queryForList(section.sql() + " LIMIT " + LIMIT, riderId).stream().map(RiderDataExport::plain)
                .toList());
        }
        return export;
    }

    /** A row as JSON-ready values: instants and dates as ISO text, JSON columns as JSON, ids as text. */
    static Map<String, Object> plain(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((column, value) -> out.put(column, switch (value) {
            case null -> null;
            case Timestamp timestamp -> timestamp.toInstant().toString();
            case Date date -> date.toLocalDate().toString();
            case UUID id -> id.toString();
            case String text when JSON_COLUMNS.contains(column) -> json(text);
            default -> value;
        }));
        return out;
    }

    private static Object json(String text) {
        try {
            return JSON.readTree(text);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("A JSON column holds invalid JSON", exception);
        }
    }

    private record Section(String name, String sql) {
    }
}
