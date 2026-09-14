package in.craves.adminexplorer;

import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Semaphore;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Reads only the owning domain; audit insert and all results share a repeatable-read transaction. */
@Service
public class ExplorerEngine {
    public static final String DATASET = ExplorerDomain.DATASET;
    static final String SOURCE = ExplorerDomain.SOURCE;
    private static final String AUDIT = ExplorerDomain.AUDIT;
    private final JdbcTemplate jdbc;
    private final ExplorerRateLimiter limiter;
    private final TransactionTemplate transaction;
    private final Semaphore slots = new Semaphore(2);
    public ExplorerEngine(DataSource source) {
        jdbc = new JdbcTemplate(source);
        limiter = new ExplorerRateLimiter(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        transaction.setTimeout(8);
    }
    public record Count(String key, long count) {}
    public record Bucket(String fromDate, String toDate, long count) {}
    public record Row(UUID id, UUID identityId, String label, String status, Instant createdAt, Instant updatedAt,
            String phone, String email, String city, List<String> roles, String orderSource, String amount,
            String currency, UUID customerId, UUID chefId, UUID kitchenId, UUID checkoutId) {}
    public record Result(String dataset, UUID correlationId, Instant generatedAt, Instant boundary,
            long total, long populationTotal, List<Count> statuses, List<Bucket> trend, String bucketUnit,
            List<Row> rows, String nextCursor, int pageSize, String sort, String mode) {}

    public Result read(UUID actor, ExplorerQuery q) {
        if (!slots.tryAcquire()) throw new Busy();
        try { limiter.admit(); return Objects.requireNonNull(transaction.execute(tx -> execute(actor, q))); }
        finally { slots.release(); }
    }
    private Result execute(UUID actor, ExplorerQuery q) {
        // Bound scans without hiding failures as empty datasets. No automatic polling or new cache.
        jdbc.execute("SET LOCAL statement_timeout = '5000ms'");
        UUID correlation = UUID.randomUUID();
        Instant generated = Instant.now();
        Sql base = where(q, false);
        List<Count> statuses = jdbc.query("SELECT v.status, count(*) AS n FROM (" + SOURCE + ") v " + base.text + " GROUP BY v.status ORDER BY v.status",
            (rs,n) -> new Count(rs.getString("status"), safeCount(rs.getLong("n"))), base.args.toArray());
        if (statuses.size() > 64) throw new IllegalStateException("Unexpected status cardinality");
        long population = statuses.stream().mapToLong(Count::count).reduce(0, Math::addExact);
        long total = statuses.stream().filter(c -> q.status().isEmpty() || q.status().equals(c.key())).mapToLong(Count::count).reduce(0, Math::addExact);
        safeCount(population); safeCount(total);
        Sql selected = where(q, true);
        List<Instant> starts = jdbc.query("SELECT min(v.created_at) AS first FROM (" + SOURCE + ") v " + selected.text,
            (rs,n) -> rs.getTimestamp("first") == null ? null : rs.getTimestamp("first").toInstant(), selected.args.toArray());
        Instant first = starts.isEmpty() ? null : starts.getFirst();
        Instant chartStart = q.start() == null ? first : q.start();
        long days = chartStart == null ? 0 : ChronoUnit.DAYS.between(chartStart, q.end());
        String unit = days <= 62 ? "day" : days <= 730 ? "month" : "year";
        List<Bucket> trend = first == null ? List.of() : jdbc.query(
            "SELECT date_trunc('" + unit + "', v.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, count(*) AS n FROM (" + SOURCE + ") v " + selected.text +
            " GROUP BY d ORDER BY d LIMIT 161", (rs,n) -> {
                LocalDate d = rs.getDate("d").toLocalDate();
                LocalDate end = switch(unit) { case "day" -> d; case "month" -> d.plusMonths(1).minusDays(1); default -> d.plusYears(1).minusDays(1); };
                LocalDate actualStart = chartStart.atZone(ExplorerQuery.ZONE).toLocalDate();
                LocalDate start = d.isBefore(actualStart) ? actualStart : d;
                LocalDate upper = q.end().minusNanos(1).atZone(ExplorerQuery.ZONE).toLocalDate();
                if (end.isAfter(upper)) end = upper;
                return new Bucket(start.toString(), end.toString(), safeCount(rs.getLong("n")));
            }, selected.args.toArray());
        trend = dense(trend, chartStart, q.end(), unit);
        if (trend.size() > 160 || trend.stream().mapToLong(Bucket::count).sum() != total) throw new IllegalStateException("Inconsistent aggregate");
        List<Row> rows = List.of(); String next = null;
        if (q.records()) {
            Sql page = where(q, true);
            if (q.afterTime() != null) {
                page.text += " AND (v.created_at, v.id) " + (q.ascending() ? ">" : "<") + " (?, ?)";
                page.args.add(Timestamp.from(q.afterTime())); page.args.add(q.afterId());
            }
            page.args.add(q.size() + 1);
            String order = q.ascending() ? " ASC" : " DESC";
            List<Row> found = jdbc.query("SELECT v.* FROM (" + SOURCE + ") v " + page.text + " ORDER BY v.created_at" + order + ", v.id" + order + " LIMIT ?", this::row, page.args.toArray());
            rows = List.copyOf(found.subList(0, Math.min(q.size(), found.size())));
            if (found.size() > q.size()) { Row last = rows.getLast(); next = q.next(last.createdAt(), last.id()); }
        }
        jdbc.update("INSERT INTO " + AUDIT + " (id, actor_id, correlation_id, operation, filter_sha256, record_count, reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
            UUID.randomUUID(), actor, correlation, q.records() ? "RECORDS" : "SUMMARY", q.fingerprint(), rows.size(), q.reason());
        return new Result(DATASET, correlation, generated, q.boundary(), total, population, statuses, trend, unit, rows, next, q.size(), q.ascending() ? "oldest" : "newest", q.records() ? "records" : "summary");
    }
    private static List<Bucket> dense(List<Bucket> points, Instant from, Instant until, String unit) {
        if (from == null || !from.isBefore(until)) return List.of();
        LocalDate start=from.atZone(ExplorerQuery.ZONE).toLocalDate(), end=until.minusNanos(1).atZone(ExplorerQuery.ZONE).toLocalDate();
        LocalDate d=switch(unit) { case "month" -> start.withDayOfMonth(1); case "year" -> start.withDayOfYear(1); default -> start; };
        Map<String,Long> counts=new HashMap<>();for(Bucket p:points)counts.put(p.fromDate(),p.count());
        List<Bucket> result=new ArrayList<>();
        while(!d.isAfter(end)) {
            if(result.size()>=160)throw new IllegalStateException("Chart window too large");
            LocalDate next=switch(unit){case "day" -> d.plusDays(1);case "month" -> d.plusMonths(1);default -> d.plusYears(1);};
            LocalDate lower=d.isBefore(start)?start:d, upper=next.minusDays(1).isAfter(end)?end:next.minusDays(1);
            result.add(new Bucket(lower.toString(),upper.toString(),counts.getOrDefault(lower.toString(),0L)));d=next;
        }
        return List.copyOf(result);
    }
    private static final class Sql {
        String text = " WHERE v.created_at < ?";
        final List<Object> args = new ArrayList<>();
    }
    private static Sql where(ExplorerQuery q, boolean withStatus) {
        Sql s = new Sql(); s.args.add(Timestamp.from(q.end()));
        if (q.start() != null) { s.text += " AND v.created_at >= ?"; s.args.add(Timestamp.from(q.start())); }
        if (withStatus && !q.status().isEmpty()) { s.text += " AND v.status=?"; s.args.add(q.status()); }
        if (!q.search().isEmpty()) {
            s.text += " AND " + ExplorerDomain.SEARCH;
            s.args.addAll(ExplorerDomain.searchArgs(q.search()));
        }
        if (!q.facet().isEmpty()) { s.text += " AND " + ExplorerDomain.FACET; s.args.add(q.facet()); }
        return s;
    }
    private Row row(ResultSet r, int n) throws SQLException {
        String roles = r.getString("roles");
        return new Row(r.getObject("id",UUID.class), r.getObject("identity_id",UUID.class), r.getString("label"), r.getString("status"),
            r.getTimestamp("created_at").toInstant(), r.getTimestamp("updated_at").toInstant(), maskPhone(r.getString("phone")), maskEmail(r.getString("email")),
            r.getString("city"), roles.isEmpty() ? List.of() : List.of(roles.split(",")), r.getString("order_source"), r.getString("amount"),
            r.getString("currency"), r.getObject("customer_id",UUID.class), r.getObject("chef_id",UUID.class), r.getObject("kitchen_id",UUID.class), r.getObject("checkout_id",UUID.class));
    }
    public static String maskPhone(String value) { return value == null ? null : "•••• " + (value.length() <= 4 ? "" : value.substring(value.length()-4)); }
    public static String maskEmail(String value) { return value == null ? null : value.isEmpty() ? "•••" : value.substring(0,1) + "•••@•••"; }
    public static long safeCount(long value) { if (value < 0 || value > 9007199254740991L) throw new IllegalStateException("Count exceeds browser precision"); return value; }
    public static class Busy extends RuntimeException { private static final long serialVersionUID = 1L; }
}
