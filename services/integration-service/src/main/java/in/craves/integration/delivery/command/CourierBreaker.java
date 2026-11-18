package in.craves.integration.delivery.command;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import jakarta.annotation.PreDestroy;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientResponseException;

/**
 * One circuit breaker per courier, shared by every replica: a row in delivery_schema.provider_breaker (V195). It opens
 * after {@code booking-failures} failed bookings or {@code quote-failures} failed quotes in a row, counted across
 * replicas. While open no replica quotes or books that courier for a new order. After {@code half-open-seconds} the one
 * replica whose update claims probe_at lets one order through: a success closes the breaker, a failure keeps it open.
 *
 * <p>Every change is one statement on the row, on the database's clock, outside any transaction of the caller. Nothing
 * here throws: when the row cannot be read the courier is called as if there were no breaker, and a result that cannot
 * be written is dropped. Off unless CRAVES_COURIER_BREAKER_ENABLED=true; the router uses it only with the booking
 * journal on.
 */
@Component
@ConditionalOnProperty(prefix = "craves.courier-breaker", name = "enabled", havingValue = "true")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
public class CourierBreaker {
    private static final Logger log = LoggerFactory.getLogger(CourierBreaker.class);
    private static final String TABLE = "delivery_schema.provider_breaker";
    /** How long a pass waits for the row, connection included, before it calls the courier without it. */
    static final long ADMIT_WAIT_MILLIS = 1000;

    private final JdbcTemplate jdbc;
    private final int bookingFailures;
    private final int quoteFailures;
    private final int halfOpenSeconds;
    // The read runs here so that a pass waits ADMIT_WAIT_MILLIS at most, even for a connection (the pool's own wait is
    // far longer). No second pool: at most 8 reads wait for a connection at once, and a 9th is not started.
    private final ExecutorService reads = new ThreadPoolExecutor(0, 8, 30, TimeUnit.SECONDS, new SynchronousQueue<>(), task -> {
        Thread thread = new Thread(task, "courier-breaker-read");
        thread.setDaemon(true);
        return thread;
    });

    public CourierBreaker(JdbcTemplate jdbc,
                          @Value("${craves.courier-breaker.booking-failures:3}") int bookingFailures,
                          @Value("${craves.courier-breaker.quote-failures:5}") int quoteFailures,
                          @Value("${craves.courier-breaker.half-open-seconds:30}") int halfOpenSeconds) {
        if (bookingFailures < 1 || quoteFailures < 1 || halfOpenSeconds < 1) {
            throw new IllegalArgumentException("craves.courier-breaker needs booking-failures, quote-failures and half-open-seconds >= 1");
        }
        // Its own template: a slow database costs a pass at most this long per statement.
        this.jdbc = new JdbcTemplate(jdbc.getDataSource());
        this.jdbc.setQueryTimeout(2);
        this.bookingFailures = bookingFailures;
        this.quoteFailures = quoteFailures;
        this.halfOpenSeconds = halfOpenSeconds;
    }

    @PreDestroy
    void stop() {
        reads.shutdownNow();
    }

    /**
     * One pass's leave to call a courier. refused: the breaker is open, do not call. dirty: the row held failures when it
     * was read, so a success must be written. probe: this pass holds the half-open probe.
     */
    public record Pass(String providerId, boolean refused, boolean dirty, boolean probe) {}

    private record Row(boolean dirty, boolean open, boolean probeDue) {}

    /** Read once per courier per pass, just before its quote. A pass that may book takes the half-open probe when it is due. */
    public Pass admit(String providerId) {
        return admit(providerId, true);
    }

    /** For a quote that books nothing: an open breaker refuses it, and the probe is left for a pass that can book. */
    public Pass read(String providerId) {
        return admit(providerId, false);
    }

