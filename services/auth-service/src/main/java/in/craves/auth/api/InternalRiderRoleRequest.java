package in.craves.auth.api;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record InternalRiderRoleRequest(
    @NotNull UUID identityId,
    @NotNull UUID riderId
) {
}
