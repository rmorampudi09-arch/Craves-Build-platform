package in.craves.integration.delivery.command;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import in.craves.integration.delivery.shiprocket.ShiprocketTransport.ShiprocketApiException;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Handbook 104: a circuit breaker and a concurrency limit (bulkhead) per delivery provider, around quotes only. A quote
 * never books anything, so skipping one is always safe: the router treats a refused quote like any failed quote, and when
 * no provider quotes the command waits as before. Creates and reconciliations are never blocked.
 * The breaker counts only signs that the provider itself is unwell: no answer, a timeout, HTTP 5xx or 429, or a quote
 * slower than the fan-out deadline (the router could not use it anyway). A 4xx, a refusal of one order (bad address,
 * outside the zone) or a switched-off provider says nothing about its health and is not counted. After
 * {@code failure-threshold} such failures in a row the breaker opens for {@code open-duration}, then lets one quote
 * through as a probe: a success closes it, a failure keeps it open. Off unless CRAVES_PROVIDER_RESILIENCE_ENABLED=true.
 */
@Component
@ConditionalOnProperty(prefix = "craves.provider-resilience", name = "enabled", havingValue = "true")
public class ProviderGuard {
    private static final Logger log = LoggerFactory.getLogger(ProviderGuard.class);
    private static final Pattern HTTP_STATUS = Pattern.compile("HTTP (\\d{3})");

    private final int failureThreshold;
    private final Duration openDuration;
    private final int maxConcurrentCalls;
    private final Clock clock;
    private final ConcurrentMap<String, State> states = new ConcurrentHashMap<>();

    public ProviderGuard(@Value("${craves.provider-resilience.failure-threshold:5}") int failureThreshold,
                         @Value("${craves.provider-resilience.open-duration:30s}") Duration openDuration,
                         @Value("${craves.provider-resilience.max-concurrent-calls:8}") int maxConcurrentCalls,
                         Clock clock) {
        if (failureThreshold < 1 || maxConcurrentCalls < 1 || openDuration.isNegative() || openDuration.isZero()) {
            throw new IllegalArgumentException("craves.provider-resilience needs failure-threshold >= 1, "
                + "max-concurrent-calls >= 1 and a positive open-duration");
        }
        this.failureThreshold = failureThreshold;
        this.openDuration = openDuration;
        this.maxConcurrentCalls = maxConcurrentCalls;
        this.clock = clock;
    }

    /** Thrown instead of calling the provider; the router records it as that provider's quote error. */
    public static final class ProviderRefusedException extends RuntimeException {
        ProviderRefusedException(String message) {
            super(message);
        }
    }

    public ProviderQuote quote(String providerId, Supplier<ProviderQuote> call, Duration slowAfter) {
        State state = states.computeIfAbsent(providerId, ignored -> new State(maxConcurrentCalls));
        if (!state.permits.tryAcquire()) {
            throw new ProviderRefusedException("Provider " + providerId + " is busy (" + maxConcurrentCalls + " quotes running)");
        }
        boolean probe;
        try {
            probe = state.admit(clock.instant(), providerId);
        } catch (ProviderRefusedException open) {
            state.permits.release();
            throw open;
        }
        Instant started = clock.instant();
        Boolean healthy = Boolean.FALSE;
        try {
            ProviderQuote quote = call.get();
            healthy = !slow(started, slowAfter);
            return quote;
        } catch (RuntimeException error) {
            healthy = slow(started, slowAfter) ? Boolean.FALSE : health(error);
            throw error;
        } finally {
            state.permits.release();
            state.record(healthy, probe, clock.instant(), providerId);
        }
    }

    /** FALSE when the error shows the provider is unwell; null when it says nothing about its health. */
    static Boolean health(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof IOException || cause instanceof TimeoutException || cause instanceof ResourceAccessException) {
                return Boolean.FALSE;
            }
            if (cause instanceof RestClientResponseException response) {
                return serverSide(response.getStatusCode().value());
            }
            if (cause instanceof ShiprocketApiException shiprocket && shiprocket.httpStatus() != null) {
                return serverSide(shiprocket.httpStatus());
            }
        }
        String message = error.getMessage() == null ? "" : error.getMessage();
        Matcher status = HTTP_STATUS.matcher(message);
        if (status.find()) {
            return serverSide(Integer.parseInt(status.group(1)));
        }
        // Pidge reports a lost answer only in its message ("Pidge response was not received").
        return message.contains("not received") || message.contains("could not be reached") ? Boolean.FALSE : null;
    }

    private static Boolean serverSide(int status) {
        return status >= 500 || status == 429 ? Boolean.FALSE : null;
    }

    private boolean slow(Instant started, Duration slowAfter) {
        return Duration.between(started, clock.instant()).compareTo(slowAfter) > 0;
    }

    private final class State {
        private final Semaphore permits;
        private int failuresInARow;
        private Instant openUntil;
        private boolean probing;

        private State(int maxConcurrentCalls) {
            this.permits = new Semaphore(maxConcurrentCalls);
        }

        /** Returns true when this call is the one probe of an open breaker; refuses every other call while open. */
        private synchronized boolean admit(Instant now, String providerId) {
            if (openUntil == null) {
                return false;
            }
            if (now.isBefore(openUntil) || probing) {
                throw new ProviderRefusedException("Provider " + providerId + " circuit open after " + failuresInARow
                    + " failed quotes in a row");
            }
            probing = true;
            return true;
        }

        /** healthy null: the call says nothing about the provider's health. */
        private synchronized void record(Boolean healthy, boolean probe, Instant now, String providerId) {
            if (probe) {
                probing = false;
            }
            if (healthy == null) {
                return;
            }
            if (healthy) {
                if (openUntil != null) {
                    log.warn("Provider circuit closed provider={}", providerId);
                }
                failuresInARow = 0;
                openUntil = null;
                return;
            }
            failuresInARow++;
            if (probe) {
                openUntil = now.plus(openDuration);
                log.warn("Provider circuit still open provider={} failuresInARow={}", providerId, failuresInARow);
            } else if (openUntil == null && failuresInARow >= failureThreshold) {
                openUntil = now.plus(openDuration);
                log.error("CRAVES_ALERT alert=PROVIDER_CIRCUIT_OPEN provider={} failuresInARow={} openSeconds={}",
                    providerId, failuresInARow, openDuration.toSeconds());
            }
        }
    }
}
