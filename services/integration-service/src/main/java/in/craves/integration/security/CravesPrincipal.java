package in.craves.integration.security;

import java.util.Set;
import java.util.UUID;

public record CravesPrincipal(UUID identityId, String phoneNumber, Set<String> roles) {
    public boolean hasRole(String role) {
        return roles != null && roles.stream().anyMatch(existing -> existing.equalsIgnoreCase(role));
    }
}
