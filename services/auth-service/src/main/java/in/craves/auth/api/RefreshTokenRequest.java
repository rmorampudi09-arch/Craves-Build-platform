package in.craves.auth.api;

import jakarta.validation.constraints.NotBlank;

public record RefreshTokenRequest(
    @NotBlank(message = "refreshToken is required")
    String refreshToken,
    java.util.UUID requestId
) {
}
