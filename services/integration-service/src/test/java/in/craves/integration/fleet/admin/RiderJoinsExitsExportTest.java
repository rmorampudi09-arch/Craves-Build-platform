package in.craves.integration.fleet.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetStorage;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

class RiderJoinsExitsExportTest {
    @Test
    void cellsAreQuotedAndFormulasNeutralised() {
        assertThat(RiderJoinsExitsExport.csv(List.of(List.of("date", "name"), List.of("2026-10-20", "=Sita, \"Devi\""),
            List.of("2026-10-20", "-1 day"))))
            .isEqualTo("date,name\r\n2026-10-20,\"'=Sita, \"\"Devi\"\"\"\r\n2026-10-20,'-1 day\r\n");
    }

    /** PLAN F4c: the export matches the rider status events for a test day (IST). */
    @Test
    @EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
    void theExportMatchesTheStatusEventsOfOneIstDayAndTheJobWritesIt() {
        FleetDatabase fleet = new FleetDatabase();
        UUID ravi = fleet.rider("Ravi Kumar", "+919876543210");
        UUID sita = fleet.rider("Sita Devi", "+919876543211");
        event(fleet, ravi, "RESTORE", "PENDING", "ACTIVE", "Documents checked", "2026-10-19 23:59:00+05:30");
        event(fleet, sita, "RESTORE", "PENDING", "ACTIVE", "Documents checked", "2026-10-20 00:00:00+05:30");
        event(fleet, ravi, "RESTORE", "SUSPENDED", "ACTIVE", "Pause cleared", "2026-10-20 12:00:00+05:30");
        event(fleet, ravi, "DEACTIVATE", "SUSPENDED", "DEACTIVATED", "Asked to leave", "2026-10-20 18:00:00+05:30");
        event(fleet, sita, "DEACTIVATE", "SUSPENDED", "DEACTIVATED", "Next day", "2026-10-21 00:00:00+05:30");
        FleetStorage storage = mock(FleetStorage.class);
        RiderJoinsExitsExport export = new RiderJoinsExitsExport(fleet.db, storage);

        String csv = export.csv(LocalDate.parse("2026-10-20"));
        assertThat(csv).isEqualTo("date,riderId,name,phoneMasked,event,reason\r\n"
            + "2026-10-20," + sita + ",Sita Devi,+91 98xxxxx211,JOINED,Documents checked\r\n"
            + "2026-10-20," + ravi + ",Ravi Kumar,+91 98xxxxx210,EXITED,Asked to leave\r\n");

        export.write(LocalDate.parse("2026-10-20"));
        verify(storage).upload(eq("riders/exports/rider-joins-exits-2026-10-20.csv"), eq(csv.getBytes(StandardCharsets.UTF_8)),
            eq("text/csv"), eq(true));
    }

    private static void event(FleetDatabase fleet, UUID rider, String kind, String before, String after, String reason, String at) {
        fleet.db.update("INSERT INTO fleet_schema.rider_status_event (id, rider_id, kind, reason, evidence_summary, appeal_phone, "
            + "approver_id, approver_name, status_before, status_after, created_at) VALUES (?, ?, ?, ?, 'Checked in person', "
            + "'+914000000000', ?, 'Admin', ?, ?, ?::timestamptz)", UUID.randomUUID(), rider, kind, reason, UUID.randomUUID(), before, after, at);
    }
}
