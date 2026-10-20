package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class FleetShiftServiceTest {
    @Test
    void versionsCompareByNumberPartAsTheAppDoes() {
        assertThat(FleetShiftService.versionBelow("1.0.0", "1.0.0")).isFalse();
        assertThat(FleetShiftService.versionBelow("1.0", "1.0.1")).isTrue();
        assertThat(FleetShiftService.versionBelow("1.9.0", "1.10.0")).isTrue();
        assertThat(FleetShiftService.versionBelow("2", "1.10")).isFalse();
        assertThat(FleetShiftService.versionBelow(null, "1.0.0")).as("no bound phone version").isTrue();
        assertThat(FleetShiftService.versionBelow("1.0.0-beta", "1.0.0")).as("unreadable").isTrue();
    }

    @Test
    void aDeviceIdBelongsToOneRiderAndOneInstallation() {
        UUID rider = UUID.randomUUID();
        assertThat(FleetShiftService.deviceId(rider, "9774d56d682e549c")).isEqualTo(FleetShiftService.deviceId(rider, "9774d56d682e549c"))
            .isNotEqualTo(FleetShiftService.deviceId(rider, "9774d56d682e549d"))
            .isNotEqualTo(FleetShiftService.deviceId(UUID.randomUUID(), "9774d56d682e549c"));
    }

    @Test
    void credentialsAreRandomUrlSafeAndStoredAsSha256Hex() {
        String credential = FleetShiftService.newCredential();
        assertThat(credential).matches("[A-Za-z0-9_-]{43}").isNotEqualTo(FleetShiftService.newCredential());
        assertThat(FleetShiftService.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
