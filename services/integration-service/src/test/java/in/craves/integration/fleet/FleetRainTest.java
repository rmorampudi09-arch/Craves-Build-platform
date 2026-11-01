package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.FleetRain.Setting;
import in.craves.integration.fleet.FleetRain.Status;
import in.craves.integration.fleet.eta.FleetEta;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/** Rain mode's level (R16 19): the ops switch, the automatic switch, the 30-second cache, and the rules it runs dispatch with. */
class FleetRainTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    void stored(String level) {
        when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<Setting>>any())).thenReturn(List.of(new Setting(level, null, null)));
    }

    /** The automatic switch's reading: how many rides to the door in the last 30 minutes, and the middle one's actual / predicted. */
    void rides(long rides, Double ratio) {
        Map<String, Object> row = new HashMap<>();
        row.put("rides", rides);
        row.put("ratio", ratio);
        when(jdbc.queryForMap(anyString(), eq(FleetRain.AUTO_MINUTES))).thenReturn(row);
    }

    FleetRain rain(String etaMode, boolean auto) {
        return new FleetRain(jdbc, new FleetEta(jdbc, etaMode, ""), auto);
    }

    @Test
    void theLevelIsReadAtMostEvery30SecondsAndAFailedReadKeepsTheLastOne() {
        FleetRain rain = rain("off", false);
        stored("severe");
        assertThat(rain.level(0)).isEqualTo("severe");
        stored("off");
        assertThat(rain.level(29_999)).as("dispatch doesn't read it per rider").isEqualTo("severe");
        verify(jdbc, times(1)).query(anyString(), ArgumentMatchers.<RowMapper<Setting>>any());
        when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<Setting>>any())).thenThrow(new DataAccessResourceFailureException("down"));
        assertThat(rain.level(30_000)).as("the database is down: the last level holds").isEqualTo("severe");
        assertThat(rain("off", false).level(0)).as("before any read: off").isEqualTo("off");
    }

    @Test
    void settingTheSwitchIsUsedOnThisServerAtOnce() {
        FleetRain rain = rain("off", false);
        stored("off");
        assertThat(rain.level(0)).isEqualTo("off");
        stored("on");
        assertThat(rain.set("on", UUID.randomUUID(), "Admin +91 98xxxxx210").level()).isEqualTo("on");
        assertThat(rain.level(1)).as("not the cached off").isEqualTo("on");
        assertThat(rain.status()).isEqualTo(new Status(new Setting("on", null, null), false, "on"));
    }

    @Test
    void theAutomaticSwitchComesOnWhenTheMiddleOfTenOrMoreRidesRan30PercentOverItsPrediction() {
        stored("off");
        rides(12, 1.5);
        assertThat(rain("live", true).level(0)).isEqualTo("on");
        Status status = rain("live", true).status();
        assertThat(status.level()).isEqualTo("on");
        assertThat(status.setting().level()).as("the ops switch stays off").isEqualTo("off");
        assertThat(status.auto()).isTrue();
        rides(9, 2.0);
        assertThat(rain("live", true).level(0)).as("too few rides").isEqualTo("off");
        rides(12, 1.29);
        assertThat(rain("live", true).level(0)).isEqualTo("off");
        rides(0, null);
        assertThat(rain("live", true).level(0)).as("no rides at all").isEqualTo("off");
    }

    @Test
    void theAutomaticSwitchReadsNothingWithoutTheLiveModelOrItsFlag() {
        stored("off");
        rides(12, 1.5);
        assertThat(rain("shadow", true).level(0)).as("only with the model live").isEqualTo("off");
        assertThat(rain("live", false).level(0)).as("CRAVES_FLEET_RAIN_AUTO off").isEqualTo("off");
        verify(jdbc, never()).queryForMap(anyString(), eq(FleetRain.AUTO_MINUTES));
    }

    @Test
    void theOpsSettingWinsOverTheAutomaticSwitch() {
        stored("severe");
        rides(12, 1.0);
        assertThat(rain("live", true).level(0)).isEqualTo("severe");
        verify(jdbc, never()).queryForMap(anyString(), eq(FleetRain.AUTO_MINUTES));
        when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<Setting>>any())).thenReturn(List.of());
        assertThat(rain("off", false).setting()).as("no row: off").isEqualTo(new Setting("off", null, null));
    }

    @Test
    void inRainRidersGetAtLeast45SecondsAndAnOrderAtMostTwoRounds() {
        DispatchPolicy builtIn = new DispatchPolicy("2026-11-v1", Instant.EPOCH, "live", 30, 120, 5000, 130, 500, 1000, 600, 1, 3, 1500, true);
        assertThat(FleetRain.inRain(builtIn)).isEqualTo(
            new DispatchPolicy("2026-11-v1", Instant.EPOCH, "live", 45, 120, 5000, 130, 500, 1000, 600, 1, 2, 1500, true));
        DispatchPolicy slow = new DispatchPolicy("2026-11-v2", Instant.EPOCH, "live", 60, 120, 5000, 130, 500, 1000, 600, 2, 1, 0, false);
        assertThat(FleetRain.inRain(slow)).as("never less time to accept, never more rounds").isEqualTo(slow);
    }
}
