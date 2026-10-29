package in.craves.integration.fleet.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.integration.fleet.admin.FleetPilotHealth.NamedQuery;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** How the Pilot health page reads fleet/pilot_health.sql and turns rows into JSON values. */
class FleetPilotHealthTest {
    @Test
    void eachNamedQueryKeepsItsCommentLinesAsItsDescriptionAndEndsWithoutTrailingComments() {
        List<NamedQuery> queries = FleetPilotHealth.parse(String.join("\r\n",
            "-- File header, skipped.",
            "",
            "-- name: first_one",
            "-- What it shows,",
            "-- in two lines.",
            "SELECT 1",
            "-- inside the query",
            "FROM fleet_schema.trip;",
            "",
            "-- A note before the next query, which must not reach the driver.",
            "",
            "-- name: second_one",
            "SELECT 2;"));
        assertThat(queries).extracting(NamedQuery::name).containsExactly("first_one", "second_one");
        assertThat(queries.get(0).description()).isEqualTo("What it shows, in two lines.");
        assertThat(queries.get(0).sql()).isEqualTo("-- What it shows,\n-- in two lines.\nSELECT 1\n-- inside the query\nFROM fleet_schema.trip");
        assertThat(queries.get(1).description()).isEmpty();
        assertThat(queries.get(1).sql()).isEqualTo("SELECT 2");
    }

    @Test
    void theFileInTheBuildParsesWithUniqueNames() {
        List<NamedQuery> queries = FleetPilotHealth.parse(FleetPilotHealth.read());
        assertThat(queries).hasSizeGreaterThanOrEqualTo(14);
        assertThat(queries).allSatisfy(query -> {
            assertThat(query.description()).as(query.name()).isNotBlank();
            assertThat(query.sql()).as(query.name()).doesNotEndWith(";").containsIgnoringCase("SELECT");
        });
    }

    @Test
    void badOrRepeatedNamesAndAnEmptyFileAreRefused() {
        assertThatThrownBy(() -> FleetPilotHealth.parse("-- name: Bad Name\nSELECT 1;")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> FleetPilotHealth.parse("-- name: twice\nSELECT 1;\n-- name: twice\nSELECT 2;"))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> FleetPilotHealth.parse("-- no queries here")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void valuesBecomeTextNumbersAndBooleans() {
        UUID id = UUID.randomUUID();
        assertThat(FleetPilotHealth.value(Timestamp.from(Instant.parse("2026-10-20T06:00:00Z")))).isEqualTo("2026-10-20T06:00:00Z");
        assertThat(FleetPilotHealth.value(java.sql.Date.valueOf(LocalDate.of(2026, 10, 20)))).isEqualTo("2026-10-20");
        assertThat(FleetPilotHealth.value(id)).isEqualTo(id.toString());
        assertThat(FleetPilotHealth.value(new BigDecimal("4.2"))).isEqualTo(new BigDecimal("4.2"));
        assertThat(FleetPilotHealth.value(7L)).isEqualTo(7L);
        assertThat(FleetPilotHealth.value((short) 3)).isEqualTo(3);
        assertThat(FleetPilotHealth.value(Double.NaN)).isNull();
        assertThat(FleetPilotHealth.value(true)).isEqualTo(true);
        assertThat(FleetPilotHealth.value(null)).isNull();
        assertThat(FleetPilotHealth.value("x".repeat(501))).isEqualTo("x".repeat(500));
        assertThat(FleetPilotHealth.value("short")).isEqualTo("short");
    }
}
