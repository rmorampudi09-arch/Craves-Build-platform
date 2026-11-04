package in.craves.order.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.order.web.ApiDtos.CustomerAddressSnapshotResponse;
import in.craves.order.web.ApiDtos.KitchenPickupSnapshotResponse;
import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderResponsePrivacyTest {
    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();

    @Test
    void doesNotSerializeKitchenPickupContactOrHomeAddress() throws Exception {
        CustomerAddressSnapshotResponse dropoff = new CustomerAddressSnapshotResponse(
            UUID.randomUUID(),
            "Customer",
            "+918019166645",
            "Customer address",
            null,
            null,
            "Madhapur",
            "Hyderabad",
            "Telangana",
            "500081",
            new BigDecimal("17.4483000"),
            new BigDecimal("78.3915000")
        );
        KitchenPickupSnapshotResponse pickup = new KitchenPickupSnapshotResponse(
            UUID.randomUUID(),
            "Home Kitchen",
            "+919876543210",
            "private-kitchen@example.com",
            "Private chef home address",
            null,
            null,
            "Kondapur",
            "Hyderabad",
            "Telangana",
            "500084",
            new BigDecimal("17.4698000"),
            new BigDecimal("78.3651000")
        );
        OrderResponse response = new OrderResponse(
            UUID.randomUUID(),
            UUID.randomUUID(),
            UUID.randomUUID(),
            pickup.kitchenId(),
            pickup.kitchenName(),
            OrderStatus.PAYMENT_PENDING,
            "INR",
            new BigDecimal("250.00"),
            BigDecimal.ZERO,
            BigDecimal.ZERO,
            BigDecimal.ZERO,
            new BigDecimal("250.00"),
            null,
            null,
            dropoff,
            pickup,
            List.of(),
            Instant.parse("2026-07-16T08:00:00Z"),
            Instant.parse("2026-07-16T08:00:00Z")
        );

        String json = objectMapper.writeValueAsString(response);

        assertThat(json).contains("deliveryAddress");
        assertThat(json).doesNotContain("pickupAddress");
        assertThat(json).doesNotContain("Private chef home address");
        assertThat(json).doesNotContain("private-kitchen@example.com");
        assertThat(json).doesNotContain("+919876543210");
    }

    @Test
    void chefsSeeTheCustomersContactOnlyWhileTheyAnswerCookOrHandOver() {
        CustomerAddressSnapshotResponse dropoff = new CustomerAddressSnapshotResponse(UUID.randomUUID(), "Customer", "+918019166645",
            "Customer address", null, null, "Madhapur", "Hyderabad", "Telangana", "500081", new BigDecimal("17.4483000"), new BigDecimal("78.3915000"));
        for (OrderStatus status : OrderStatus.values()) {
            OrderResponse order = new OrderResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "Home Kitchen",
                status, "INR", new BigDecimal("250.00"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("250.00"), null, 20,
                dropoff, null, List.of(), Instant.parse("2026-07-16T08:00:00Z"), Instant.parse("2026-07-16T08:00:00Z"))
                .withChefDetails(null, "No onions please", null, null);
            boolean active = switch (status) {
                case CHEF_ACCEPTANCE_PENDING, CHEF_ACCEPTED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY -> true;
                default -> false;
            };
            OrderResponse chefCopy = order.forChef();
            assertThat(chefCopy.deliveryAddress()).as(status.name()).isEqualTo(active ? dropoff : null);
            // Everything else the chef needs stays.
            assertThat(chefCopy.customerNote()).as(status.name()).isEqualTo("No onions please");
            assertThat(chefCopy.status()).isEqualTo(status);
            assertThat(chefCopy.prepTimeMinutes()).isEqualTo(20);
        }
    }
}
