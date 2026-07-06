package in.craves.userchef.security;

import java.util.List;
import java.util.UUID;

public record CurrentUser(
    UUID identityId,
    String firebaseUid,
    String phoneNumber,
    List<String> roles
) {
    public boolean hasRole(String role) {
        return roles != null && roles.stream().anyMatch(existing -> existing.equalsIgnoreCase(role));
    }
}
