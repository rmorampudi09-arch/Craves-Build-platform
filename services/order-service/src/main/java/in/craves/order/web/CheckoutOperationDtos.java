package in.craves.order.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class CheckoutOperationDtos {
    private CheckoutOperationDtos() {}
    public record Request(@NotNull UUID deliveryAddressId, @Size(max=2000) String note,
        @NotNull @Valid ApiDtos.CartSnapshotRequest expectedCart, com.fasterxml.jackson.databind.JsonNode batchHolds) {
        public Request(UUID deliveryAddressId, String note, ApiDtos.CartSnapshotRequest expectedCart) { this(deliveryAddressId, note, expectedCart, null); }
    }
    public record Response(UUID operationId, String status, UUID checkoutId) {}
}
