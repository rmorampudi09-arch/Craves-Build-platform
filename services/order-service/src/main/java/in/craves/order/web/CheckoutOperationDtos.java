package in.craves.order.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class CheckoutOperationDtos {
    private CheckoutOperationDtos() {}
    public record Request(@NotNull UUID deliveryAddressId, @Size(max=2000) String note,
        @NotNull @Valid ApiDtos.CartSnapshotRequest expectedCart, com.fasterxml.jackson.databind.JsonNode batchHolds,
        com.fasterxml.jackson.databind.JsonNode promotion, com.fasterxml.jackson.databind.JsonNode menuOptions) {
        public Request(UUID deliveryAddressId, String note, ApiDtos.CartSnapshotRequest expectedCart, com.fasterxml.jackson.databind.JsonNode batchHolds, com.fasterxml.jackson.databind.JsonNode promotion) { this(deliveryAddressId, note, expectedCart, batchHolds, promotion, null); }
        public Request(UUID deliveryAddressId, String note, ApiDtos.CartSnapshotRequest expectedCart, com.fasterxml.jackson.databind.JsonNode batchHolds) { this(deliveryAddressId, note, expectedCart, batchHolds, null); }
        public Request(UUID deliveryAddressId, String note, ApiDtos.CartSnapshotRequest expectedCart) { this(deliveryAddressId, note, expectedCart, null); }
    }
    public record Response(UUID operationId, String status, UUID checkoutId) {}
}
