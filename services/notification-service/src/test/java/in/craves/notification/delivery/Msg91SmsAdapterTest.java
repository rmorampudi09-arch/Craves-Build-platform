package in.craves.notification.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.notification.delivery.Msg91SmsAdapter.SmsNotSent;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryWorkItem;
import in.craves.notification.delivery.NotificationDeliveryRepository.SmsContent;
import in.craves.notification.documents.DocumentHttp;
import in.craves.notification.service.SmsPolicyProperties;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Handbook 082: what Craves sends to MSG91, against a local server standing in for its flow API. */
class Msg91SmsAdapterTest {
    private static final String TEMPLATE = "64ab12cd34ef56ab78cd90ef";
    private static final Instant NOW = Instant.parse("2026-11-10T12:00:00Z");
    private static final OffsetDateTime FRESH = OffsetDateTime.ofInstant(NOW.minusSeconds(60), ZoneOffset.UTC);
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicReference<String> sentBody = new AtomicReference<>();
    private final AtomicReference<String> sentKey = new AtomicReference<>();
    private volatile String answer = "{\"type\":\"success\",\"message\":\"3463686b6b6f363433383233\"}";
    private volatile int status = 200;
    private HttpServer server;
    private NotificationDeliveryRepository repository;
    private AuthRecipientPhoneResolver phones;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v5/flow", exchange -> {
            sentKey.set(exchange.getRequestHeaders().getFirst("authkey"));
            sentBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] bytes = answer.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        repository = mock(NotificationDeliveryRepository.class);
        phones = mock(AuthRecipientPhoneResolver.class);
        when(phones.resolve(any())).thenReturn("919876543210");
    }

    @AfterEach
    void stop() {
        try {
            server.stop(0);
        } catch (RuntimeException alreadyStopped) {
            // one test stops it on purpose
        }
    }

    @Test
    void sendsOnlyTheTemplateThePhoneAndTheListedVariables() throws Exception {
        content("ORDER_CREATED", "{\"orderNumber\":\"CRV-1042\",\"kitchenName\":\"Amma's\\u0085Kitchen\\u2028\",\"email\":\"a@b.c\"}", FRESH);

        var result = adapter("ORDER_CREATED=" + TEMPLATE + ":orderNumber,kitchenName").send(item("ORDER"));

        assertThat(result.provider()).isEqualTo("msg91-sms");
        assertThat(result.providerMessageId()).isEqualTo("3463686b6b6f363433383233");
        assertThat(sentKey.get()).isEqualTo("unit-test-auth-key");
        JsonNode body = mapper.readTree(sentBody.get());
        assertThat(body.path("template_id").asText()).isEqualTo(TEMPLATE);
        assertThat(body.path("short_url").asText()).isEqualTo("0");
        JsonNode recipient = body.path("recipients").get(0);
        assertThat(recipient.path("mobiles").asText()).isEqualTo("919876543210");
        assertThat(recipient.path("orderNumber").asText()).isEqualTo("CRV-1042");
        assertThat(recipient.path("kitchenName").asText()).isEqualTo("Amma's Kitchen");
        assertThat(sentBody.get()).doesNotContain("a@b.c").doesNotContain("Title").doesNotContain("Body text");
    }

    @Test
    void whatCanNeverBeSentIsNotSentAndNeverReachesAuthOrMsg91() {
        content("ORDER_CREATED", "{\"orderNumber\":\"5d3f1f0e-4a51-4f4f-9a2b-1b8f7f6f2c11\"}", FRESH);
        assertThatThrownBy(() -> adapter("ORDER_CREATED=" + TEMPLATE + ":orderNumber").send(item("ORDER")))
            .isInstanceOf(SmsNotSent.class).hasMessageContaining("longer than 30");
        content("ORDER_CREATED", "{\"orderNumber\":{\"nested\":1}}", FRESH);
        assertThatThrownBy(() -> adapter("ORDER_CREATED=" + TEMPLATE + ":orderNumber").send(item("ORDER")))
            .isInstanceOf(SmsNotSent.class).hasMessageContaining("orderNumber");
        content("REFUNDED", "{}", FRESH);
        assertThatThrownBy(() -> adapter("ORDER_CREATED=" + TEMPLATE).send(item("ORDER")))
            .isInstanceOf(SmsNotSent.class).hasMessageContaining("No SMS template");
        content("ORDER_CREATED", "{}", OffsetDateTime.ofInstant(NOW.minusSeconds(31 * 60), ZoneOffset.UTC));
        assertThatThrownBy(() -> adapter("ORDER_CREATED=" + TEMPLATE).send(item("ORDER")))
            .isInstanceOf(SmsNotSent.class).hasMessageContaining("30 minutes");
        content("ORDER_CREATED", "{}", FRESH);
        assertThatThrownBy(() -> adapter("ORDER_CREATED=" + TEMPLATE).send(item("TEAM_ALERT")))
            .isInstanceOf(SmsNotSent.class).hasMessageContaining("team alert");
        verify(phones, never()).resolve(any());
        assertThat(sentBody.get()).isNull();

        NotificationDeliveryProperties testNumbers = properties();
        testNumbers.setSmsSkipNumbersJson("{\"+919876543210\":\"CUST-E2E-001\"}");
        testNumbers.validate();
        assertThatThrownBy(() -> adapter(testNumbers, "ORDER_CREATED=" + TEMPLATE).send(item("ORDER")))
            .isInstanceOf(SmsNotSent.class).hasMessageContaining("test number");
        assertThat(sentBody.get()).isNull();
    }

    @Test
    void aRefusalOrAnOutageIsRetriedWithMsg91sReason() {
        content("ORDER_CREATED", "{\"orderNumber\":\"CRV-1042\"}", FRESH);
        answer = "{\"type\":\"error\",\"message\":\"Template not approved\\nfor sender\"}";
        assertThatThrownBy(() -> adapter("ORDER_CREATED=" + TEMPLATE + ":orderNumber").send(item("ORDER")))
            .isExactlyInstanceOf(IllegalStateException.class).hasMessageContaining("Template not approved for sender");

        answer = "{\"type\":\"success\",\"message\":\"x\"}";
        status = 500;
        assertThatThrownBy(() -> adapter("ORDER_CREATED=" + TEMPLATE).send(item("ORDER")))
            .isExactlyInstanceOf(IllegalStateException.class).hasMessageContaining("HTTP 500");

        server.stop(0);
        assertThatThrownBy(() -> adapter("ORDER_CREATED=" + TEMPLATE).send(item("ORDER")))
            .isExactlyInstanceOf(IllegalStateException.class).hasMessageContaining("failed or timed out");
    }

    private void content(String event, String payload, OffsetDateTime createdAt) {
        when(repository.smsContent(any())).thenReturn(new SmsContent(event, payload, createdAt));
    }

    private static NotificationDeliveryProperties properties() {
        NotificationDeliveryProperties properties = new NotificationDeliveryProperties();
        properties.setMsg91AuthKey(" unit-test-auth-key ");
        return properties;
    }

    private Msg91SmsAdapter adapter(String templates) {
        return adapter(properties(), templates);
    }

    private Msg91SmsAdapter adapter(NotificationDeliveryProperties properties, String templates) {
        SmsPolicyProperties policy = new SmsPolicyProperties();
        policy.setEnabled(true);
        policy.setTemplates(templates);
        URI flow = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/api/v5/flow");
        return new Msg91SmsAdapter(properties, policy, repository, phones, new DocumentHttp(), mapper, flow, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static DeliveryWorkItem item(String targetType) {
        return new DeliveryWorkItem(UUID.randomUUID(), UUID.randomUUID(), "SMS", "+911111111111", "Title", "Body text", targetType,
            UUID.randomUUID(), Map.of(), 5, 1, UUID.randomUUID());
    }
}
