package in.craves.order.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import in.craves.order.web.ApiDtos.DeliveryPartnerResponse;
import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import in.craves.order.web.ApiDtos.OrderStatusHistoryEntry;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

class ChefOrderResponseContractTest {
    private static final Instant T0 = Instant.parse("2026-10-13T10:00:00Z");
    private static final List<String> CHEF_ONLY_KEYS = List.of(
        "chefAcceptanceExpiresAt", "customerNote", "statusHistory", "deliveryPartner");

    private final ObjectMapper json = JsonMapper.builder().findAndAddModules()
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).build();

    private OrderResponse plainOrder() {
        return new OrderResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "Kitchen",
            OrderStatus.READY_FOR_PICKUP, "INR", new BigDecimal("250.00"), BigDecimal.ZERO, BigDecimal.ZERO,
            BigDecimal.ZERO, new BigDecimal("250.00"), null, null, null, null, List.of(), T0, T0);
    }

    @Test
    void ordersWithoutChefDetailsSerializeExactlyAsBefore() throws Exception {
        JsonNode node = json.readTree(json.writeValueAsString(plainOrder()));

        CHEF_ONLY_KEYS.forEach(key -> assertThat(node.has(key)).as(key).isFalse());
        assertThat(node.has("chefResponseNote")).isTrue();
    }

    @Test
    void chefHandedOverAtIsAlwaysPresentAndNullUntilHandedOver() throws Exception {
        JsonNode notYet = json.readTree(json.writeValueAsString(plainOrder()));
        JsonNode handed = json.readTree(json.writeValueAsString(plainOrder().withChefDetails(null, null, null, T0)));

        // The app reads the key's presence as "this server supports hand-over".
        assertThat(notYet.has("chefHandedOverAt")).isTrue();
        assertThat(notYet.get("chefHandedOverAt").isNull()).isTrue();
        assertThat(handed.get("chefHandedOverAt").asText()).isEqualTo("2026-10-13T10:00:00Z");
    }

    @Test
    void chefDetailsSerializeWithTheContractNames() throws Exception {
        OrderResponse order = plainOrder()
            .withChefDetails(T0.plusSeconds(1800), "Less spicy",
                new DeliveryPartnerResponse("Ravi", "+919000000002", null, T0.plusSeconds(600)), T0.plusSeconds(5))
            .withStatusHistory(List.of(new OrderStatusHistoryEntry(OrderStatus.PAYMENT_PENDING, T0)));

        JsonNode node = json.readTree(json.writeValueAsString(order));

        assertThat(node.get("chefAcceptanceExpiresAt").asText()).isEqualTo("2026-10-13T10:30:00Z");
        assertThat(node.get("customerNote").asText()).isEqualTo("Less spicy");
        assertThat(node.get("chefHandedOverAt").asText()).isEqualTo("2026-10-13T10:00:05Z");
        assertThat(node.at("/statusHistory/0/status").asText()).isEqualTo("PAYMENT_PENDING");
        assertThat(node.at("/statusHistory/0/at").asText()).isEqualTo("2026-10-13T10:00:00Z");
        assertThat(node.at("/deliveryPartner/name").asText()).isEqualTo("Ravi");
        assertThat(node.at("/deliveryPartner/phone").asText()).isEqualTo("+919000000002");
        assertThat(node.at("/deliveryPartner/photoUrl").isNull()).isTrue();
        assertThat(node.at("/deliveryPartner/pickupEtaAt").asText()).isEqualTo("2026-10-13T10:10:00Z");
    }

    @Test
    void handedOverIsABodylessPostUnderTheChefOrderBoundary() {
        Method handedOver = Arrays.stream(ChefOrderController.class.getDeclaredMethods())
            .filter(method -> method.getName().equals("handedOver"))
            .findFirst()
            .orElseThrow();

        assertThat(handedOver.getAnnotation(PostMapping.class).value()).containsExactly("/{orderId}/handed-over");
        assertThat(handedOver.getReturnType()).isEqualTo(OrderResponse.class);
        assertThat(Arrays.stream(handedOver.getParameters()).anyMatch(p -> p.isAnnotationPresent(RequestBody.class)))
            .isFalse();
    }

    @Test
    void deliveryEventsReadTheOptionalCourierFieldsAndStillAcceptOldPayloads() throws Exception {
        UUID jobId = UUID.randomUUID();
        String base = "\"deliveryJobId\":\"" + jobId + "\",\"orderId\":\"" + UUID.randomUUID() + "\","
            + "\"chefSubOrderId\":\"" + UUID.randomUUID() + "\",\"providerId\":\"borzo\",\"providerDeliveryId\":\"b-1\","
            + "\"status\":\"COURIER_ASSIGNED\",\"observedAt\":\"2026-10-13T10:00:00Z\"";
        var type = json.getTypeFactory().constructParametricType(EventEnvelope.class, DeliveryStatusChangedData.class);

        EventEnvelope<DeliveryStatusChangedData> withCourier = json.readValue("{\"data\":{" + base
            + ",\"courierName\":\"Ravi\",\"courierPhone\":\"+919000000002\",\"courierPhotoUrl\":\"https://cdn.example/r.jpg\","
            + "\"pickupEtaAt\":\"2026-10-13T10:10:00Z\"}}", type);
        EventEnvelope<DeliveryStatusChangedData> old = json.readValue("{\"data\":{" + base + "}}", type);

        assertThat(withCourier.data().courierName()).isEqualTo("Ravi");
        assertThat(withCourier.data().courierPhone()).isEqualTo("+919000000002");
        assertThat(withCourier.data().courierPhotoUrl()).isEqualTo("https://cdn.example/r.jpg");
        assertThat(withCourier.data().pickupEtaAt()).isEqualTo(Instant.parse("2026-10-13T10:10:00Z"));
        assertThat(old.data().courierName()).isNull();
        assertThat(old.data().pickupEtaAt()).isNull();
    }
}
