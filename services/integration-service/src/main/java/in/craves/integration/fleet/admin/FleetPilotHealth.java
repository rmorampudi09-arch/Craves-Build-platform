package in.craves.integration.fleet.admin;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSetMetaData;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The pilot-health queries (resource fleet/pilot_health.sql, docs/riders/PILOT-HEALTH.md) for the ops console's Pilot
 * health page. Each named query runs in its own read-only transaction with a time limit, and its rows come back as plain
 * JSON values. A query that fails or runs out of time is reported with an error and the others still run. The file is
 * read on first use, so a broken file can't stop the service from starting (FleetPilotHealthDatabaseTest checks it).
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetPilotHealth {
    static final String RESOURCE = "fleet/pilot_health.sql";
    static final int MAX_ROWS = 200;
    static final int MAX_TEXT = 500;
    static final String TIME_LIMIT = "15s";
    private static final String NAME_LINE = "-- name: ";
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetPilotHealth.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate readOnly;
    private volatile List<NamedQuery> queries;

    public FleetPilotHealth(JdbcTemplate jdbc, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.readOnly = new TransactionTemplate(transactions);
        this.readOnly.setReadOnly(true);
    }

    /** description: the comment lines right after the name line, joined. */
    public record NamedQuery(String name, String description, String sql) {
    }

    /** At most MAX_ROWS rows (truncated when there were more); error instead of rows when the query failed. */
    public record Result(String name, String description, List<String> columns, List<List<Object>> rows, boolean truncated,
                         String error) {
    }

    public record Report(Instant generatedAt, List<Result> results) {
    }

    public Report report() {
        List<Result> results = new ArrayList<>();
        for (NamedQuery query : queries()) {
            results.add(run(query));
        }
        return new Report(Instant.now(), results);
    }

    private Result run(NamedQuery query) {
        ResultSetExtractor<Result> extract = rows -> {
            ResultSetMetaData meta = rows.getMetaData();
            List<String> columns = new ArrayList<>();
            for (int i = 1; i <= meta.getColumnCount(); i++) {
                columns.add(meta.getColumnLabel(i));
            }
            List<List<Object>> values = new ArrayList<>();
            boolean truncated = false;
            while (rows.next()) {
                if (values.size() == MAX_ROWS) {
                    truncated = true;
                    break;
                }
                List<Object> row = new ArrayList<>(columns.size());
                for (int i = 1; i <= columns.size(); i++) {
                    row.add(value(rows.getObject(i)));
                }
                values.add(row);
            }
            return new Result(query.name(), query.description(), columns, values, truncated, null);
        };
        try {
            return readOnly.execute(status -> {
                jdbc.execute("SET TRANSACTION READ ONLY");
                jdbc.execute("SET LOCAL statement_timeout = '" + TIME_LIMIT + "'");
                return jdbc.query(query.sql(), extract);
            });
        } catch (DataAccessException exception) {
            LOGGER.warn("FLEET_PILOT_HEALTH_QUERY_FAILED query={} reason={}", query.name(),
                String.valueOf(exception.getMostSpecificCause().getMessage()).replaceAll("\\s+", " "));
            return new Result(query.name(), query.description(), List.of(), List.of(), false,
                "This query failed or took longer than " + TIME_LIMIT + ". Try again later; if it keeps failing, run it by hand (PILOT-HEALTH.md).");
        }
    }

    /**
     * A JSON-safe value: text (at most MAX_TEXT characters, as the console accepts), a number, a boolean or null; times as
     * ISO-8601 instants, days as YYYY-MM-DD.
     */
    static Object value(Object value) {
        if (value == null || value instanceof Boolean || value instanceof Integer || value instanceof Long || value instanceof BigDecimal) {
            return value;
        }
        if (value instanceof Double number) {
            return number.isNaN() || number.isInfinite() ? null : number;
        }
        if (value instanceof Float number) {
            return number.isNaN() || number.isInfinite() ? null : number.doubleValue();
        }
        if (value instanceof Short number) {
            return number.intValue();
        }
        if (value instanceof Timestamp time) {
            return time.toInstant().toString();
        }
        if (value instanceof java.sql.Date day) {
            return day.toLocalDate().toString();
        }
        String text = value.toString();
        return text.length() > MAX_TEXT ? text.substring(0, MAX_TEXT) : text;
    }

    List<NamedQuery> queries() {
        List<NamedQuery> loaded = queries;
        if (loaded == null) {
            loaded = parse(read());
            queries = loaded;
        }
        return loaded;
    }

    static String read() {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException(RESOURCE + " is missing from the build", exception);
        }
    }

    /**
     * The file's queries in order. Each "-- name:" line starts one; the comment lines right after it are its description;
     * the header above the first is skipped. Trailing comment lines and the final semicolon are cut, so the driver sees
     * one statement.
     */
    static List<NamedQuery> parse(String file) {
        Map<String, NamedQuery> found = new LinkedHashMap<>();
        String name = null;
        boolean describing = false;
        StringBuilder description = new StringBuilder();
        List<String> sql = new ArrayList<>();
        for (String raw : file.split("\n", -1)) {
            String line = raw.endsWith("\r") ? raw.substring(0, raw.length() - 1) : raw;
            if (line.startsWith(NAME_LINE)) {
                add(found, name, description, sql);
                name = line.substring(NAME_LINE.length()).strip();
                describing = true;
                description.setLength(0);
                sql.clear();
            } else if (name != null) {
                if (describing && line.startsWith("--")) {
                    description.append(description.length() == 0 ? "" : " ").append(line.substring(2).strip());
                } else {
                    describing = false;
                }
                sql.add(line);
            }
        }
        add(found, name, description, sql);
        if (found.isEmpty()) {
            throw new IllegalStateException("No named queries in " + RESOURCE);
        }
        return List.copyOf(found.values());
    }

    private static void add(Map<String, NamedQuery> found, String name, StringBuilder description, List<String> sql) {
        if (name == null) {
            return;
        }
        if (!name.matches("[a-z0-9_]{1,60}") || found.containsKey(name)) {
            throw new IllegalStateException("Bad or repeated query name in " + RESOURCE + ": " + name);
        }
        int end = sql.size();
        while (end > 0 && (sql.get(end - 1).isBlank() || sql.get(end - 1).stripLeading().startsWith("--"))) {
            end--;
        }
        String text = String.join("\n", sql.subList(0, end)).strip();
        found.put(name, new NamedQuery(name, description.toString(), text.endsWith(";") ? text.substring(0, text.length() - 1) : text));
    }
}
