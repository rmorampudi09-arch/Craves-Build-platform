package in.craves.supportassistant.security;

import java.util.List;
import java.util.UUID;

public record CurrentUser(UUID identityId, String firebaseUid, String phoneNumber, List<String> roles) {
    public CurrentUser {
        roles = roles == null ? List.of() : List.copyOf(roles);
    }

    public boolean hasRole(String role) {
        return role != null && roles.stream().anyMatch(existing -> existing.equalsIgnoreCase(role));
    }
}
