package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** POST /locations against a real database, with every statement the services run counted. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
@WebMvcTest(FleetLocationController.class)
@ContextConfiguration(classes = {FleetLocationController.class, FleetLocationService.class, FleetRiderController.class, FleetRiderService.class,
    FleetShiftService.class, FleetPolicyStore.class, FleetApiAdvice.class, WebSecurityConfiguration.class, CravesJwtAuthenticationFilter.class,
    FleetLocationApiDatabaseTest.CountingDatabase.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true",
    "craves.fleet.location-ingest-enabled=true"})
class FleetLocationApiDatabaseTest {
    static final String LOCATIONS = "/api/v1/rider/locations";
    static final AtomicInteger STATEMENTS = new AtomicInteger();

    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement
    static class CountingDatabase {
        @Bean FleetDatabase fleetDatabase() {
            return new FleetDatabase();
        }

        /** Counts every statement prepared or created on its connections (the services' only way to reach the database). */
        @Bean DataSource countingDataSource(FleetDatabase fleet) {
            return new DelegatingDataSource(fleet.dataSource) {
                @Override
                public Connection getConnection() throws SQLException {
                    Connection connection = super.getConnection();
                    return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class},
                        (proxy, method, args) -> {
                            if (method.getName().startsWith("prepare") || method.getName().equals("createStatement")) {
                                STATEMENTS.incrementAndGet();
                            }
                            try {
                                return method.invoke(connection, args);
                            } catch (InvocationTargetException exception) {
                                throw exception.getCause();
                            }
                        });
                }
            };
        }

        @Bean JdbcTemplate jdbcTemplate(DataSource countingDataSource) {
            return new JdbcTemplate(countingDataSource);
        }

        @Bean PlatformTransactionManager transactionManager(DataSource countingDataSource) {
            return new DataSourceTransactionManager(countingDataSource);
        }

        @Bean FleetProperties fleetProperties() {
            return FleetDatabase.properties(true);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired FleetDatabase fleet;
    @Autowired ObjectMapper json;
    @MockBean JwtVerifier verifier;
    @MockBean FleetStorage storage;

    @Test
    void theCredentialWorksHereAndNowhereElse() throws Exception {
        OnShift rider = onShift();
        mvc.perform(post(LOCATIONS).header(FleetShiftService.SHIFT_CREDENTIAL, "not-a-credential").contentType(MediaType.APPLICATION_JSON)
            .content("{\"fixes\":[]}")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SHIFT_CREDENTIAL_INVALID"));
        mvc.perform(post(LOCATIONS).contentType(MediaType.APPLICATION_JSON).content("{\"fixes\":[]}")).andExpect(status().isUnauthorized());
        UUID customer = UUID.randomUUID();
        when(verifier.verify("customer")).thenReturn(new CravesPrincipal(customer, "+919000000005", Set.of("CUSTOMER")));
        mvc.perform(post(LOCATIONS).header("Authorization", "Bearer customer").contentType(MediaType.APPLICATION_JSON).content("{\"fixes\":[]}"))
            .andExpect(status().isForbidden());

        for (String path : List.of("/api/v1/rider/me", "/api/v1/rider/home", "/api/v1/rider/profile", "/api/v1/rider/terms")) {
            mvc.perform(get(path).header(FleetShiftService.SHIFT_CREDENTIAL, rider.credential())).andExpect(status().is4xxClientError());
        }
        mvc.perform(post("/api/v1/rider/shift/end").header(FleetShiftService.SHIFT_CREDENTIAL, rider.credential()))
            .andExpect(status().is4xxClientError());
        assertThat(fleet.db.queryForObject("SELECT ended_at IS NULL FROM fleet_schema.rider_shift WHERE id = ?", Boolean.class, rider.shift()))
            .isTrue();
        locations(rider, List.of()).andExpect(status().isOk()).andExpect(jsonPath("$.offers.length()").value(0))
            .andExpect(jsonPath("$.stop").doesNotExist()).andExpect(jsonPath("$.activeTrip").doesNotExist());
    }

    @Test
    void theNewestFixWinsResentAndBadFixesAreIgnoredAndTheMockFlagIsKept() throws Exception {
        OnShift rider = onShift();
        Instant t = Instant.now().minusSeconds(60).truncatedTo(ChronoUnit.MILLIS);
        locations(rider, List.of(fix(t.plusSeconds(20), true), fix(t, false), fix(t.plusSeconds(10), false))).andExpect(status().isOk());
        locations(rider, List.of(fix(t.plusSeconds(5), false))).andExpect(status().isOk());
        locations(rider, List.of("{\"lat\":95,\"lng\":78.39,\"accuracyM\":5,\"at\":\"" + t.plusSeconds(30) + "\"}",
            fix(Instant.now().plusSeconds(3600), false))).andExpect(status().isOk());
        Map<String, Object> position = fleet.db.queryForMap("SELECT shift_id, trip_id, mock, recorded_at FROM fleet_schema.rider_position_latest "
            + "WHERE rider_id = ?", rider.id());
        assertThat(position).containsEntry("shift_id", rider.shift()).containsEntry("trip_id", null).containsEntry("mock", true)
            .containsEntry("recorded_at", Timestamp.from(t.plusSeconds(20)));
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_track WHERE rider_id = ?", Integer.class, rider.id()))
            .as("no trip, no track").isZero();

        List<String> six = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            six.add(fix(t.plusSeconds(40 + i), false));
        }
        locations(rider, six).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void onATripEachNewFixIsTrackedOnceAndTheEndOfTheTripIsReported() throws Exception {
        OnShift rider = onShift();
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'ASSIGNED', rider_id = ? WHERE id = ?", rider.id(), trip);
        Instant t = Instant.now().minusSeconds(30).truncatedTo(ChronoUnit.MILLIS);
        List<String> two = List.of(fix(t, false), fix(t.plusSeconds(3), true));
        for (int i = 0; i < 2; i++) {
            locations(rider, two).andExpect(status().isOk()).andExpect(jsonPath("$.activeTrip.tripId").value(trip.toString()))
                .andExpect(jsonPath("$.activeTrip.step").value("TO_KITCHEN")).andExpect(jsonPath("$.activeTrip.version").value(1));
        }
        assertThat(fleet.db.queryForList("SELECT mock FROM fleet_schema.trip_track WHERE trip_id = ? ORDER BY recorded_at", Boolean.class, trip))
            .containsExactly(false, true);

        fleet.db.update("UPDATE fleet_schema.trip SET state = 'CANCELLED', version = 2, finished_at = now() WHERE id = ?", trip);
        locations(rider, List.of()).andExpect(jsonPath("$.activeTrip.step").value("CANCELLED")).andExpect(jsonPath("$.activeTrip.version").value(2));
        locations(rider, List.of(fix(t.plusSeconds(6), false))).andExpect(jsonPath("$.activeTrip.step").value("CANCELLED"));
        locations(rider, List.of()).andExpect(jsonPath("$.activeTrip").doesNotExist());
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_track WHERE trip_id = ?", Integer.class, trip)).isEqualTo(2);
    }

    @Test
    void inZoneSecondsCountOnlyNonMockFixesWhileASlotRuns() throws Exception {
        OnShift rider = onShift();
        Instant t = Instant.now().minusSeconds(600).truncatedTo(ChronoUnit.MILLIS);
        locations(rider, List.of(fix(t, false), fix(t.plusSeconds(10), false))).andExpect(status().isOk());
        assertThat(inZone(rider)).as("no slot").isZero();
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at) "
            + "VALUES (?, ?, 'Madhapur', now() - INTERVAL '1 hour', now() + INTERVAL '2 hours')", UUID.randomUUID(), rider.id());
        locations(rider, List.of(fix(t.plusSeconds(20), false), fix(t.plusSeconds(30), false), fix(t.plusSeconds(40), true),
            fix(t.plusSeconds(50), false), fix(t.plusSeconds(200), false))).andExpect(status().isOk());
        assertThat(inZone(rider)).isEqualTo(80);
    }

    @Test
    void offersCarryTheServersCountdownAndExpiredOnesAreLeftOut() throws Exception {
        OnShift rider = onShift();
        UUID trip = fleet.trip(UUID.randomUUID());
        UUID expired = offer(rider.id(), trip, "now() - INTERVAL '20 seconds'");
        locations(rider, List.of()).andExpect(jsonPath("$.offers.length()").value(0));
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'EXPIRED', decided_at = now() WHERE id = ?", expired);
        UUID live = offer(rider.id(), trip, "now() + INTERVAL '30 seconds'");
        JsonNode offer = json.readTree(locations(rider, List.of()).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8))
            .get("offers").get(0);
        assertThat(offer.get("offerId").asText()).isEqualTo(live.toString());
        assertThat(offer.get("tripId").asText()).isEqualTo(trip.toString());
        assertThat(offer.get("expiresInSec").asInt()).isBetween(25, 29);
        assertThat(offer.get("payPaise").asLong()).isEqualTo(5800);
        assertThat(offer.get("payLines").get(1).get("label").asText()).isEqualTo("₹18 drop distance");
        assertThat(offer.get("kitchenArea").asText()).isEqualTo("Madhapur");
        assertThat(offer.get("customerLocality").asText()).isEqualTo("Kondapur");
        assertThat(offer.get("estMinutes").asInt()).isEqualTo(28);
    }

    @Test
    void aShiftThatEndedWasRevokedOrExpiredOrARiderNoLongerActiveGetsAStopAndTheShiftCloses() throws Exception {
        OnShift ended = onShift();
        mvc.perform(post("/api/v1/rider/shift/end").header("Authorization", "Bearer " + ended.token())).andExpect(status().isNoContent());
        stop(ended, "You're offline. Go online again to get orders.");

        OnShift revoked = onShift();
        fleet.db.update("UPDATE fleet_schema.rider_shift SET credential_revoked_at = now() - INTERVAL '1 minute' WHERE id = ?", revoked.shift());
        stop(revoked, "Your shift was stopped on this phone. Go online again from your approved phone.");
        assertThat(fleet.db.queryForObject("SELECT ended_at = credential_revoked_at FROM fleet_schema.rider_shift WHERE id = ?", Boolean.class,
            revoked.shift())).isTrue();

        OnShift expired = onShift();
        fleet.db.update("UPDATE fleet_schema.rider_shift SET started_at = now() - INTERVAL '13 hours', credential_expires_at = now() - INTERVAL '1 hour' "
            + "WHERE id = ?", expired.shift());
        stop(expired, "Your shift ended after 12 hours. Go online again to keep riding.");
        assertThat(fleet.db.queryForObject("SELECT ended_at = credential_expires_at FROM fleet_schema.rider_shift WHERE id = ?", Boolean.class,
            expired.shift())).isTrue();

        OnShift paused = onShift();
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'SUSPENDED' WHERE id = ?", paused.id());
        stop(paused, "Your account can't take orders right now. Open the app to see why.");
        assertThat(fleet.db.queryForObject("SELECT ended_at IS NOT NULL FROM fleet_schema.rider_shift WHERE id = ?", Boolean.class, paused.shift()))
            .isTrue();
    }

    @Test
    void theJwtUsesTheRidersOpenShift() throws Exception {
        OnShift rider = onShift();
        Instant t = Instant.now().minusSeconds(5);
        mvc.perform(post(LOCATIONS).header("Authorization", "Bearer " + rider.token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fixes\":[" + fix(t, false) + "]}")).andExpect(status().isOk()).andExpect(jsonPath("$.stop").doesNotExist());
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_position_latest WHERE rider_id = ?", Integer.class, rider.id()))
            .isEqualTo(1);
        mvc.perform(post("/api/v1/rider/shift/end").header("Authorization", "Bearer " + rider.token())).andExpect(status().isNoContent());
        mvc.perform(post(LOCATIONS).header("Authorization", "Bearer " + rider.token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fixes\":[]}")).andExpect(jsonPath("$.stop").value(true))
            .andExpect(jsonPath("$.stopReason").value("You're offline. Go online to get orders."));
    }

    /** The budget in docs/riders/BACKEND.md: at most 5 statements per call, on a trip, in a slot, with an offer open. */
    @Test
    void twoHundredCallsStayWithinFiveStatementsEach() throws Exception {
        OnShift rider = onShift();
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'PICKED_UP', rider_id = ? WHERE id = ?", rider.id(), trip);
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at) "
            + "VALUES (?, ?, 'Madhapur', now() - INTERVAL '2 hours', now() + INTERVAL '1 hour')", UUID.randomUUID(), rider.id());
        offer(rider.id(), fleet.trip(UUID.randomUUID()), "now() + INTERVAL '10 minutes'");
        Instant base = Instant.now().minusSeconds(3030).truncatedTo(ChronoUnit.MILLIS);
        int most = 0;
        int total = 0;
        for (int call = 0; call < 200; call++) {
            List<String> fixes = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                fixes.add(fix(base.plusSeconds(3L * (call * 5 + i)), false));
            }
            STATEMENTS.set(0);
            locations(rider, fixes).andExpect(status().isOk()).andExpect(jsonPath("$.offers.length()").value(1));
            most = Math.max(most, STATEMENTS.get());
            total += STATEMENTS.get();
        }
        assertThat(most).isLessThanOrEqualTo(5);
        assertThat(total).isLessThanOrEqualTo(200 * 5);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_track WHERE trip_id = ?", Integer.class, trip)).isEqualTo(1000);
        assertThat(inZone(rider)).as("999 gaps of 3 s").isEqualTo(2997);
    }

    ResultActions locations(OnShift rider, List<String> fixes) throws Exception {
        return mvc.perform(post(LOCATIONS).header(FleetShiftService.SHIFT_CREDENTIAL, rider.credential()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fixes\":[" + String.join(",", fixes) + "]}"));
    }

    void stop(OnShift rider, String reason) throws Exception {
        locations(rider, List.of(fix(Instant.now().minusSeconds(1), false))).andExpect(status().isOk()).andExpect(jsonPath("$.stop").value(true))
            .andExpect(jsonPath("$.stopReason").value(reason)).andExpect(jsonPath("$.offers.length()").value(0));
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_position_latest WHERE rider_id = ?", Integer.class, rider.id()))
            .isZero();
        assertThat(fleet.db.queryForObject("SELECT ended_at IS NOT NULL AND credential_revoked_at IS NOT NULL FROM fleet_schema.rider_shift "
            + "WHERE id = ?", Boolean.class, rider.shift())).isTrue();
    }

    int inZone(OnShift rider) {
        return fleet.db.queryForObject("SELECT in_zone_seconds FROM fleet_schema.rider_shift WHERE id = ?", Integer.class, rider.shift());
    }

    UUID offer(UUID rider, UUID trip, String expiresAt) {
        UUID id = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, pay_paise, pay_lines, rate_card_version, pickup_distance_m, "
            + "drop_distance_m, offered_at, expires_at) VALUES (?, ?, ?, 5800, '[{\"label\":\"₹40 base\",\"amountPaise\":4000},"
            + "{\"label\":\"₹18 drop distance\",\"amountPaise\":1800}]', '2026-10-v1', 900, 4000, now() - INTERVAL '30 seconds', " + expiresAt + ")",
            id, trip, rider);
        return id;
    }

    static String fix(Instant at, boolean mock) {
        return "{\"lat\":17.4401,\"lng\":78.3911,\"accuracyM\":8.5,\"at\":\"" + at + "\",\"mock\":" + mock + "}";
    }

    /** An ACTIVE rider with the RIDER role and an open shift (started two hours ago) whose credential is known. */
    OnShift onShift() {
        UUID identity = UUID.randomUUID();
        UUID rider = UUID.randomUUID();
        String phone = FleetRiderApiDatabaseTest.phone();
        fleet.db.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, status, created_by) VALUES (?, ?, 'Ravi Kumar', ?, 'ACTIVE', ?)",
            rider, identity, phone, UUID.randomUUID());
        UUID shift = UUID.randomUUID();
        String credential = FleetShiftService.newCredential();
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at) "
            + "VALUES (?, ?, ?, now() + INTERVAL '10 hours', now() - INTERVAL '2 hours')", shift, rider, FleetShiftService.hash(credential));
        when(verifier.verify(identity.toString())).thenReturn(new CravesPrincipal(identity, phone, Set.of("CUSTOMER", "RIDER")));
        return new OnShift(rider, shift, credential, identity.toString());
    }

    record OnShift(UUID id, UUID shift, String credential, String token) {
    }
}
