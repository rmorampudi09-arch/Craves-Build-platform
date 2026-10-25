package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.FleetConfiguration;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.fleet.FleetStorage;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Riders who joined or exited on one IST date, for the Social Security Code portal (PLAN F4c). JOINED is a move to
 * ACTIVE from PENDING (or from DEACTIVATED, a rejoin); EXITED is a deactivation. Built from rider_status_event, so
 * it always matches the status history. A daily job writes yesterday's file to the private documents container.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class RiderJoinsExitsExport {
    private static final Logger LOGGER = LoggerFactory.getLogger(RiderJoinsExitsExport.class);
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final JdbcTemplate jdbc;
    private final FleetStorage storage;

    public RiderJoinsExitsExport(JdbcTemplate jdbc, FleetStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    public String csv(LocalDate date) {
        List<List<String>> rows = new ArrayList<>();
        rows.add(List.of("date", "riderId", "name", "phoneMasked", "event", "reason"));
        rows.addAll(jdbc.query("""
            SELECT r.id, r.name, r.phone, CASE WHEN e.kind = 'DEACTIVATE' THEN 'EXITED' ELSE 'JOINED' END AS event, e.reason
            FROM fleet_schema.rider_status_event e JOIN fleet_schema.rider r ON r.id = e.rider_id
            WHERE ((e.kind = 'RESTORE' AND e.status_before IN ('PENDING', 'DEACTIVATED')) OR e.kind = 'DEACTIVATE')
              AND e.created_at >= ? AND e.created_at < ?
            ORDER BY e.created_at, e.id""",
            (row, n) -> List.of(date.toString(), row.getString("id"), row.getString("name"), FleetRules.maskPhone(row.getString("phone")),
                row.getString("event"), row.getString("reason")),
            Timestamp.from(date.atStartOfDay(IST).toInstant()), Timestamp.from(date.plusDays(1).atStartOfDay(IST).toInstant())));
        return csv(rows);
    }

    /** Yesterday's file, written shortly after midnight IST. Fleet pool only, and only while CRAVES_FLEET_ENABLED. */
    @Scheduled(cron = "0 20 0 * * *", zone = "Asia/Kolkata", scheduler = FleetConfiguration.FLEET_SCHEDULER)
    public void writeYesterday() {
        LocalDate yesterday = LocalDate.now(IST).minusDays(1);
        try {
            write(yesterday);
        } catch (RuntimeException exception) {
            LOGGER.error("CRAVES_ALERT alert=RIDER_JOINS_EXITS_EXPORT_FAILED date={} reason={}", yesterday, exception.toString());
        }
    }

    void write(LocalDate date) {
        // Rewriting the same day is harmless, so a second replica or a rerun may overwrite it.
        storage.upload("riders/exports/rider-joins-exits-" + date + ".csv", csv(date).getBytes(StandardCharsets.UTF_8), "text/csv", true);
    }

    /** RFC 4180 quoting; a cell that a spreadsheet would read as a formula starts with an apostrophe instead. */
    public static String csv(List<List<String>> rows) {
        StringBuilder out = new StringBuilder();
        for (List<String> row : rows) {
            for (int i = 0; i < row.size(); i++) {
                String cell = row.get(i) == null ? "" : row.get(i);
                if (!cell.isEmpty() && "=+-@\t\r".indexOf(cell.charAt(0)) >= 0) {
                    cell = "'" + cell;
                }
                if (cell.contains(",") || cell.contains("\"") || cell.contains("\n") || cell.contains("\r")) {
                    cell = "\"" + cell.replace("\"", "\"\"") + "\"";
                }
                out.append(i == 0 ? "" : ",").append(cell);
            }
            out.append("\r\n");
        }
        return out.toString();
    }
}
