package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.net.ServerSocket;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

// CH-01 regression: without a read timeout a peer that accepts the connection but never answers hangs the caller forever.
class HttpClientTimeoutConfigurationTest {

    @Test
    void outboundCallGivesUpWhenThePeerNeverAnswers() throws Exception {
        try (ServerSocket silentPeer = new ServerSocket(0)) {
            RestClient.Builder builder = RestClient.builder();
            new HttpClientTimeoutConfiguration()
                .outboundHttpTimeouts(Duration.ofSeconds(1), Duration.ofMillis(300))
                .customize(builder);
            RestClient client = builder.baseUrl("http://127.0.0.1:" + silentPeer.getLocalPort()).build();

            assertTimeoutPreemptively(Duration.ofSeconds(10), () ->
                assertThatThrownBy(() -> client.get().uri("/internal/v1/ping").retrieve().toBodilessEntity())
                    .isInstanceOf(ResourceAccessException.class));
        }
    }
}
