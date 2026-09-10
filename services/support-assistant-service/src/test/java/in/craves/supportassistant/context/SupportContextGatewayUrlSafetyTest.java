package in.craves.supportassistant.context;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class SupportContextGatewayUrlSafetyTest {
    @Test
    void permitsOnlyExactConfiguredHttpsHosts() {
        assertThat(SupportContextGateway.validatedBaseUri(
            "https://api.craves.in",
            List.of("api.craves.in")
        )).isNotNull();

        assertThat(SupportContextGateway.validatedBaseUri(
            "https://orders.internal.azurecontainerapps.io/",
            List.of("orders.internal.azurecontainerapps.io")
        )).isNotNull();

        assertThat(SupportContextGateway.validatedBaseUri(
            "https://api.craves.in.evil.example",
            List.of("api.craves.in")
        )).isNull();

        assertThat(SupportContextGateway.validatedBaseUri(
            "https://unapproved.example",
            List.of("api.craves.in")
        )).isNull();
    }

    @Test
    void rejectsCredentialBearingAmbiguousOrNonRootUrls() {
        assertThat(SupportContextGateway.validatedBaseUri(
            "https://user@api.craves.in",
            List.of("api.craves.in")
        )).isNull();
        assertThat(SupportContextGateway.validatedBaseUri(
            "https://api.craves.in?redirect=https://evil.example",
            List.of("api.craves.in")
        )).isNull();
        assertThat(SupportContextGateway.validatedBaseUri(
            "https://api.craves.in/internal/path",
            List.of("api.craves.in")
        )).isNull();
        assertThat(SupportContextGateway.validatedBaseUri(
            "http://api.craves.in",
            List.of("api.craves.in")
        )).isNull();
        assertThat(SupportContextGateway.validatedBaseUri(
            "https://api.craves.in:8443",
            List.of("api.craves.in")
        )).isNull();
    }

    @Test
    void permitsLoopbackHttpOnlyForLocalDevelopment() {
        assertThat(SupportContextGateway.validatedBaseUri(
            "http://localhost:8081",
            List.of()
        )).isNotNull();
        assertThat(SupportContextGateway.validatedBaseUri(
            "http://127.0.0.1:8082",
            List.of()
        )).isNotNull();
    }
}
