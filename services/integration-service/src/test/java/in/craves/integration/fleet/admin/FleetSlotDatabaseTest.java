package in.craves.integration.fleet.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetSlotService.Slot;
import in.craves.integration.fleet.admin.FleetSlotService.SlotInput;
import in.craves.integration.payout.bank.BankDataCipher;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Ops-assigned slots and the guaranteed-minimum top-up (PLAN F7b) against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetSlotDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final Admin ops = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");
    FleetSlotService slots;
    UUID rider;

    @BeforeEach
    void setUp() {
        FleetAdminService admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class),
            mock(BankDataCipher.class));
        slots = new FleetSlotService(fleet.db, new FleetPolicyStore(fleet.db, json), admin, fleet.transactions);
        rider = fleet.rider("Ravi Kumar", "+919876543210");
    }

    @Test
    void bookingRefusesOverlapsGuaranteesOutsideTheDeclaredRangeAndBackwardsWindows() {
        Instant start = Instant.now().plus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        Slot booked = (Slot) slots.create(ops, UUID.randomUUID(), new SlotInput(rider, "Madhapur", start, start.plus(3, ChronoUnit.HOURS), 8000L));
        assertThat(booked.status()).isEqualTo("BOOKED");
        assertThat(booked.riderName()).isEqualTo("Ravi Kumar");
        assertThat(booked.onlineInZoneMinutes()).isNull();
        assertThat(booked.topUpPaise()).isNull();

        refused(() -> slots.create(ops, UUID.randomUUID(), new SlotInput(rider, "Kondapur", start.plus(2, ChronoUnit.HOURS),
            start.plus(4, ChronoUnit.HOURS), 8000L)), 409, "SLOT_OVERLAP");
        Slot next = (Slot) slots.create(ops, UUID.randomUUID(), new SlotInput(rider, "Kondapur", start.plus(3, ChronoUnit.HOURS),
            start.plus(4, ChronoUnit.HOURS), 8000L));
        assertThat(next.status()).as("back to back is not an overlap").isEqualTo("BOOKED");
        refused(() -> slots.create(ops, UUID.randomUUID(), new SlotInput(rider, "Madhapur", start.plus(5, ChronoUnit.HOURS),
            start.plus(6, ChronoUnit.HOURS), 20000L)), 422, "GUARANTEE_OUT_OF_RANGE"); // the draft declares 0 to 15000
        refused(() -> slots.create(ops, UUID.randomUUID(), new SlotInput(rider, "Madhapur", start.plus(6, ChronoUnit.HOURS),
            start.plus(5, ChronoUnit.HOURS), 8000L)), 422, "SLOT_END_NOT_AFTER_START");
        refused(() -> slots.create(ops, UUID.randomUUID(), new SlotInput(UUID.randomUUID(), "Madhapur", start.plus(7, ChronoUnit.HOURS),
            start.plus(8, ChronoUnit.HOURS), 8000L)), 404, "RIDER_NOT_FOUND");

        UUID key = UUID.randomUUID();
        SlotInput later = new SlotInput(rider, "Madhapur", start.plus(9, ChronoUnit.HOURS), start.plus(10, ChronoUnit.HOURS), 8000L);
        slots.create(ops, key, later);
        slots.create(ops, key, later);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_slot WHERE rider_id = ?", Integer.class, rider))
            .as("a replayed Idempotency-Key books once").isEqualTo(3);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'SLOT_BOOKED'", Integer.class))
            .isEqualTo(3);
    }

    @Test
    void cancellingEndsTheGuaranteeOnce() {
        Instant start = Instant.now().plus(1, ChronoUnit.HOURS);
        Slot booked = (Slot) slots.create(ops, UUID.randomUUID(), new SlotInput(rider, "Madhapur", start, start.plus(1, ChronoUnit.HOURS), 8000L));
        Slot cancelled = (Slot) slots.cancel(ops, UUID.randomUUID(), booked.slotId(), "Rain stopped all deliveries");
        assertThat(cancelled.status()).isEqualTo("CANCELLED");
        refused(() -> slots.cancel(ops, UUID.randomUUID(), booked.slotId(), "Again"), 409, "SLOT_NOT_BOOKED");
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        assertThat(slots.list(today, today.plusDays(1), rider).slots()).extracting(Slot::status).containsExactly("CANCELLED");
    }

    @Test
    void cancellingAStartedSlotEndsItNowAndTheGuaranteeCoversTheTimeWorked() {
        Instant start = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        Instant plannedEnd = start.plus(3, ChronoUnit.HOURS);
        UUID slot = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, guaranteed_per_hour_paise, "
            + "in_zone_seconds) VALUES (?, ?, 'Madhapur', ?, ?, 8000, 2700)", slot, rider, java.sql.Timestamp.from(start),
            java.sql.Timestamp.from(plannedEnd));

        Slot ended = (Slot) slots.cancel(ops, UUID.randomUUID(), slot, "Heavy rain: stopping deliveries in Madhapur");

        assertThat(ended.status()).as("settled like any slot that ended").isEqualTo("BOOKED");
        assertThat(ended.endsAt()).isAfter(start).isBefore(Instant.now().plusSeconds(1));
        refused(() -> slots.cancel(ops, UUID.randomUUID(), slot, "Again"), 409, "SLOT_NOT_BOOKED");
        assertThat(fleet.db.queryForObject("SELECT summary FROM fleet_schema.admin_audit WHERE action = 'SLOT_CANCELLED'", String.class))
            .startsWith("Ended the slot early");
        assertThat(slots.settleDue()).isEqualTo(1);
        var settlement = fleet.db.queryForMap("SELECT * FROM fleet_schema.rider_slot_settlement WHERE slot_id = ?", slot);
        assertThat(settlement.get("guaranteed_paise")).as("45 minutes online at ₹80 an hour").isEqualTo(6000L);
        assertThat(settlement.get("top_up_paise")).isEqualTo(6000L);
        Slot later = (Slot) slots.create(ops, UUID.randomUUID(), new SlotInput(rider, "Kondapur", Instant.now().plus(5, ChronoUnit.MINUTES),
            plannedEnd, 8000L));
        assertThat(later.status()).as("the rest of the window is free again").isEqualTo("BOOKED");
    }

    @Test
    void theTopUpIsTheGuaranteeForOnlineInZoneTimeLessTripPayAndDeclinesChangeNothing() {
        Instant start = Instant.now().minus(3, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        Instant end = start.plus(2, ChronoUnit.HOURS);
        UUID slot = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, guaranteed_per_hour_paise) "
            + "VALUES (?, ?, 'Madhapur', ?, ?, 8000)", slot, rider, java.sql.Timestamp.from(start), java.sql.Timestamp.from(end));
        // 1.5 hours online inside the zone during the slot (non-mock fixes, counted per slot by location ingest). The shift
        // around it also ran an earlier slot, so its own counter is higher and plays no part.
        fleet.db.update("UPDATE fleet_schema.rider_slot SET in_zone_seconds = 5400 WHERE id = ?", slot);
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at, ended_at, "
            + "in_zone_seconds) VALUES (?, ?, ?, ?, ?, ?, 9000)", UUID.randomUUID(), rider, "a".repeat(64),
            java.sql.Timestamp.from(start.plus(8, ChronoUnit.HOURS)), java.sql.Timestamp.from(start.minus(60, ChronoUnit.MINUTES)),
            java.sql.Timestamp.from(end));
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'DELIVERED', final_pay_paise = 5000, finished_at = ? WHERE id = ?",
            rider, java.sql.Timestamp.from(start.plus(30, ChronoUnit.MINUTES)), trip);
        UUID other = fleet.trip(UUID.randomUUID());
        fleet.db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, state, pay_paise, rate_card_version, pickup_distance_m, "
            + "drop_distance_m, offered_at, expires_at, decided_at) VALUES (?, ?, ?, 'DECLINED', 9000, '2026-10-v1', 500, 4000, ?, ?, ?)",
            UUID.randomUUID(), other, rider, java.sql.Timestamp.from(start.plus(40, ChronoUnit.MINUTES)),
            java.sql.Timestamp.from(start.plus(41, ChronoUnit.MINUTES)), java.sql.Timestamp.from(start.plus(40, ChronoUnit.MINUTES)));

        assertThat(slots.settleDue()).isEqualTo(1);
        assertThat(slots.settleDue()).as("each slot settles once").isZero();

        var settlement = fleet.db.queryForMap("SELECT * FROM fleet_schema.rider_slot_settlement WHERE slot_id = ?", slot);
        assertThat(settlement.get("online_in_zone_seconds")).isEqualTo(5400);
        assertThat(settlement.get("guaranteed_paise")).isEqualTo(12000L);
        assertThat(settlement.get("trip_pay_paise")).isEqualTo(5000L);
        assertThat(settlement.get("top_up_paise")).isEqualTo(7000L);
        assertThat(settlement.get("credited_at")).as("the money phase credits it").isNull();
        LocalDate day = start.atZone(ZoneId.of("Asia/Kolkata")).toLocalDate();
        Slot completed = slots.list(day.minusDays(1), day.plusDays(1), rider).slots().get(0);
        assertThat(completed.status()).isEqualTo("COMPLETED");
        assertThat(completed.onlineInZoneMinutes()).isEqualTo(90);
        assertThat(completed.topUpPaise()).isEqualTo(7000L);
    }

    private static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