    private Pass admit(String providerId, boolean mayProbe) {
        Future<Pass> read = null;
        try {
            read = reads.submit(() -> readRow(providerId, mayProbe));
            return read.get(ADMIT_WAIT_MILLIS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException | TimeoutException | RejectedExecutionException unreadable) {
            log.warn("Courier breaker was not read in time provider={}; the courier is called", providerId, unreadable);
        }
        if (read != null) {
            read.cancel(true);
        }
        return new Pass(providerId, false, false, false);
    }

    private Pass readRow(String providerId, boolean mayProbe) {
        try {
            List<Row> rows = jdbc.query("SELECT booking_failures > 0 OR quote_failures > 0 AS dirty, opened_at IS NOT NULL AS open, "
                + "opened_at < now() - ? * INTERVAL '1 second' AND (probe_at IS NULL OR probe_at < now() - ? * INTERVAL '1 second') AS probe_due "
                + "FROM " + TABLE + " WHERE provider_id = ?",
                (rs, row) -> new Row(rs.getBoolean("dirty"), rs.getBoolean("open"), rs.getBoolean("probe_due")),
                halfOpenSeconds, halfOpenSeconds, providerId);
            if (rows.isEmpty() || !rows.get(0).open()) {
                return new Pass(providerId, false, !rows.isEmpty() && rows.get(0).dirty(), false);
            }
            // Only the replica whose update changes the row probes.
            boolean probe = mayProbe && rows.get(0).probeDue() && jdbc.update("UPDATE " + TABLE + " SET probe_at = now(), updated_at = now() "
                + "WHERE provider_id = ? AND opened_at < now() - ? * INTERVAL '1 second' "
                + "AND (probe_at IS NULL OR probe_at < now() - ? * INTERVAL '1 second')", providerId, halfOpenSeconds, halfOpenSeconds) == 1;
            return new Pass(providerId, !probe, true, probe);
        } catch (RuntimeException unreadable) {
            log.warn("Courier breaker could not be read provider={}; the courier is called", providerId, unreadable);
            return new Pass(providerId, false, false, false);
        }
    }

    /**
     * The pass ended without a verdict on the courier (it was quoted, and another courier or nobody was booked): the probe
     * goes back, so the next pass that can book takes it at once instead of half-open-seconds later.
     */
    public void release(Pass pass) {
        if (!pass.probe()) {
            return;
        }
        try {
            jdbc.update("UPDATE " + TABLE + " SET probe_at = NULL, updated_at = now() WHERE provider_id = ? AND opened_at IS NOT NULL",
                pass.providerId());
        } catch (RuntimeException unwritable) {
            log.warn("Courier breaker probe could not be released provider={}", pass.providerId(), unwritable);
        }
    }

    /**
     * healthy: TRUE the courier answered, FALSE it is unwell, null the call says nothing about its health. A waiting order
     * is quoted again on every pass, so one order's failed quotes count once towards the streak: it takes different orders.
     */
    public void quoted(Pass pass, Boolean healthy, UUID chefSubOrderId) {
        if (Boolean.FALSE.equals(healthy)) {
            failed(pass.providerId(), false, chefSubOrderId);
        } else if (healthy != null && pass.dirty()) {
            // A breaker that failed bookings opened is not closed by a quote.
            succeeded(pass, "quote_failures = 0, quote_failed_order = NULL, opened_at = CASE WHEN booking_failures < " + bookingFailures
                + " THEN NULL ELSE opened_at END", "quote_failures > 0");
        }
    }

    public void booked(Pass pass, Boolean healthy) {
        if (Boolean.FALSE.equals(healthy)) {
            failed(pass.providerId(), true, null);
        } else if (healthy != null && pass.dirty()) {
            succeeded(pass, "booking_failures = 0, quote_failures = 0, quote_failed_order = NULL, opened_at = NULL, probe_at = NULL",
                "booking_failures > 0 OR quote_failures > 0");
        }
    }

    /**
     * What a failed booking says about the courier: FALSE unwell, null nothing (the order was refused for its own reasons).
     * An HTTP answer decides by its status; a booking whose answer never came or could not be used counts as unwell.
     */
    static Boolean bookingHealth(RuntimeException error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof RestClientResponseException) {
                return ProviderGuard.health(cause);
            }
        }
        return error instanceof ProviderCreateUncertainException ? Boolean.FALSE : ProviderGuard.health(error);
    }

    private void succeeded(Pass pass, String set, String countsAboveZero) {
        try {
            List<Boolean> closed = jdbc.queryForList("UPDATE " + TABLE + " SET " + set + ", updated_at = now() WHERE provider_id = ? AND ("
                + countsAboveZero + " OR opened_at IS NOT NULL) RETURNING opened_at IS NULL", Boolean.class, pass.providerId());
            if (pass.probe() && closed.contains(Boolean.TRUE)) {
                log.warn("Courier breaker closed provider={}", pass.providerId());
            }
        } catch (RuntimeException unwritable) {
            log.warn("Courier breaker success could not be written provider={}", pass.providerId(), unwritable);
        }
    }

    /** order: the order whose quote failed; null for a booking (the journal already limits those per order). */
    private void failed(String providerId, boolean booking, UUID order) {
        // A quote's result is written on its executor thread, which the fan-out deadline may have interrupted.
        boolean interrupted = Thread.interrupted();
        try {
            int bookings = booking ? 1 : 0;
            int quotes = 1 - bookings;
            // The order whose quote was counted last adds nothing by failing again.
            String quoteStep = "CASE WHEN b.quote_failed_order = EXCLUDED.quote_failed_order THEN 0 ELSE EXCLUDED.quote_failures END";
            Boolean opened = jdbc.queryForObject("INSERT INTO " + TABLE + " AS b (provider_id, booking_failures, quote_failures, "
                + "quote_failed_order, opened_at) VALUES (?, ?, ?, CAST(? AS uuid), CASE WHEN ? >= ? OR ? >= ? THEN now() END) "
                + "ON CONFLICT (provider_id) DO UPDATE SET "
                + "booking_failures = LEAST(b.booking_failures + EXCLUDED.booking_failures, 30000), "
                + "quote_failures = LEAST(b.quote_failures + " + quoteStep + ", 30000), "
                + "quote_failed_order = COALESCE(EXCLUDED.quote_failed_order, b.quote_failed_order), "
                + "opened_at = CASE WHEN b.opened_at IS NULL AND (b.booking_failures + EXCLUDED.booking_failures >= ? "
                + "OR b.quote_failures + " + quoteStep + " >= ?) THEN now() ELSE b.opened_at END, "
                + "probe_at = CASE WHEN b.opened_at IS NULL THEN NULL ELSE b.probe_at END, updated_at = now() "
                // Each statement is its own transaction, so now() is this statement's: true only where it opened the breaker.
                + "RETURNING opened_at = now()", Boolean.class,
                providerId, bookings, quotes, order == null ? null : order.toString(), bookings, bookingFailures, quotes, quoteFailures,
                bookingFailures, quoteFailures);
            if (Boolean.TRUE.equals(opened)) {
                log.error("CRAVES_ALERT alert=COURIER_BREAKER_OPEN provider={} failed={} halfOpenSeconds={}",
                    providerId, booking ? "bookings" : "quotes", halfOpenSeconds);
            }
        } catch (RuntimeException unwritable) {
            log.warn("Courier breaker failure could not be written provider={}", providerId, unwritable);
        } finally {
            if (interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
