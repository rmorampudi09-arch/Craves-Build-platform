package in.craves.integration.resilience;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import in.craves.integration.delivery.shiprocket.ShiprocketTransport.ShiprocketApiException;
import java.io.IOException;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class ProviderFailureClassifierTest {
    private final ProviderFailureClassifier classifier = new ProviderFailureClassifier();

    @Test
    void classifiesUncertainCreateAsTransient() {
        ProviderCreateUncertainException error = new ProviderCreateUncertainException(
            "borzo",
            "client-reference",
            Instant.now(),
            new IOException("socket closed")
        );

        assertThat(classifier.isTransient(error)).isTrue();
    }

    @Test
    void classifiesProviderRateLimitAndServerErrorsAsTransient() {
        assertThat(classifier.isTransient(new ShiprocketApiException(429, "rate limited", false))).isTrue();
        assertThat(classifier.isTransient(new ShiprocketApiException(503, "unavailable", true))).isTrue();
    }

    @Test
    void doesNotTripCircuitForBusinessValidationFailures() {
        assertThat(classifier.isTransient(new IllegalArgumentException("invalid delivery request"))).isFalse();
    }

    @Test
    void discoversNestedNetworkFailure() {
        RuntimeException error = new RuntimeException("provider wrapper", new IOException("connection reset"));
        assertThat(classifier.isTransient(error)).isTrue();
    }
}
