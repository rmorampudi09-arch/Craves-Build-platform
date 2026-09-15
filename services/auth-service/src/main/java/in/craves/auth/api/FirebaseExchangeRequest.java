package in.craves.auth.api;

import jakarta.validation.constraints.NotBlank;

public record FirebaseExchangeRequest(
    @NotBlank(message = "firebaseIdToken is required")
    String firebaseIdToken,
    Boolean adminSession,
    com.fasterxml.jackson.databind.JsonNode referral
) {
    public FirebaseExchangeRequest(String firebaseIdToken,Boolean adminSession){this(firebaseIdToken,adminSession,null);}
}
