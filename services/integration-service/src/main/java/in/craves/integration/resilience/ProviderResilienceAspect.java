package in.craves.integration.resilience;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
public class ProviderResilienceAspect {
    private final ProviderResilienceProperties properties;
    private final ProviderFailureClassifier failureClassifier;
    private final MeterRegistry meterRegistry;
    private final Map<String, CircuitBreaker> circuitBreakers = new ConcurrentHashMap<>();
    private final Map<String, Bulkhead> bulkheads = new ConcurrentHashMap<>();

    public ProviderResilienceAspect(
        ProviderResilienceProperties properties,
        ProviderFailureClassifier failureClassifier,
        MeterRegistry meterRegistry
    ) {
        this.properties = properties;
        this.failureClassifier = failureClassifier;
        this.meterRegistry = meterRegistry;
    }

    @Around(
        "execution(* in.craves.integration.delivery.provider.DeliveryProviderAdapter+.quote(..)) || " +
        "execution(* in.craves.integration.delivery.provider.DeliveryProviderAdapter+.create(..)) || " +
        "execution(* in.craves.integration.delivery.provider.DeliveryProviderAdapter+.reconcileCreate(..)) || " +
        "execution(* in.craves.integration.delivery.provider.DeliveryProviderAdapter+.cancel(..)) || " +
        "execution(* in.craves.integration.delivery.provider.DeliveryProviderAdapter+.track(..))"
    )
    public Object isolateProviderCall(ProceedingJoinPoint joinPoint) throws Throwable {
        if (!properties.isEnabled()) {
            return joinPoint.proceed();
        }
        Object target = joinPoint.getTarget();
        if (!(target instanceof DeliveryProviderAdapter adapter)) {
            return joinPoint.proceed();
        }

        String providerId = normalize(adapter.providerId());
        Bulkhead bulkhead = bulkheads.computeIfAbsent(providerId, this::createBulkhead);
        if (!bulkhead.tryAcquirePermission()) {
            meterRegistry.counter(
                "craves.integration.provider.rejections",
                "provider", providerId,
                "reason", "bulkhead_full"
            ).increment();
            throw new ProviderCallRejectedException(
                providerId,
                ProviderCallRejectedException.Reason.BULKHEAD_FULL
            );
        }

        CircuitBreaker circuitBreaker = circuitBreakers.computeIfAbsent(providerId, this::createCircuitBreaker);
        if (!circuitBreaker.tryAcquirePermission()) {
            bulkhead.releasePermission();
            meterRegistry.counter(
                "craves.integration.provider.rejections",
                "provider", providerId,
                "reason", "circuit_open"
            ).increment();
            throw new ProviderCallRejectedException(
                providerId,
                ProviderCallRejectedException.Reason.CIRCUIT_OPEN
            );
        }

        long started = System.nanoTime();
        try {
            Object result = joinPoint.proceed();
            circuitBreaker.onSuccess(System.nanoTime() - started, TimeUnit.NANOSECONDS);
            meterRegistry.counter(
                "craves.integration.provider.calls",
                "provider", providerId,
                "outcome", "success"
            ).increment();
            return result;
        } catch (Throwable error) {
            long duration = System.nanoTime() - started;
            if (failureClassifier.isTransient(error)) {
                circuitBreaker.onError(duration, TimeUnit.NANOSECONDS, error);
                meterRegistry.counter(
                    "craves.integration.provider.calls",
                    "provider", providerId,
                    "outcome", "transient_failure"
                ).increment();
            } else {
                circuitBreaker.onSuccess(duration, TimeUnit.NANOSECONDS);
                meterRegistry.counter(
                    "craves.integration.provider.calls",
                    "provider", providerId,
                    "outcome", "non_transient_failure"
                ).increment();
            }
            throw error;
        } finally {
            bulkhead.onComplete();
        }
    }

    CircuitBreaker circuitBreaker(String providerId) {
        return circuitBreakers.computeIfAbsent(normalize(providerId), this::createCircuitBreaker);
    }

    Bulkhead bulkhead(String providerId) {
        return bulkheads.computeIfAbsent(normalize(providerId), this::createBulkhead);
    }

    private CircuitBreaker createCircuitBreaker(String providerId) {
        CircuitBreakerConfig config = CircuitBreakerConfig.custom()
            .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
            .slidingWindowSize(properties.getSlidingWindowSize())
            .minimumNumberOfCalls(properties.getMinimumNumberOfCalls())
            .failureRateThreshold(properties.getFailureRateThreshold())
            .waitDurationInOpenState(Duration.ofSeconds(properties.getOpenStateSeconds()))
            .permittedNumberOfCallsInHalfOpenState(properties.getHalfOpenCalls())
            .build();
        CircuitBreaker circuitBreaker = CircuitBreaker.of("provider-" + providerId, config);
        Gauge.builder(
                "craves.integration.provider.circuit.state",
                circuitBreaker,
                value -> stateCode(value.getState())
            )
            .description("Delivery provider circuit state: 0=CLOSED, 1=OPEN, 2=HALF_OPEN, 3+=special state")
            .tag("provider", providerId)
            .register(meterRegistry);
        return circuitBreaker;
    }

    private Bulkhead createBulkhead(String providerId) {
        BulkheadConfig config = BulkheadConfig.custom()
            .maxConcurrentCalls(properties.getMaxConcurrentCallsPerProvider())
            .maxWaitDuration(Duration.ZERO)
            .build();
        return Bulkhead.of("provider-" + providerId, config);
    }

    private static double stateCode(CircuitBreaker.State state) {
        return switch (state) {
            case CLOSED -> 0.0d;
            case OPEN -> 1.0d;
            case HALF_OPEN -> 2.0d;
            case DISABLED -> 3.0d;
            case FORCED_OPEN -> 4.0d;
            case METRICS_ONLY -> 5.0d;
        };
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]", "_");
    }
}
