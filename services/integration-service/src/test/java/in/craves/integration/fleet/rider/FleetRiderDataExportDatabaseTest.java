package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.payout.bank.BankDataCipher;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Phase 4: a rider's copy of everything Craves keeps about them, without anyone else's data. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetRiderDataExportDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final UUID identity = UUID.randomUUID();

    @Test
    void aRiderGetsTheirOwnDataAndNoCustomersOrOtherRiders() throws Exception {
        UUID rider = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", FleetDispatchFixtures.KITCHEN_LAT,
            FleetDispatchFixtures.KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider SET identity_id = ?, max_drop_m = 6000 WHERE id = ?", identity, rider);
        FleetDispatchFixtures.onBreak(fleet.db, rider, 30, -10);
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'DELIVERED', final_pay_paise = 6800, "
            + "final_pay_lines = '[{\"label\": \"base\", \"amountPaise\": 6800}]' WHERE id = ?", rider, trip);
        // The tap at the customer's door: its fix places the customer, so it never leaves in the export.
        fleet.db.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, actor_id, lat, lng, mock) "
            + "VALUES (?, ?, 'DELIVERED', 'RIDER', ?, 17.4512345, 78.3812345, false)", UUID.randomUUID(), trip, rider);
        fleet.db.update("INSERT INTO fleet_schema.trip_track (trip_id, rider_id, recorded_at, lat, lng, accuracy_m, mock) "
            + "VALUES (?, ?, now(), 17.4498765, 78.3798765, 8, false)", trip, rider);
        fleet.db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, state, pay_paise, pay_lines, rate_card_version, "
            + "pickup_distance_m, drop_distance_m, expires_at, decided_at, round, reason) VALUES (?, ?, ?, 'ACCEPTED', 6800, "
            + "'[{\"label\": \"base\", \"amountPaise\": 6800}]', '2026-10-v1', 1200, 3400, now() + INTERVAL '40 seconds', now(), 1, "
            + "'{\"rule\": \"NEAREST\", \"place\": 1, \"riders\": 2, \"atOnce\": 1, \"round\": 1}')", UUID.randomUUID(), trip, rider);
        fleet.db.update("INSERT INTO fleet_schema.rider_status_event (id, rider_id, kind, reason, evidence_summary, deadline, appeal_phone, "
            + "approver_id, approver_name, status_before, status_after, created_at) VALUES (?, ?, 'NOTICE', 'A late delivery', 'Trip log', "
            + "now() + INTERVAL '8 days', '+914012345678', ?, 'Admin +91 98xxxxx210', 'ACTIVE', 'ACTIVE', now())",
            UUID.randomUUID(), rider, UUID.randomUUID());
        UUID other = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", FleetDispatchFixtures.KITCHEN_LAT,
            FleetDispatchFixtures.KITCHEN_LNG, 5, false);
        UUID otherTrip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, order_code = '#99999999' WHERE id = ?", other, otherTrip);

        FleetRiderService riders = new FleetRiderService(fleet.db, new FleetPolicyStore(fleet.db, json), FleetDatabase.properties(true),
            mock(FleetStorage.class));
        Map<String, Object> export = riders.myData(identity);
        JsonNode tree = json.valueToTree(export);
        String text = json.writeValueAsString(export);

        assertThat(tree.path("profile").path("phone").asText()).isEqualTo("+919800000001");
        assertThat(tree.path("profile").path("maxDropM").asInt()).isEqualTo(6000);
        assertThat(tree.path("shifts")).hasSize(1);
        assertThat(tree.path("shifts").get(0).path("startedAt").asText()).as("ISO instants").endsWith("Z");
        assertThat(tree.path("breaks")).hasSize(1);
        assertThat(tree.path("offers").get(0).path("whyThisOffer").path("rule").asText()).as("JSON columns stay JSON").isEqualTo("NEAREST");
        assertThat(tree.path("statusChanges").get(0).path("reason").asText()).as("a text column named alike stays text")
            .isEqualTo("A late delivery");
        assertThat(tree.path("offers").get(0).path("payLines").get(0).path("amountPaise").asInt()).isEqualTo(6800);
        assertThat(tree.path("trips")).hasSize(1);
        assertThat(tree.path("trips").get(0).path("dropArea").asText()).isEqualTo("Kondapur");
        assertThat(tree.path("statusChanges").get(0).path("decidedBy").asText()).isEqualTo("Admin +91 98xxxxx210");
        assertThat(tree.path("phones").get(0).has("fcmToken")).isFalse();
        assertThat(tree.path("tripSteps")).hasSize(1);
        assertThat(tree.path("tripSteps").get(0).path("kind").asText()).isEqualTo("DELIVERED");
        assertThat(tree.path("tripSteps").get(0).has("lat")).as("no step coordinates").isFalse();
        assertThat(text).as("the door and the track stay out").doesNotContain("17.4512345", "78.3812345", "17.4498765");
        assertThat(tree.path("about").path("tripGpsPoints").asLong()).isOne();
        assertThat(text).as("customers' data stays out").doesNotContain("Priya", "+919000000001", "Flat 2");
        assertThat(text).as("so does other riders'").doesNotContain("#99999999", "+919800000002", other.toString());
        assertThat(tree.path("about").path("notIncluded")).hasSize(3);

        FleetAdminService admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class),
            mock(BankDataCipher.class));
        Admin ops = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");
        assertThat(json.valueToTree(admin.dataExport(ops, rider)).path("trips")).hasSize(1);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'RIDER_DATA_EXPORTED' AND rider_id = ?",
            Integer.class, rider)).isOne();
        JsonNode again = json.valueToTree(riders.myData(identity));
        assertThat(again.path("opsActions").get(0).path("action").asText())
            .as("the rider sees that ops downloaded their data").isEqualTo("RIDER_DATA_EXPORTED");
        assertThat(again.path("opsActions").get(0).has("summary")).as("summaries can name other people").isFalse();
        assertThatThrownBy(() -> admin.dataExport(ops, UUID.randomUUID())).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("RIDER_NOT_FOUND"));
    }
}
