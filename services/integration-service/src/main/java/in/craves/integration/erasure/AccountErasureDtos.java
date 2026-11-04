package in.craves.integration.erasure;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Bodies of the private account-deletion calls the auth-service coordinator makes. */
public final class AccountErasureDtos {
    static final String SERVICE = "integration";

    private AccountErasureDtos() {
    }

    /** ALL is CUSTOMER and CHEF together. */
    public enum Scope { CUSTOMER, CHEF, ALL }

    /** Fields are checked by the controller, so a missing one is answered with a 400 like an unreadable one. */
    public record BlockersRequest(UUID identityId, Scope scope) {
    }

    public record ErasureRequest(UUID requestId, UUID identityId, Scope scope) {
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
