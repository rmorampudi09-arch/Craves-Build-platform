package in.craves.subscription.erasure;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Bodies of the private account-deletion calls the auth-service coordinator makes. */
public final class AccountErasureDtos {
    static final String SERVICE = "subscription";

    private AccountErasureDtos() {
    }

    /** ALL is CUSTOMER and CHEF together. */
    public enum Scope { CUSTOMER, CHEF, ALL }

    public record BlockersRequest(@NotNull UUID identityId, @NotNull Scope scope) {
    }

    public record ErasureRequest(@NotNull UUID requestId, @NotNull UUID identityId, @NotNull Scope scope) {
    }

    public record Blocker(String code, String detail) {
    }

    public record BlockersResponse(String service, List<Blocker> blockers) {
    }

    /** DONE carries counts, BLOCKED carries blockers; the other field is left out of the JSON. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ErasureResponse(String service, String status, Map<String, Integer> counts, List<Blocker> blockers) {
        public static ErasureResponse done(Map<String, Integer> counts) {
            return new ErasureResponse(SERVICE, "DONE", counts, null);
        }

        public static ErasureResponse blocked(List<Blocker> blockers) {
            return new ErasureResponse(SERVICE, "BLOCKED", null, blockers);
        }
    }
}
