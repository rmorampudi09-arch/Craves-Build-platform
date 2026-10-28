package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.rider.FleetRiderModels.PrivacyNotice;
import in.craves.integration.security.CravesPrincipal;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** P2-09: riders accept the privacy notice in force, PENDING ones too; GET /me shows whether they did; nothing while none is set. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPrivacyNoticeDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final FleetPolicyStore policies = new FleetPolicyStore(fleet.db, new ObjectMapper());
    final UUID identity = UUID.randomUUID();
    final CravesPrincipal pending = new CravesPrincipal(identity, "+919876543210", Set.of("CUSTOMER"));

    FleetRiderService riders(String notice) {
        return new FleetRiderService(fleet.db, policies, FleetDatabase.properties(true, false, notice), mock(FleetStorage.class));
    }

    @Test
    void aRiderAcceptsTheVersionInForceOnceInTheLanguageTheAppShowed() {
        UUID rider = fleet.rider("Sita Devi", "+919876543210");
        fleet.db.update("UPDATE fleet_schema.rider SET identity_id = ?, language = 'te' WHERE id = ?", identity, rider);
        FleetRiderService riders = riders("2027-05-v1");

        assertThat(riders.me(pending).privacyNotice())
            .isEqualTo(new PrivacyNotice("2027-05-v1", "https://craves.in/riders/privacy/{language}", false));
        assertThatThrownBy(() -> riders.acceptPrivacyNotice(identity, "2027-04-v1", "en")).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("NOTICE_CHANGED"));
        riders.acceptPrivacyNotice(identity, "2027-05-v1", "en");
        riders.acceptPrivacyNotice(identity, "2027-05-v1", "hi");

        assertThat(riders.me(pending).privacyNotice().accepted()).isTrue();
        assertThat(fleet.db.queryForList("SELECT version, language FROM fleet_schema.rider_privacy_acceptance WHERE rider_id = ?", rider))
            .as("the first acceptance stands").containsExactly(Map.of("version", "2027-05-v1", "language", "en"));
        assertThat(riders("2027-11-v2").me(pending).privacyNotice().accepted()).as("a new version is accepted again").isFalse();
    }

    @Test
    void anUnknownLanguageIsRecordedAsTheRidersOwn() {
        UUID rider = fleet.rider("Sita Devi", "+919876543210");
        fleet.db.update("UPDATE fleet_schema.rider SET identity_id = ?, language = 'te' WHERE id = ?", identity, rider);
        riders("2027-05-v1").acceptPrivacyNotice(identity, "2027-05-v1", "fr");
        assertThat(fleet.db.queryForObject("SELECT language FROM fleet_schema.rider_privacy_acceptance WHERE rider_id = ?", String.class, rider))
            .isEqualTo("te");
    }

    @Test
    void noNoticeWhileNoneIsSetAndNoneForSomeoneWhoIsNotARider() {
        UUID rider = fleet.rider("Sita Devi", "+919876543210");
        fleet.db.update("UPDATE fleet_schema.rider SET identity_id = ? WHERE id = ?", identity, rider);
        assertThat(riders(null).me(pending).privacyNotice()).isNull();
        assertThatThrownBy(() -> riders(null).acceptPrivacyNotice(identity, "2027-05-v1", "en")).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("NOTICE_CHANGED"));

        CravesPrincipal stranger = new CravesPrincipal(UUID.randomUUID(), "+919111111111", Set.of("CUSTOMER"));
        assertThat(riders("2027-05-v1").me(stranger).privacyNotice()).isNull();
        assertThatThrownBy(() -> riders("2027-05-v1").acceptPrivacyNotice(stranger.identityId(), "2027-05-v1", "en"))
            .isInstanceOfSatisfying(FleetApiException.class, error -> assertThat(error.code()).isEqualTo("NOT_A_RIDER"));
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_privacy_acceptance", Integer.class)).isZero();
    }
}
