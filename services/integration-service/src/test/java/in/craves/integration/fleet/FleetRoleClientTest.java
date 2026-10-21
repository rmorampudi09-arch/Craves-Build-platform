package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class FleetRoleClientTest {
    final UUID identity = UUID.fromString("11111111-1111-4111-8111-111111111111");
    final UUID rider = UUID.fromString("22222222-2222-4222-8222-222222222222");
    MockRestServiceServer auth;
    FleetRoleClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://auth.internal");
        auth = MockRestServiceServer.bindTo(builder).build();
        client = new FleetRoleClient(builder.build(), "shared-secret");
    }

    @Test
    void grantAndRevokeCallAuthServiceWithTheInternalSecret() {
        for (String action : new String[] {"grant", "revoke"}) {
            auth.expect(requestTo("http://auth.internal/internal/v1/roles/rider/" + action)).andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Craves-Internal-Secret", "shared-secret"))
                .andExpect(content().json("{\"identityId\":\"" + identity + "\",\"riderId\":\"" + rider + "\"}"))
                .andRespond(withSuccess("{\"identityId\":\"" + identity + "\",\"roles\":[\"CUSTOMER\",\"RIDER\"]}", MediaType.APPLICATION_JSON));
        }
        client.grant(identity, rider);
        client.revoke(identity, rider);
        auth.verify();
    }

    @Test
    void retriesOnceOnAServerError() {
        auth.expect(ExpectedCount.once(), requestTo("http://auth.internal/internal/v1/roles/rider/grant")).andRespond(withServerError());
        auth.expect(ExpectedCount.once(), requestTo("http://auth.internal/internal/v1/roles/rider/grant")).andRespond(withSuccess());
        client.grant(identity, rider);
        auth.verify();
    }

    @Test
    void aSecondServerErrorOrAWrongSecretFailsTheChange() {
        auth.expect(ExpectedCount.twice(), requestTo("http://auth.internal/internal/v1/roles/rider/grant")).andRespond(withServerError());
        assertThatThrownBy(() -> client.grant(identity, rider)).isInstanceOf(FleetApiException.class);
        auth.verify();

        auth.reset();
        auth.expect(ExpectedCount.once(), requestTo("http://auth.internal/internal/v1/roles/rider/revoke"))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> client.revoke(identity, rider)).isInstanceOf(FleetApiException.class);
        auth.verify();
    }

    @Test
    void withoutAuthSettingsNoCallIsMade() {
        FleetRoleClient off = new FleetRoleClient(FleetDatabase.properties(true), RestClient.builder());
        off.grant(identity, rider);
        off.revoke(identity, rider);
    }
}
