package in.craves.integration.resilience;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.Test;

class ProviderResilienceAspectTest {
    @Test
    void opensCircuitAfterConfiguredTransientFailureThreshold() throws Throwable {
        ProviderResilienceProperties properties = enabledProperties();
        ProviderResilienceAspect aspect = new ProviderResilienceAspect(
            properties,
            new ProviderFailureClassifier(),
            new SimpleMeterRegistry()
        );
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        DeliveryProviderAdapter adapter = mock(DeliveryProviderAdapter.class);
        when(joinPoint.getTarget()).thenReturn(adapter);
        when(adapter.providerId()).thenReturn("borzo");
        when(joinPoint.proceed())
            .thenThrow(new RuntimeException("network", new IOException("timeout")))
            .thenThrow(new RuntimeException("network", new IOException("timeout")));

        assertThatThrownBy(() -> aspect.isolateProviderCall(joinPoint)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> aspect.isolateProviderCall(joinPoint)).isInstanceOf(RuntimeException.class);

        assertThat(aspect.circuitBreaker("borzo").getState()).isEqualTo(CircuitBreaker.State.OPEN);
        assertThatThrownBy(() -> aspect.isolateProviderCall(joinPoint))
            .isInstanceOf(ProviderCallRejectedException.class)
            .satisfies(error -> assertThat(((ProviderCallRejectedException) error).reason())
                .isEqualTo(ProviderCallRejectedException.Reason.CIRCUIT_OPEN));
        verify(joinPoint, times(2)).proceed();
    }

    @Test
    void businessFailureDoesNotCountAsProviderInfrastructureFailure() throws Throwable {
        ProviderResilienceProperties properties = enabledProperties();
        ProviderResilienceAspect aspect = new ProviderResilienceAspect(
            properties,
            new ProviderFailureClassifier(),
            new SimpleMeterRegistry()
        );
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        DeliveryProviderAdapter adapter = mock(DeliveryProviderAdapter.class);
        when(joinPoint.getTarget()).thenReturn(adapter);
        when(adapter.providerId()).thenReturn("shiprocket");
        when(joinPoint.proceed()).thenThrow(new IllegalArgumentException("unserviceable request"));

        assertThatThrownBy(() -> aspect.isolateProviderCall(joinPoint))
            .isInstanceOf(IllegalArgumentException.class);

        assertThat(aspect.circuitBreaker("shiprocket").getMetrics().getNumberOfFailedCalls()).isZero();
    }

    private static ProviderResilienceProperties enabledProperties() {
        ProviderResilienceProperties properties = new ProviderResilienceProperties();
        properties.setEnabled(true);
        properties.setSlidingWindowSize(5);
        properties.setMinimumNumberOfCalls(2);
        properties.setFailureRateThreshold(50.0f);
        properties.setOpenStateSeconds(30);
        properties.setHalfOpenCalls(1);
        properties.setMaxConcurrentCallsPerProvider(2);
        properties.validate();
        return properties;
    }
}
