package in.craves.auth.security;

import java.util.List;
import java.util.UUID;

public record CurrentUser(
    UUID identityId,
    String firebaseUid,
    String phoneNumber,
    List<String> roles,
    long tokenVersion
) {
}
