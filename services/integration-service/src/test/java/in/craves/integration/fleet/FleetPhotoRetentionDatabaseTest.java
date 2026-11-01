package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** P2-09: selfies go after 30 days and delivery photos after 90, unless flagged or disputed; nothing goes while off. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPhotoRetentionDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final List<String> deleted = new ArrayList<>();
    final FleetStorage storage = new FleetStorage(FleetDatabase.properties(true)) {
        @Override
        public void delete(String blobName) {
            if (blobName.contains("unreachable")) {
                throw new FleetApiException(503, "STORAGE_UNAVAILABLE", "Secure file storage is unavailable.");
            }
            deleted.add(blobName);
        }
    };
    final UUID rider = fleet.rider("Ravi Kumar", "+919876543210");

    String shift(int daysAgo, String state) {
        UUID id = UUID.randomUUID();
        String blob = "riders/" + rider + "/selfies/" + id + ".jpg";
        fleet.db.update("""
            INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, started_at, credential_expires_at, ended_at, selfie_blob,
              selfie_size_bytes, selfie_state, selfie_reason)
            VALUES (?, ?, ?, now() - make_interval(days => ?), now() - make_interval(days => ?) + INTERVAL '1 hour',
              now() - make_interval(days => ?) + INTERVAL '1 hour', ?, 1000, ?, ?)""",
            id, rider, (UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", ""), daysAgo, daysAgo, daysAgo, blob, state,
            "REJECTED".equals(state) ? "Not the rider on file" : null);
        return blob;
    }

    UUID delivered(int daysAgo, String photo) {
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'DELIVERED', rider_id = ?, finished_at = now() - make_interval(days => ?) "
            + "WHERE id = ?", rider, daysAgo, trip);
        fleet.db.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, actor_id, detail, created_at) "
            + "VALUES (?, ?, 'DELIVERED', 'RIDER', ?, CAST(? AS jsonb), now() - make_interval(days => ?))", UUID.randomUUID(), trip, rider,
            photo == null ? "{\"method\": \"OTP\"}" : "{\"method\": \"PHOTO\", \"callsMade\": 2, \"photoBlob\": \"" + photo + "\"}", daysAgo);
        return trip;
    }

    void issue(UUID trip, String state) {
        fleet.db.update("INSERT INTO fleet_schema.support_issue (id, rider_id, trip_id, category, state, acknowledge_by, fix_by) "
            + "VALUES (?, ?, ?, 'MISSING_PAY', ?, now() + INTERVAL '1 day', now() + INTERVAL '3 days')", UUID.randomUUID(), rider, trip, state);
    }

    String photoOf(UUID trip) {
        return fleet.db.queryForObject("SELECT detail ->> 'photoBlob' FROM fleet_schema.trip_event WHERE trip_id = ?", String.class, trip);
    }

    List<String> selfiesKept() {
        return fleet.db.queryForList("SELECT selfie_blob FROM fleet_schema.rider_shift WHERE selfie_blob IS NOT NULL", String.class);
    }

    String photo(String name) {
        return "riders/" + rider + "/trips/" + name + "/delivery-" + name + ".jpg";
    }

    @Test
    void deletesWhatIsDueAndKeepsWhatIsFlaggedDisputedOrRecent() {
        String approved = shift(31, "APPROVED");
        String pending = shift(40, "PENDING");
        String rejected = shift(60, "REJECTED");
        String recent = shift(29, "APPROVED");
        UUID old = delivered(91, photo("old"));
        UUID held = delivered(95, photo("held"));
        fleet.db.update("INSERT INTO fleet_schema.rider_pay_hold (id, trip_id, rider_id, reason, release_on, created_by_name) "
            + "VALUES (?, ?, ?, 'The customer says it did not arrive.', (now() AT TIME ZONE 'Asia/Kolkata')::date + 2, 'Ops')",
            UUID.randomUUID(), held, rider);
        UUID disputed = delivered(100, photo("disputed"));
        issue(disputed, "ACKNOWLEDGED");
        UUID settled = delivered(120, photo("settled"));
        issue(settled, "FIXED");
        UUID uncredited = delivered(92, photo("uncredited"));
        fleet.db.update("UPDATE fleet_schema.trip SET pay_held = true, pay_finalized_at = now() - INTERVAL '92 days' WHERE id = ?", uncredited);
        UUID young = delivered(89, photo("young"));
        UUID byCode = delivered(200, null);
        UUID unreachable = delivered(150, "riders/" + rider + "/trips/unreachable/delivery-unreachable.jpg");
        FleetPhotoRetention retention = new FleetPhotoRetention(fleet.db, storage, true);

        assertThat(retention.run()).isEqualTo(new FleetPhotoRetention.Result(2, 2, 1));
        assertThat(deleted).containsExactlyInAnyOrder(approved, pending, photo("old"), photo("settled"));
        assertThat(selfiesKept()).as("rejected (flagged) and recent selfies stay").containsExactlyInAnyOrder(rejected, recent);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_shift WHERE selfie_blob IS NULL AND selfie_size_bytes IS NULL",
            Integer.class)).isEqualTo(2);
        assertThat(photoOf(old)).isNull();
        assertThat(fleet.db.queryForObject("SELECT (detail ->> 'method') || ' ' || ((detail ->> 'photoDeletedAt') IS NOT NULL) "
            + "FROM fleet_schema.trip_event WHERE trip_id = ?", String.class, old)).isEqualTo("PHOTO true");
        assertThat(photoOf(settled)).isNull();
        assertThat(List.of(photoOf(held), photoOf(disputed), photoOf(uncredited), photoOf(young)))
            .as("held, disputed, not yet credited and recent photos stay")
            .containsExactly(photo("held"), photo("disputed"), photo("uncredited"), photo("young"));
        assertThat(photoOf(unreachable)).as("a file that could not go keeps its reference").endsWith("unreachable.jpg");
        assertThat(photoOf(byCode)).isNull();

        deleted.clear();
        assertThat(retention.run()).as("a second run finds only the file that failed").isEqualTo(new FleetPhotoRetention.Result(0, 0, 1));
        assertThat(deleted).isEmpty();
    }

    @Test
    void deletesNothingWhileOff() {
        String selfie = shift(45, "APPROVED");
        UUID trip = delivered(120, photo("old"));

        new FleetPhotoRetention(fleet.db, storage, false).daily();

        assertThat(deleted).isEmpty();
        assertThat(selfiesKept()).containsExactly(selfie);
        assertThat(photoOf(trip)).isEqualTo(photo("old"));
    }
}
