package in.craves.order.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class CheckoutOperationDtos {
    private CheckoutOperationDtos() {}
    public record Request(@NotNull UUID deliveryAddressId, @Size(max=2000) String note,
        @NotNull @Valid ApiDtos.CartSnapshotRequest expectedCart) {}
    public record Response(UUID operationId, String status, UUID checkoutId) {}
}
