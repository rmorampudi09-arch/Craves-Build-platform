package in.craves.integration.fleet.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.money.FleetEarnings;
import in.craves.integration.fleet.money.FleetPayouts;
import in.craves.integration.fleet.support.FleetSupportModels.Fix;
import in.craves.integration.fleet.support.FleetSupportModels.Issue;
import in.craves.integration.fleet.support.FleetSupportModels.IssueInput;
import in.craves.integration.fleet.support.FleetSupportModels.SosEvent;
import in.craves.integration.fleet.support.FleetSupportModels.SosInput;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.bank.BankDataCipher;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;

/** Problem reports and SOS against a real database; the ops alert is a mock of notification-service's client. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetSupportDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final RiderPushClient alerts = mock(RiderPushClient.class);
    final Admin lead = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");
    FleetAdminService admin;
    FleetSupportService support;
    UUID ravi;
    UUID trip;

    @BeforeEach
    void setUp() {
        admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class), mock(BankDataCipher.class));
        support = new FleetSupportService(fleet.db, alerts, admin);
        ravi = fleet.rider("Ravi Kumar", "+919876543210");
        trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'PICKED_UP' WHERE id = ?", ravi, trip);
    }

    @Test
    void anIssueIsRecordedWithItsAcknowledgeAndFixTimes() {
        support.report(ravi, new IssueInput("WRONG_DISTANCE", trip.toString(), null, "  The drop was 5 km, not 4.2  "));
        Map<String, Object> row = fleet.db.queryForMap("SELECT *, acknowledge_by - created_at = interval '24 hours' AS ack, "
            + "fix_by - created_at = interval '72 hours' AS fix FROM fleet_schema.support_issue");
        assertThat(row).containsEntry("rider_id", ravi).containsEntry("trip_id", trip).containsEntry("state", "OPEN")
            .containsEntry("note", "The drop was 5 km, not 4.2").containsEntry("ack", true).containsEntry("fix", true);

        UUID sita = fleet.rider("Sita Devi", "+919876543211");
        refused(() -> support.report(sita, new IssueInput("MISSING_PAY", trip.toString(), null, null)), 404, "TRIP_NOT_FOUND");
        refused(() -> support.report(ravi, new IssueInput("PAYOUT_NOT_RECEIVED", null, UUID.randomUUID().toString(), null)), 404,
            "PAYOUT_NOT_FOUND");
        refused(() -> support.report(ravi, new IssueInput("RUDE_CUSTOMER", null, null, null)), 400, "VALIDATION_FAILED");
        refused(() -> support.report(ravi, new IssueInput("OTHER", "trip-1", null, null)), 400, "VALIDATION_FAILED");
        refused(() -> support.report(ravi, new IssueInput("OTHER", null, null, "x".repeat(2001))), 400, "VALIDATION_FAILED");
        support.report(ravi, new IssueInput("APP_PROBLEM", null, null, null));

        List<Issue> open = support.issues("OPEN").issues();
        assertThat(open).extracting(Issue::category).containsExactly("WRONG_DISTANCE", "APP_PROBLEM");
        assertThat(open.get(1).text()).isEmpty();
        assertThat(open.get(0).riderName()).isEqualTo("Ravi Kumar");
        assertThat(Duration.between(open.get(0).createdAt(), open.get(0).fixBy())).isEqualTo(Duration.ofHours(72));
        assertThat(support.issues("FIXED").issues()).isEmpty();
        refused(() -> support.issues("CLOSED"), 400, "VALIDATION_FAILED");
    }

    @Test
    void anOpenIssueOnATripHoldsItsPayUntilFixedOrSevenDays() {
        LedgerPostingService ledger = new LedgerPostingService(fleet.db, json, true);
        FleetEarnings earnings = new FleetEarnings(fleet.db, json, ledger, admin, fleet.transactions, Runnable::run, false, "", 0, 0, true);
        FleetPayouts payouts = new FleetPayouts(fleet.db, ledger, admin, earnings, mock(BankDataCipher.class), FleetDatabase.properties(true),
            50000, true);
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'DELIVERED', rate_card_version = '2026-10-v1', final_pay_lines = "
            + "'[{\"component\":\"base\",\"label\":\"Base pay\",\"amountPaise\":4000}]', final_pay_paise = 4000, "
            + "pay_finalized_at = now() - interval '23 hours' WHERE id = ?", trip);
        earnings.creditTrip(trip);
        support.report(ravi, new IssueInput("WRONG_DISTANCE", trip.toString(), null, null)); // inside the 24 hours
        fleet.db.update("UPDATE fleet_schema.rider_earning SET withdrawable_at = now() - interval '1 minute' WHERE trip_id = ?", trip);
        assertThat(payouts.payouts(ravi).withdrawablePaise()).as("disputed: not withdrawable").isZero();

        fleet.db.update("UPDATE fleet_schema.support_issue SET created_at = now() - interval '7 days 1 minute' WHERE trip_id = ?", trip);
        assertThat(payouts.payouts(ravi).withdrawablePaise()).as("after 7 days the pay is released anyway").isEqualTo(4000);
        fleet.db.update("UPDATE fleet_schema.support_issue SET created_at = now() - interval '2 hours' WHERE trip_id = ?", trip);
        assertThat(payouts.payouts(ravi).withdrawablePaise()).isZero();
        UUID issue = fleet.db.queryForObject("SELECT id FROM fleet_schema.support_issue WHERE trip_id = ?", UUID.class, trip);
        support.fix(lead, UUID.randomUUID(), issue, "Checked the route: the drop was 4.2 km");
        assertThat(payouts.payouts(ravi).withdrawablePaise()).as("fixed in the console").isEqualTo(4000);
    }

    @Test
    void opsAcknowledgeThenFixAnIssueOnceWithWhoDidItAndWhatWasDone() {
        support.report(ravi, new IssueInput("MISSING_PAY", trip.toString(), null, "This trip is not in my earnings"));
        UUID issue = fleet.db.queryForObject("SELECT id FROM fleet_schema.support_issue", UUID.class);
        UUID key = UUID.randomUUID();

        Issue acknowledged = (Issue) support.acknowledge(lead, key, issue);
        assertThat(acknowledged.state()).isEqualTo("ACKNOWLEDGED");
        assertThat(acknowledged.acknowledgedBy()).isEqualTo(lead.name());
        assertThat(acknowledged.acknowledgedAt()).isNotNull();
        assertThat(acknowledged.fixedAt()).isNull();
        assertThat(json.valueToTree(support.acknowledge(lead, key, issue)).get("state").asText()).as("the same key").isEqualTo("ACKNOWLEDGED");
        refused(() -> support.acknowledge(lead, UUID.randomUUID(), issue), 409, "ISSUE_NOT_OPEN");
        refused(() -> support.acknowledge(lead, UUID.randomUUID(), UUID.randomUUID()), 404, "ISSUE_NOT_FOUND");
        refused(() -> support.fix(lead, UUID.randomUUID(), issue, "ok"), 400, "VALIDATION_FAILED");
        assertThat(support.issues("ACKNOWLEDGED").issues()).extracting(Issue::issueId).containsExactly(issue);

        Admin other = new Admin(UUID.randomUUID(), "Admin +91 97xxxxx111");
        Issue fixed = (Issue) support.fix(other, UUID.randomUUID(), issue, "Credited the missing ₹67; it shows in today's earnings");
        assertThat(fixed.state()).isEqualTo("FIXED");
        assertThat(fixed.fixedBy()).isEqualTo(other.name());
        assertThat(fixed.fixedAt()).isNotNull();
        assertThat(fixed.acknowledgedBy()).as("kept").isEqualTo(lead.name());
        assertThat(fixed.acknowledgedAt()).isEqualTo(acknowledged.acknowledgedAt());
        assertThat(fixed.resolution()).isEqualTo("Credited the missing ₹67; it shows in today's earnings");
        refused(() -> support.fix(other, UUID.randomUUID(), issue, "Again"), 409, "ISSUE_ALREADY_FIXED");
        refused(() -> support.fix(other, UUID.randomUUID(), UUID.randomUUID(), "Missing"), 404, "ISSUE_NOT_FOUND");
        assertThat(support.issues("FIXED").issues()).extracting(Issue::issueId).containsExactly(issue);
        assertThat(fleet.db.queryForList("SELECT action FROM fleet_schema.admin_audit WHERE target_id = ? ORDER BY at", String.class,
            issue.toString())).containsExactly("SUPPORT_ISSUE_ACKNOWLEDGED", "SUPPORT_ISSUE_FIXED");

        // Fixed straight from OPEN: acknowledged by the same admin at the same moment.
        support.report(ravi, new IssueInput("APP_PROBLEM", null, null, null));
        UUID second = support.issues("OPEN").issues().get(0).issueId();
        Issue direct = (Issue) support.fix(other, UUID.randomUUID(), second, "Reinstalled the app with them on a call");
        assertThat(direct.acknowledgedBy()).isEqualTo(other.name());
        assertThat(direct.acknowledgedAt()).isEqualTo(direct.fixedAt());
    }

    @Test
    void sosStoresThePhonesFixAndAlertsTheOpsLeadWithNamePhoneMapAndTrip() {
        when(alerts.opsAlert(eq("SOS"), anyString(), anyString(), anyMap())).thenReturn(true);
        Instant at = Instant.now().minusSeconds(20).truncatedTo(ChronoUnit.MILLIS);
        support.sos(ravi, new SosInput(trip.toString(), new Fix(17.4483, 78.3915, 12.0, at, false)));

        Map<String, Object> row = fleet.db.queryForMap("SELECT * FROM fleet_schema.sos_event");
        assertThat(row).containsEntry("rider_id", ravi).containsEntry("trip_id", trip).containsEntry("lat", 17.4483).containsEntry("lng", 78.3915);
        assertThat(((java.sql.Timestamp) row.get("fix_recorded_at")).toInstant()).isEqualTo(at);
        assertThat(row.get("alerted_at")).isNotNull();

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> data = ArgumentCaptor.forClass(Map.class);
        verify(alerts).opsAlert(eq("SOS"), title.capture(), body.capture(), data.capture());
        assertThat(title.getValue()).isEqualTo("SOS from rider Ravi Kumar");
        assertThat(body.getValue()).contains("Ravi Kumar (+919876543210) pressed SOS", "https://maps.google.com/?q=17.448300,78.391500",
            "Trip: order #0A1B2C3D.");
        assertThat(data.getValue()).containsEntry("riderPhone", "+919876543210").containsEntry("location",
            "https://maps.google.com/?q=17.448300,78.391500").containsEntry("tripId", trip.toString()).containsEntry("orderCode", "#0A1B2C3D")
            .containsEntry("sosId", row.get("id").toString());
    }

    @Test
    void withoutAFixSosUsesTheLatestPositionAndIsStoredEvenWhenTheAlertFails() {
        fleet.db.update("INSERT INTO fleet_schema.rider_position_latest (rider_id, lat, lng, accuracy_m, recorded_at) "
            + "VALUES (?, 17.44, 78.38, 9, now() - interval '30 seconds')", ravi);
        when(alerts.opsAlert(eq("SOS"), anyString(), anyString(), anyMap())).thenReturn(false);
        UUID sitaTrip = fleet.trip(UUID.randomUUID());
        support.sos(ravi, new SosInput(sitaTrip.toString(), new Fix(null, null, null, null, null)));
        Map<String, Object> row = fleet.db.queryForMap("SELECT * FROM fleet_schema.sos_event");
        assertThat(row).containsEntry("lat", 17.44).containsEntry("lng", 78.38).containsEntry("trip_id", null)
            .containsEntry("alerted_at", null);

        UUID sita = fleet.rider("Sita Devi", "+919876543211");
        when(alerts.opsAlert(eq("SOS"), anyString(), anyString(), anyMap())).thenReturn(true);
        support.sos(sita, null);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(alerts).opsAlert(eq("SOS"), eq("SOS from rider Sita Devi"), body.capture(), anyMap());
        assertThat(body.getValue()).contains("Location: not known (no recent fix).", "No trip in progress.");

        fleet.db.update("INSERT INTO fleet_schema.sos_event (id, rider_id, created_at) VALUES (?, ?, now() - interval '8 days')",
            UUID.randomUUID(), ravi);
        List<SosEvent> events = support.sosEvents().events();
        assertThat(events).extracting(SosEvent::riderName).containsExactly("Sita Devi", "Ravi Kumar");
        assertThat(events.get(0).phoneMasked()).isEqualTo("+91 98xxxxx211");
        assertThat(events.get(0).lat()).isNull();
        assertThat(events.get(0).alertedAt()).as("the ops lead was emailed").isNotNull();
        assertThat(events.get(1).lat()).isEqualTo(17.44);
        assertThat(events.get(1).alertedAt()).as("the alert failed: the console shows it").isNull();
    }

    static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
