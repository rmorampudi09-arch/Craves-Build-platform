package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.rider.FleetLocationService;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

/** V152: the constraints the fleet relies on hold in the database itself, and trip_track routes by IST day. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetSchemaDatabaseTest {
    FleetDatabase fleet;
    JdbcTemplate db;
    UUID ravi;
    UUID sita;

    @BeforeEach
    void setUp() {
        fleet = new FleetDatabase();
        db = fleet.db;
        ravi = fleet.rider("Ravi Kumar", "+919876543210");
        sita = fleet.rider("Sita Devi", "+919876543211");
    }

    @Test
    void migrationIsRerunnableAndSeedsADraftRateCardAndAnOffPolicy() {
        // Other database tests drop payment_schema and migrate again while fleet_schema stays.
        db.execute("DROP SCHEMA payment_schema CASCADE");
        db.execute("DROP SCHEMA delivery_schema CASCADE");
        org.flywaydb.core.Flyway.configure().dataSource(fleet.dataSource).schemas("payment_schema")
            .defaultSchema("payment_schema").locations("classpath:db/migration").load().migrate();

        assertThat(db.queryForMap("SELECT status, base_paise, drop_per_km_paise, pickup_per_km_paise, wait_per_minute_paise, "
            + "slot_guarantee_per_hour_paise FROM fleet_schema.rate_card WHERE version = '2026-10-v1'"))
            .containsEntry("status", "DRAFT").containsEntry("base_paise", 4000L).containsEntry("drop_per_km_paise", 900L)
            .containsEntry("pickup_per_km_paise", 900L).containsEntry("wait_per_minute_paise", 150L)
            .containsEntry("slot_guarantee_per_hour_paise", 8000L);
        assertThat(db.queryForMap("SELECT mode, offer_seconds, fleet_stage_seconds FROM fleet_schema.dispatch_policy"))
            .containsEntry("mode", "off").containsEntry("offer_seconds", 40).containsEntry("fleet_stage_seconds", 60);
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider", Integer.class)).isEqualTo(2);
    }

    @Test
    void riderPhoneIsUniqueAndAadhaarIsNotADocumentType() {
        assertThatThrownBy(() -> fleet.rider("Other", "+919876543210")).isInstanceOf(DuplicateKeyException.class);
        assertThatThrownBy(() -> db.update("INSERT INTO fleet_schema.rider_document (id, rider_id, type, blob_name, content_type, "
            + "size_bytes) VALUES (?, ?, 'AADHAAR', 'x', 'image/jpeg', 10)", UUID.randomUUID(), ravi))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void oneBoundPhonePerRider() {
        device(ravi, "BOUND");
        device(ravi, "PENDING_APPROVAL");
        assertThatThrownBy(() -> device(ravi, "BOUND")).isInstanceOf(DuplicateKeyException.class);
        device(sita, "BOUND");
    }

    @Test
    void payoutAccountIsUniqueAcrossRidersAndOneIsActivePerRider() {
        payoutAccount(ravi, "k1.same");
        assertThatThrownBy(() -> payoutAccount(sita, "k1.same")).isInstanceOf(DuplicateKeyException.class);
        assertThatThrownBy(() -> payoutAccount(ravi, "k1.other")).isInstanceOf(DuplicateKeyException.class);
        db.update("UPDATE fleet_schema.rider_payout_account SET state = 'REPLACED' WHERE rider_id = ?", ravi);
        payoutAccount(ravi, "k1.other");
    }

    @Test
    void statusEventsKeepDueProcessAndCannotBeEdited() {
        statusEvent("NOTICE", "now() + INTERVAL '7 days'", null, "+914000000000");
        assertThatThrownBy(() -> statusEvent("NOTICE", "now() + INTERVAL '6 days'", null, "+914000000000"))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> statusEvent("SAFETY_PAUSE", null, "now() + INTERVAL '73 hours'", "+914000000000"))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> statusEvent("DEACTIVATE", null, null, null)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> db.update("UPDATE fleet_schema.rider_status_event SET reason = 'edited'"))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void onlyTheFirstRateCardMayBePublishedInsideFourteenDaysAndPublishedAtIsTheDatabaseClock() {
        db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now() - INTERVAL '30 days', "
            + "effective_from = now() WHERE version = '2026-10-v1'");
        assertThat(db.queryForObject("SELECT published_at > now() - INTERVAL '1 minute' FROM fleet_schema.rate_card "
            + "WHERE version = '2026-10-v1'", Boolean.class))
            .as("a backdated published_at is replaced").isTrue();
        db.update("INSERT INTO fleet_schema.rate_card (version, effective_from, base_paise, base_drop_m, drop_per_km_paise, pickup_free_m, "
            + "pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, summary_of_changes) "
            + "SELECT '2026-12-v2', now() + INTERVAL '1 day', base_paise, base_drop_m, drop_per_km_paise, pickup_free_m, "
            + "pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, summary_of_changes "
            + "FROM fleet_schema.rate_card WHERE version = '2026-10-v1'");
        assertThatThrownBy(() -> db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now() - INTERVAL '14 days' "
            + "WHERE version = '2026-12-v2'")).as("backdating cannot buy notice").isInstanceOf(DataIntegrityViolationException.class);
        db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now(), effective_from = now() + INTERVAL '14 days' "
            + "WHERE version = '2026-12-v2'");
    }

    @Test
    void twoVersionsThatStartLaterCannotShareAMoment() {
        db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now(), effective_from = now() WHERE version = '2026-10-v1'");
        String card = "INSERT INTO fleet_schema.rate_card (version, status, effective_from, published_at, base_paise, base_drop_m, "
            + "drop_per_km_paise, pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, "
            + "ranges, summary_of_changes) SELECT ?, 'PUBLISHED', TIMESTAMPTZ '2030-01-01 00:00:00+00', now(), base_paise, base_drop_m, "
            + "drop_per_km_paise, pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, "
            + "ranges, summary_of_changes FROM fleet_schema.rate_card WHERE version = '2026-10-v1'";
        db.update(card, "2029-12-v1");
        assertThatThrownBy(() -> db.update(card, "2029-12-v2")).isInstanceOf(DataIntegrityViolationException.class);
        String policy = "INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, mode, offer_seconds, "
            + "fleet_stage_seconds, radius_m, ranges) VALUES (?, 'PUBLISHED', TIMESTAMPTZ '2030-01-01 00:00:00+00', now(), 'shadow', 40, 60, "
            + "5000, '{}')";
        db.update(policy, "2029-12-v1");
        assertThatThrownBy(() -> db.update(policy, "2029-12-v2")).isInstanceOf(DataIntegrityViolationException.class);
        db.update("UPDATE fleet_schema.dispatch_policy SET withdrawn_at = now(), withdrawn_by = ? WHERE version = '2029-12-v1'", UUID.randomUUID());
        db.update(policy, "2029-12-v2");
    }

    @Test
    void publishedVersionsNeverChangeExceptOneWithdrawalBeforeTheyStart() {
        db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now(), effective_from = now() "
            + "WHERE version = '2026-10-v1'");
        assertThatThrownBy(() -> db.update("UPDATE fleet_schema.rate_card SET base_paise = 5000 WHERE version = '2026-10-v1'"))
            .as("pay values of a published card").isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> db.update("UPDATE fleet_schema.rate_card SET status = 'DRAFT', published_at = NULL WHERE version = '2026-10-v1'"))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> db.update("DELETE FROM fleet_schema.rate_card WHERE version = '2026-10-v1'"))
            .isInstanceOf(DataIntegrityViolationException.class);

        String insert = "INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, mode, offer_seconds, "
            + "fleet_stage_seconds, radius_m, ranges) VALUES (?, 'PUBLISHED', now() + CAST(? AS interval), now(), ?, 40, 60, 5000, '{}')";
        db.update(insert, "2026-10-v2", "0 days", "off");
        db.update(insert, "2026-10-v3", "15 days", "live");
        assertThatThrownBy(() -> db.update("UPDATE fleet_schema.dispatch_policy SET withdrawn_at = now() - INTERVAL '1 hour', "
            + "withdrawn_by = ? WHERE version = '2026-10-v2'", UUID.randomUUID())).as("a backdated withdrawal of the policy in force")
            .isInstanceOf(DataIntegrityViolationException.class);
        db.update("UPDATE fleet_schema.dispatch_policy SET withdrawn_at = now() + INTERVAL '30 days', withdrawn_by = ? "
            + "WHERE version = '2026-10-v3'", UUID.randomUUID());
        assertThat(db.queryForObject("SELECT withdrawn_at BETWEEN now() - INTERVAL '1 minute' AND now() FROM fleet_schema.dispatch_policy "
            + "WHERE version = '2026-10-v3'", Boolean.class)).as("withdrawn_at is the database clock").isTrue();
        for (String change : List.of("withdrawn_at = NULL, withdrawn_by = NULL", "status = 'DRAFT', published_at = NULL", "mode = 'off'")) {
            assertThatThrownBy(() -> db.update("UPDATE fleet_schema.dispatch_policy SET " + change + " WHERE version = '2026-10-v3'"))
                .as(change).isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThatThrownBy(() -> db.update("UPDATE fleet_schema.dispatch_policy SET withdrawn_at = now(), withdrawn_by = ? "
            + "WHERE version = '2026-10-v1'", UUID.randomUUID())).as("a draft").isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> db.update("DELETE FROM fleet_schema.dispatch_policy WHERE version = '2026-10-v3'"))
            .as("a withdrawn version is still a record").isInstanceOf(DataIntegrityViolationException.class);
        db.update("DELETE FROM fleet_schema.dispatch_policy WHERE version = '2026-10-v1'");
    }

    @Test
    void oneTripPerChefSubOrderOneActiveOfferPerRiderAndOneWinnerPerTrip() {
        UUID subOrder = UUID.randomUUID();
        UUID trip = fleet.trip(subOrder);
        UUID other = fleet.trip(UUID.randomUUID());
        assertThatThrownBy(() -> fleet.trip(subOrder)).isInstanceOf(DuplicateKeyException.class);

        offer(trip, ravi, "ACTIVE");
        assertThatThrownBy(() -> offer(other, ravi, "ACTIVE")).isInstanceOf(DuplicateKeyException.class);
        offer(trip, sita, "ACCEPTED");
        assertThatThrownBy(() -> db.update("UPDATE fleet_schema.trip_offer SET state = 'ACCEPTED', decided_at = now() "
            + "WHERE rider_id = ?", ravi)).isInstanceOf(DuplicateKeyException.class);

        db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) "
            + "VALUES (?, ?, 1, 'CRAVES_FLEET', now() + INTERVAL '60 seconds')", UUID.randomUUID(), trip);
        assertThatThrownBy(() -> db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) "
            + "VALUES (?, ?, 2, 'BORZO', now() + INTERVAL '60 seconds')", UUID.randomUUID(), trip))
            .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void earningKeyIsUniqueAndFollowsTheTripComponentRevisionPattern() {
        UUID trip = fleet.trip(UUID.randomUUID());
        earning(trip, "base", 1, "fleet-trip-pay/" + trip + "/base/1");
        assertThatThrownBy(() -> earning(trip, "base", 1, "fleet-trip-pay/" + trip + "/base/1"))
            .isInstanceOf(DuplicateKeyException.class);
        assertThatThrownBy(() -> earning(trip, "base", 2, "some-other-key")).isInstanceOf(DataIntegrityViolationException.class);
        earning(trip, "base", 2, "fleet-trip-pay/" + trip + "/base/2");
    }

    @Test
    void oneWithdrawalPerRiderPerDayAndOneOpenShift() {
        db.update("INSERT INTO fleet_schema.rider_withdrawal_day (rider_id, request_date, amount_paise, idem_key) VALUES (?, DATE '2026-10-20', 5000, 'first')", ravi);
        assertThatThrownBy(() -> db.update("INSERT INTO fleet_schema.rider_withdrawal_day (rider_id, request_date, amount_paise, idem_key) "
            + "VALUES (?, DATE '2026-10-20', 100, 'second')", ravi)).isInstanceOf(DuplicateKeyException.class);

        shift(ravi, "a");
        assertThatThrownBy(() -> shift(ravi, "b")).isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void adminAuditKeyIsUsedOncePerActorAndTheTrailIsAppendOnly() {
        UUID actor = UUID.randomUUID();
        UUID key = UUID.randomUUID();
        audit(actor, key);
        assertThatThrownBy(() -> audit(actor, key)).isInstanceOf(DuplicateKeyException.class);
        audit(UUID.randomUUID(), key);
        assertThatThrownBy(() -> db.update("DELETE FROM fleet_schema.admin_audit")).isInstanceOf(DataAccessException.class);
    }

    @Test
    void tripTrackRoutesEachFixToItsIstDay() {
        db.update("INSERT INTO fleet_schema.trip_track (trip_id, rider_id, recorded_at, lat, lng, accuracy_m, mock) VALUES "
            + "(?, ?, now(), 17.4, 78.3, 5, false), (?, ?, TIMESTAMPTZ '2001-01-01 10:00+05:30', 17.4, 78.3, 5, true)",
            UUID.randomUUID(), ravi, UUID.randomUUID(), ravi);
        assertThat(db.queryForList("SELECT tableoid::regclass::text FROM fleet_schema.trip_track ORDER BY recorded_at", String.class))
            .containsExactly("fleet_schema.trip_track_default", "fleet_schema.trip_track_"
                + db.queryForObject("SELECT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD')", String.class));
    }

    /** Retention (blueprint E6): on-trip fixes are kept 90 days; older day partitions and default-partition rows go. */
    @Test
    void trackDaysOlderThanNinetyDaysAreDropped() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        String old = trackDay(today.minusDays(91));
        String kept = trackDay(today.minusDays(89));
        db.update("INSERT INTO fleet_schema.trip_track (trip_id, rider_id, recorded_at, lat, lng, accuracy_m, mock) VALUES "
            + "(?, ?, now() - INTERVAL '200 days', 17.4, 78.3, 5, false), (?, ?, now() - INTERVAL '10 days', 17.4, 78.3, 5, false)",
            UUID.randomUUID(), ravi, UUID.randomUUID(), ravi);

        new FleetLocationService(db, new ObjectMapper()).createTrackDays();

        assertThat(db.queryForList("SELECT relname::text FROM pg_class WHERE relname IN (?, ?)", String.class, old, kept)).containsExactly(kept);
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.trip_track_default", Integer.class)).as("the 10-day-old row")
            .isEqualTo(1);
    }

    private String trackDay(LocalDate day) {
        String name = "trip_track_" + day.format(DateTimeFormatter.BASIC_ISO_DATE);
        db.execute("CREATE TABLE fleet_schema." + name + " PARTITION OF fleet_schema.trip_track FOR VALUES FROM ('" + day
            + " 00:00+05:30') TO ('" + day.plusDays(1) + " 00:00+05:30')");
        return name;
    }

    private void device(UUID rider, String state) {
        db.update("INSERT INTO fleet_schema.rider_device (id, rider_id, app_version, model, state) VALUES (?, ?, '1.0.0', 'Redmi', ?)",
            UUID.randomUUID(), rider, state);
    }

    private void payoutAccount(UUID rider, String fingerprint) {
        db.update("INSERT INTO fleet_schema.rider_payout_account (id, rider_id, method, encrypted_details, fingerprint, masked_account, "
            + "holder_name, verified_in_person, set_by, set_by_name) VALUES (?, ?, 'UPI', 'k1.x', ?, 'ra***@okaxis', 'Ravi Kumar', true, ?, 'Ops')",
            UUID.randomUUID(), rider, fingerprint, UUID.randomUUID());
    }

    private void statusEvent(String kind, String deadline, String reviewBy, String appealPhone) {
        db.update("INSERT INTO fleet_schema.rider_status_event (id, rider_id, kind, reason, evidence_summary, deadline, review_by, "
            + "appeal_phone, approver_id, approver_name, status_before, status_after, created_at) VALUES (?, ?, ?, 'Late deliveries', "
            + "'Three customer reports', " + deadline + ", " + reviewBy + ", ?, ?, 'Ops', 'ACTIVE', 'ACTIVE', now())",
            UUID.randomUUID(), ravi, kind, appealPhone, UUID.randomUUID());
    }

    private void offer(UUID trip, UUID rider, String state) {
        db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, state, decided_at, pay_paise, rate_card_version, "
            + "pickup_distance_m, drop_distance_m, expires_at) VALUES (?, ?, ?, ?, CASE WHEN ? = 'ACTIVE' THEN NULL ELSE now() END, "
            + "5800, '2026-10-v1', 900, 3000, now() + INTERVAL '40 seconds')", UUID.randomUUID(), trip, rider, state, state);
    }

    private void earning(UUID trip, String component, int revision, String key) {
        db.update("INSERT INTO fleet_schema.rider_earning (id, rider_id, trip_id, component, revision, business_key, gross_paise, "
            + "withheld_paise, net_paise, rate_card_version, withdrawable_at, reason) VALUES (?, ?, ?, ?, ?, ?, 4000, 0, 4000, '2026-10-v1', now(), ?)",
            UUID.randomUUID(), ravi, trip, component, revision, key, revision == 1 ? null : "Adjusted after review");
    }

    private void shift(UUID rider, String hashLetter) {
        db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at) "
            + "VALUES (?, ?, repeat(?, 64), now() + INTERVAL '12 hours')", UUID.randomUUID(), rider, hashLetter);
    }

    private void audit(UUID actor, UUID key) {
        db.update("INSERT INTO fleet_schema.admin_audit (id, actor_id, actor_name, action, summary, idem_key, request_hash, response_body) "
            + "VALUES (?, ?, 'Ops', 'RIDER_CREATED', 'Created', ?, repeat('0', 64), '{}')", UUID.randomUUID(), actor, key);
    }
}
