package in.craves.integration.fleet.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import in.craves.integration.fleet.client.DeliveryCodeClient.Outcome;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class FleetClientsTest {
    static final UUID ORDER = UUID.fromString("0bde0101-1111-4111-8111-111111111111");

    @Test
    void roadDistanceAsksUserChefWithTheInternalSecret() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-chef.internal");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://user-chef.internal/internal/v1/maps/road-distance")).andExpect(method(HttpMethod.POST))
            .andExpect(header("X-Craves-Internal-Secret", "secret"))
            .andExpect(content().json("{\"from\":{\"lat\":17.4483,\"lng\":78.3915},\"to\":{\"lat\":17.4374,\"lng\":78.3897}}"))
            .andRespond(withSuccess("{\"meters\":1900,\"seconds\":480,\"source\":\"OLA\"}", MediaType.APPLICATION_JSON));

        assertThat(new RoadDistanceClient(builder.build(), "secret").meters(17.4483, 78.3915, 17.4374, 78.3897)).isEqualTo(1900);
        server.verify();
    }

    @Test
    void roadDistanceFallsBackToStraightLineTimesOnePointThreeWithoutRetrying() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-chef.internal");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(ExpectedCount.once(), requestTo("http://user-chef.internal/internal/v1/maps/road-distance"))
            .andRespond(withServerError());
        int straight = (int) Math.round(RoadDistanceClient.straightLineMetres(17.4483, 78.3915, 17.4374, 78.3897));

        assertThat(new RoadDistanceClient(builder.build(), "secret").meters(17.4483, 78.3915, 17.4374, 78.3897))
            .isEqualTo((int) Math.round(straight * 1.3));
        assertThat(new RoadDistanceClient(null, null).meters(17.4483, 78.3915, 17.4374, 78.3897))
            .as("off until the URL and secret are set").isEqualTo((int) Math.round(straight * 1.3));
        assertThat(straight).isBetween(1200, 1250);
        server.verify();
    }

    @Test
    void deliveryCodeMapsEveryOrderServiceAnswerAndNeverRetries() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://order.internal");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        String uri = "http://order.internal/internal/v1/orders/" + ORDER + "/delivery-code/verify";
        server.expect(ExpectedCount.once(), requestTo(uri)).andExpect(header("X-Craves-Internal-Secret", "secret"))
            .andExpect(content().json("{\"code\":\"1234\"}")).andRespond(withSuccess("{\"verified\":true}", MediaType.APPLICATION_JSON));
        server.expect(ExpectedCount.once(), requestTo(uri)).andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
            .contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"DELIVERY_CODE_INVALID\",\"attemptsLeft\":3}"));
        server.expect(ExpectedCount.once(), requestTo(uri)).andRespond(withStatus(HttpStatus.LOCKED)
            .contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"DELIVERY_CODE_LOCKED\"}"));
        server.expect(ExpectedCount.once(), requestTo(uri)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(ExpectedCount.once(), requestTo(uri)).andRespond(withStatus(HttpStatus.FORBIDDEN));
        server.expect(ExpectedCount.once(), requestTo(uri)).andRespond(withServerError());
        DeliveryCodeClient client = new DeliveryCodeClient(builder.build(), "secret");

        assertThat(client.verify(ORDER, "1234")).isEqualTo(new DeliveryCodeClient.Result(Outcome.VERIFIED, 0));
        assertThat(client.verify(ORDER, "1235")).isEqualTo(new DeliveryCodeClient.Result(Outcome.INVALID, 3));
        assertThat(client.verify(ORDER, "1235").outcome()).isEqualTo(Outcome.LOCKED);
        assertThat(client.verify(ORDER, "1235").outcome()).isEqualTo(Outcome.NOT_FOUND);
        assertThat(client.verify(ORDER, "1235").outcome()).isEqualTo(Outcome.UNAVAILABLE);
        assertThat(client.verify(ORDER, "1235").outcome()).as("a 5xx is not retried: a retry could count a wrong code twice")
            .isEqualTo(Outcome.UNAVAILABLE);
        assertThat(new DeliveryCodeClient(null, null).verify(ORDER, "1234").outcome()).isEqualTo(Outcome.UNAVAILABLE);
        server.verify();
    }

    @Test
    void offerPushIsOneDataMessageWithTheOfferAndTheSecondsLeft() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://notification.internal");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        UUID offerId = UUID.randomUUID();
        server.expect(ExpectedCount.once(), requestTo("http://notification.internal/internal/v1/push/realtime"))
            .andExpect(method(HttpMethod.POST)).andExpect(header("X-Craves-Internal-Key", "secret"))
            .andExpect(jsonPath("$.app").value("rider")).andExpect(jsonPath("$.token").value("fcm-token"))
            .andExpect(jsonPath("$.ttlSeconds").value(37)).andExpect(jsonPath("$.collapseKey").value("offer-" + offerId))
            .andExpect(jsonPath("$.data.type").value("OFFER")).andExpect(jsonPath("$.data.offerId").value(offerId.toString()))
            .andExpect(jsonPath("$.data.offer").value("{\"offerId\":\"" + offerId + "\"}"))
            .andExpect(jsonPath("$.notification.title").value("New order: ₹58"))
            .andExpect(jsonPath("$.notification.body").value("Madhapur to Kondapur"))
            .andRespond(withSuccess("{\"messageId\":\"projects/craves/messages/1\"}", MediaType.APPLICATION_JSON));
        server.expect(ExpectedCount.once(), requestTo("http://notification.internal/internal/v1/push/realtime"))
            .andRespond(withStatus(HttpStatus.BAD_GATEWAY).contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"TOKEN_UNREGISTERED\"}"));
        RiderPushClient client = new RiderPushClient(builder.build(), "secret");

        assertThat(client.offer("fcm-token", offerId, "{\"offerId\":\"" + offerId + "\"}", "New order: ₹58", "Madhapur to Kondapur", 37))
            .isEqualTo("SENT");
        assertThat(client.offer("fcm-token", offerId, "{}", "New order: ₹58", "Madhapur to Kondapur", 30))
            .as("never retried: the offer is on /locations too").isEqualTo("TOKEN_UNREGISTERED");
        assertThat(client.offer("fcm-token", offerId, "{}", "t", "b", 0)).as("expired: nothing is sent").isEqualTo("EXPIRED");
        server.verify();
    }

    /** Blueprint A7: the "tap to go online" push, a GO_ONLINE data message alive 10 minutes that a newer one replaces. */
    @Test
    void theGoOnlinePushIsAGoOnlineDataMessage() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://notification.internal");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(ExpectedCount.once(), requestTo("http://notification.internal/internal/v1/push/realtime"))
            .andExpect(method(HttpMethod.POST)).andExpect(header("X-Craves-Internal-Key", "secret"))
            .andExpect(jsonPath("$.app").value("rider")).andExpect(jsonPath("$.token").value("fcm-token"))
            .andExpect(jsonPath("$.data.type").value("GO_ONLINE")).andExpect(jsonPath("$.ttlSeconds").value(600))
            .andExpect(jsonPath("$.collapseKey").value("go-online")).andExpect(jsonPath("$.notification.title").value("You're offline"))
            .andExpect(jsonPath("$.notification.body").value("Tap to go back online and get orders."))
            .andRespond(withSuccess("{\"messageId\":\"projects/craves/messages/2\"}", MediaType.APPLICATION_JSON));
        RiderPushClient client = new RiderPushClient(builder.build(), "secret");

        assertThat(client.goOnline("fcm-token")).isEqualTo("SENT");
        server.verify();
    }

    /** P6-04: ops's decision on an application, an ACCOUNT data message the phone words in the rider's language. */
    @Test
    void theDecisionPushIsAnAccountDataMessage() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://notification.internal");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(ExpectedCount.once(), requestTo("http://notification.internal/internal/v1/push/realtime"))
            .andExpect(jsonPath("$.token").value("fcm-token")).andExpect(jsonPath("$.data.type").value("ACCOUNT"))
            .andExpect(jsonPath("$.data.decision").value("APPROVE")).andExpect(jsonPath("$.collapseKey").value("account"))
            .andExpect(jsonPath("$.notification.title").value("You're approved"))
            .andRespond(withSuccess("{\"messageId\":\"projects/craves/messages/3\"}", MediaType.APPLICATION_JSON));
        server.expect(ExpectedCount.once(), requestTo("http://notification.internal/internal/v1/push/realtime"))
            .andExpect(jsonPath("$.data.decision").value("FIXES")).andExpect(jsonPath("$.ttlSeconds").value(600))
            .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        RiderPushClient client = new RiderPushClient(builder.build(), "secret");

        assertThat(client.account("fcm-token", true)).isEqualTo("SENT");
        assertThat(client.account("fcm-token", false)).isEqualTo("SENT");
        assertThat(new RiderPushClient(null, null).account("fcm-token", true)).isEqualTo("OFF");
        server.verify();
    }

    @Test
    void opsAlertsReportWhetherAnyoneWasTold() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://notification.internal");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://notification.internal/internal/v1/ops-alerts")).andExpect(header("X-Craves-Internal-Key", "secret"))
            .andExpect(jsonPath("$.kind").value("FLEET_DISPATCH_QUEUE")).andExpect(jsonPath("$.data.orderCode").value("#0BDE0101"))
            .andRespond(withStatus(HttpStatus.ACCEPTED));
        server.expect(requestTo("http://notification.internal/internal/v1/ops-alerts"))
            .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE).contentType(MediaType.APPLICATION_JSON)
                .body("{\"code\":\"OPS_ALERT_NOT_CONFIGURED\"}"));
        RiderPushClient client = new RiderPushClient(builder.build(), "secret");

        assertThat(client.opsAlert("FLEET_DISPATCH_QUEUE", "No courier", "Order #0BDE0101", Map.of("orderCode", "#0BDE0101"))).isTrue();
        assertThat(client.opsAlert("FLEET_DISPATCH_QUEUE", "No courier", "Order #0BDE0101", Map.of())).isFalse();
        assertThat(new RiderPushClient(null, null).opsAlert("FLEET_DISPATCH_QUEUE", "t", "b", Map.of())).isFalse();
        server.verify();
    }
}
