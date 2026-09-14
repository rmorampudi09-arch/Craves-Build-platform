package in.craves.adminexplorer;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.Objects;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** A durable, global dataset budget, independent of caller IP and service restarts. */
public final class ExplorerRateLimiter {
    static final int LIMIT = 20;
    static final int LOCK_NAMESPACE = 1129465157;
    static final int LOCK_DATASET = switch (ExplorerDomain.DATASET) {
        case "users" -> 1; case "chefs" -> 2; case "orders" -> 3;
        default -> throw new IllegalStateException("Unknown explorer dataset");
    };
    static final String TABLE = ExplorerDomain.DATASET.equals("orders")
        ? "order_schema.admin_explorer_admission" : "public.admin_explorer_admission";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public ExplorerRateLimiter(DataSource source) {
        jdbc = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setTimeout(2);
    }

    public void admit() {
        transaction.executeWithoutResult(tx -> {
            jdbc.execute("SET LOCAL statement_timeout = '1000ms'");
            jdbc.execute("SET LOCAL lock_timeout = '250ms'");
            if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(?, ?)",
                    Boolean.class, LOCK_NAMESPACE, LOCK_DATASET))) throw new Limited(1);
            // Read database time after acquiring the lock. Each statement sees prior committed admissions.
            var now = Objects.requireNonNull(jdbc.queryForObject("SELECT clock_timestamp()", Timestamp.class)).toInstant();
            jdbc.update("DELETE FROM " + TABLE + " WHERE admitted_at <= ?", Timestamp.from(now.minusSeconds(60)));
            var admissions = jdbc.query("SELECT admitted_at FROM " + TABLE + " ORDER BY admitted_at LIMIT 20",
                (rs, row) -> rs.getTimestamp(1).toInstant());
            if (admissions.size() >= LIMIT) {
                long millis = Duration.between(now, admissions.getFirst().plusSeconds(60)).toMillis();
                throw new Limited((int) Math.max(1, Math.min(60, (millis + 999) / 1000)));
            }
            jdbc.update("INSERT INTO " + TABLE + " (id, admitted_at) VALUES (?, ?)", UUID.randomUUID(), Timestamp.from(now));
        });
        // Commit before the report transaction: failed reports also consume their admission.
    }

    public static final class Limited extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final int retryAfter;
        public Limited(int retryAfter) { this.retryAfter = Math.max(1, Math.min(60, retryAfter)); }
        public int retryAfter() { return retryAfter; }
    }
}
