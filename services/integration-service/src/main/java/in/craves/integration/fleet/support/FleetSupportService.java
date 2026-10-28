package in.craves.integration.fleet.support;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.admin.FleetAdminService.Done;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.support.FleetSupportModels.Fix;
import in.craves.integration.fleet.support.FleetSupportModels.Issue;
import in.craves.integration.fleet.support.FleetSupportModels.IssueInput;
import in.craves.integration.fleet.support.FleetSupportModels.IssuePage;
import in.craves.integration.fleet.support.FleetSupportModels.SosEvent;
import in.craves.integration.fleet.support.FleetSupportModels.SosInput;
import in.craves.integration.fleet.support.FleetSupportModels.SosPage;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Riders' problem reports and SOS (rider-v1 /support/issues, /sos; admin-fleet-v1 /support-issues, /sos-events). An issue
 * records acknowledge-by (+24 h) and fix-by (+72 h); one raised on a trip before its pay is withdrawable holds that pay
 * until it is fixed or 7 days pass (FleetEarnings). Ops acknowledge and fix issues from the console, audited. An SOS is
 * stored first, then the ops lead is alerted at once.
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSupportService {
    static final Set<String> CATEGORIES = Set.of("MISSING_PAY", "WRONG_DISTANCE", "PAYOUT_NOT_RECEIVED", "WRONG_DEDUCTION", "APP_PROBLEM",
        "OTHER");
    private static final Set<String> STATES = Set.of("OPEN", "ACKNOWLEDGED", "FIXED");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm 'IST'", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"));

    private final JdbcTemplate jdbc;
    private final RiderPushClient alerts;
    private final FleetAdminService admin;

    public FleetSupportService(JdbcTemplate jdbc, RiderPushClient alerts, FleetAdminService admin) {
        this.jdbc = jdbc;
        this.alerts = alerts;
        this.admin = admin;
    }

    /** A problem with a trip or a payout of this rider (404 for anyone else's), or anything else. */
    @Transactional
    public void report(UUID riderId, IssueInput input) {
        if (input == null || input.category() == null || !CATEGORIES.contains(input.category())) {
            throw FleetApiException.invalid("Choose what the problem is about.");
        }
        String note = input.note() == null || input.note().isBlank() ? null : input.note().trim();
        if (note != null && note.length() > 2000) {
            throw FleetApiException.invalid("Write at most 2,000 characters.");
        }
        UUID tripId = id(input.tripId());
        if (tripId != null && !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.trip WHERE id = ? "
            + "AND rider_id = ?)", Boolean.class, tripId, riderId))) {
            throw FleetApiException.notFound("TRIP_NOT_FOUND", "We could not find that trip.");
        }
        UUID payoutId = id(input.payoutId());
        if (payoutId != null && !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_payout_instruction "
            + "WHERE id = ? AND rider_id = ?)", Boolean.class, payoutId, riderId))) {
            throw FleetApiException.notFound("PAYOUT_NOT_FOUND", "We could not find that payout.");
        }
        jdbc.update("INSERT INTO fleet_schema.support_issue (id, rider_id, trip_id, payout_id, category, note, acknowledge_by, fix_by) "
            + "VALUES (?, ?, ?, ?, ?, ?, now() + interval '24 hours', now() + interval '72 hours')", UUID.randomUUID(), riderId, tripId,
            payoutId, input.category(), note);
    }

    /**
     * Never refused for a missing or odd location or trip: the press is stored with the phone's fix (else the rider's latest
     * position), committed, and only then the ops lead is alerted with the name, phone, a map link and the trip. Not
     * transactional on purpose: the alert waits for no database lock, and a failed alert leaves the stored press.
     */
    public void sos(UUID riderId, SosInput input) {
        Map<String, Object> rider = jdbc.queryForMap("SELECT name, phone FROM fleet_schema.rider WHERE id = ?", riderId);
        UUID tripId = input == null ? null : ownTrip(riderId, input.tripId());
        Fix fix = input == null ? null : input.fix();
        Double lat = null;
        Double lng = null;
        Instant fixAt = null;
        if (fix != null && fix.lat() != null && fix.lng() != null && Math.abs(fix.lat()) <= 90 && Math.abs(fix.lng()) <= 180) {
            lat = fix.lat();
            lng = fix.lng();
            fixAt = fix.at();
        } else {
            List<Map<String, Object>> latest = jdbc.queryForList("SELECT lat, lng, recorded_at FROM fleet_schema.rider_position_latest "
                + "WHERE rider_id = ?", riderId);
            if (!latest.isEmpty()) {
                lat = (Double) latest.get(0).get("lat");
                lng = (Double) latest.get(0).get("lng");
                fixAt = ((Timestamp) latest.get(0).get("recorded_at")).toInstant();
            }
        }
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO fleet_schema.sos_event (id, rider_id, trip_id, lat, lng, fix_recorded_at) VALUES (?, ?, ?, ?, ?, ?)", id,
            riderId, tripId, lat, lng, fixAt == null ? null : Timestamp.from(fixAt));
        String orderCode = tripId == null ? null
            : jdbc.queryForObject("SELECT order_code FROM fleet_schema.trip WHERE id = ?", String.class, tripId);
        String name = (String) rider.get("name");
        String phone = (String) rider.get("phone");
        String map = lat == null ? null : String.format(Locale.ROOT, "https://maps.google.com/?q=%.6f,%.6f", lat, lng);
        Map<String, String> data = new LinkedHashMap<>();
        data.put("sosId", id.toString());
        data.put("riderId", riderId.toString());
        data.put("riderName", name);
        data.put("riderPhone", phone);
        if (map != null) {
            data.put("location", map);
        }
        if (tripId != null) {
            data.put("tripId", tripId.toString());
            data.put("orderCode", orderCode);
        }
        String body = name + " (" + phone + ") pressed SOS at " + TIME.format(Instant.now()) + ". Call them now.\n"
            + (map == null ? "Location: not known (no recent fix)." : "Location: " + map + (fixAt == null ? "" : " (fix at " + TIME.format(fixAt) + ")"))
            + "\n" + (tripId == null ? "No trip in progress." : "Trip: order " + orderCode + ".");
        if (alerts.opsAlert("SOS", "SOS from rider " + name, body, data)) {
            jdbc.update("UPDATE fleet_schema.sos_event SET alerted_at = now() WHERE id = ?", id);
        }
    }

    /** Oldest first, so the longest-waiting issue is on top. */
    @Transactional(readOnly = true)
    public IssuePage issues(String state) {
        if (!STATES.contains(state)) {
            throw FleetApiException.invalid("Choose OPEN, ACKNOWLEDGED or FIXED.");
        }
        return new IssuePage(jdbc.query("SELECT s.*, r.name FROM fleet_schema.support_issue s JOIN fleet_schema.rider r ON r.id = s.rider_id "
            + "WHERE s.state = ? ORDER BY s.created_at, s.id LIMIT 500", (row, n) -> issue(row), state));
    }

    /** Support has seen an open issue and is on it: within 24 hours of the report (acknowledgeBy). 409 ISSUE_NOT_OPEN. */
    @Transactional
    public Object acknowledge(Admin by, UUID key, UUID issueId) {
        return admin.once(by, key, "SUPPORT_ISSUE_ACKNOWLEDGED", issueId.toString(), () -> {
            UUID rider = jdbc.queryForList("UPDATE fleet_schema.support_issue SET state = 'ACKNOWLEDGED', acknowledged_at = now(), "
                    + "acknowledged_by_name = ? WHERE id = ? AND state = 'OPEN' RETURNING rider_id", UUID.class, by.name(), issueId)
                .stream().findFirst().orElseThrow(() -> refused(issueId, "ISSUE_NOT_OPEN", "This issue was acknowledged already."));
            Issue issue = issue(issueId);
            return new Done(issue, rider, issueId.toString(), "Acknowledged the rider's " + issue.category() + " issue.");
        });
    }

    /**
     * Fixed, with what was done (support tells the rider): a trip's pay held by this issue is released by the
     * next balance read (FleetEarnings.RELEASED). An open issue is acknowledged at the same time. 409 ISSUE_ALREADY_FIXED.
     */
    @Transactional
    public Object fix(Admin by, UUID key, UUID issueId, String resolution) {
        String text = FleetAdminService.reason(resolution);
        return admin.once(by, key, "SUPPORT_ISSUE_FIXED", issueId + "\n" + text, () -> {
            UUID rider = jdbc.queryForList("UPDATE fleet_schema.support_issue SET state = 'FIXED', fixed_at = now(), fixed_by_name = ?, "
                    + "resolution = ?, acknowledged_at = COALESCE(acknowledged_at, now()), acknowledged_by_name = COALESCE(acknowledged_by_name, ?) "
                    + "WHERE id = ? AND state <> 'FIXED' RETURNING rider_id", UUID.class, by.name(), text, by.name(), issueId)
                .stream().findFirst().orElseThrow(() -> refused(issueId, "ISSUE_ALREADY_FIXED", "This issue was fixed already."));
            Issue issue = issue(issueId);
            return new Done(issue, rider, issueId.toString(), "Fixed the rider's " + issue.category() + " issue: " + text);
        });
    }

    private Issue issue(UUID issueId) {
        return jdbc.queryForObject("SELECT s.*, r.name FROM fleet_schema.support_issue s JOIN fleet_schema.rider r ON r.id = s.rider_id "
            + "WHERE s.id = ?", (row, n) -> issue(row), issueId);
    }

    private FleetApiException refused(UUID issueId, String code, String message) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.support_issue WHERE id = ?)", Boolean.class,
            issueId)) ? FleetApiException.conflict(code, message) : FleetApiException.notFound("ISSUE_NOT_FOUND", "No such issue.");
    }

    /** The last 7 days, newest first. */
    @Transactional(readOnly = true)
    public SosPage sosEvents() {
        return new SosPage(jdbc.query("SELECT e.*, r.name, r.phone FROM fleet_schema.sos_event e JOIN fleet_schema.rider r ON r.id = e.rider_id "
            + "WHERE e.created_at > now() - interval '7 days' ORDER BY e.created_at DESC, e.id DESC LIMIT 500", (row, n) -> new SosEvent(
            row.getObject("id", UUID.class), row.getObject("rider_id", UUID.class), row.getString("name"), FleetRules.maskPhone(row.getString("phone")),
            row.getTimestamp("created_at").toInstant(), (Double) row.getObject("lat"), (Double) row.getObject("lng"),
            row.getObject("trip_id", UUID.class), row.getTimestamp("alerted_at") == null ? null : row.getTimestamp("alerted_at").toInstant())));
    }

    private UUID ownTrip(UUID riderId, String tripId) {
        try {
            UUID id = tripId == null || tripId.isBlank() ? null : UUID.fromString(tripId);
            return id != null && Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.trip WHERE id = ? "
                + "AND rider_id = ?)", Boolean.class, id, riderId)) ? id : null;
        } catch (IllegalArgumentException notAnId) {
            return null;
        }
    }

    private static UUID id(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw FleetApiException.invalid("Check the trip or payout and try again.");
        }
    }

    private static Issue issue(ResultSet row) throws SQLException {
        Timestamp acknowledged = row.getTimestamp("acknowledged_at");
        Timestamp fixed = row.getTimestamp("fixed_at");
        return new Issue(row.getObject("id", UUID.class), row.getObject("rider_id", UUID.class), row.getString("name"),
            row.getObject("trip_id", UUID.class), row.getString("category"), row.getString("note") == null ? "" : row.getString("note"),
            row.getString("state"), row.getTimestamp("created_at").toInstant(), row.getTimestamp("acknowledge_by").toInstant(),
            row.getTimestamp("fix_by").toInstant(), acknowledged == null ? null : acknowledged.toInstant(), row.getString("acknowledged_by_name"),
            fixed == null ? null : fixed.toInstant(), row.getString("fixed_by_name"), row.getString("resolution"));
    }
}
