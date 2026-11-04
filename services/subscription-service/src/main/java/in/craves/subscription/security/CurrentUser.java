package in.craves.subscription.security;

import java.util.List;
import java.util.UUID;

/** deletionPendingScope is the token's deletion_pending claim (CUSTOMER, CHEF or ALL), null when no account deletion is pending. */
public record CurrentUser(UUID identityId, String firebaseUid, String phoneNumber, List<String> roles, String deletionPendingScope) {
    public CurrentUser(UUID identityId, String firebaseUid, String phoneNumber, List<String> roles) {
        this(identityId, firebaseUid, phoneNumber, roles, null);
    }

    /** True while a deletion request covers this side of the account; side is CUSTOMER or CHEF. */
    public boolean deletionPendingFor(String side) {
        return side.equals(deletionPendingScope) || "ALL".equals(deletionPendingScope);
    }

    public boolean hasRole(String role) {
        return roles != null && roles.stream().anyMatch(existing -> existing.equalsIgnoreCase(role));
    }

    public boolean hasAnyRole(String... allowedRoles) {
        if (allowedRoles == null) {
            return false;
        }
        for (String allowedRole : allowedRoles) {
            if (hasRole(allowedRole)) {
                return true;
            }
        }
        return false;
    }
}
