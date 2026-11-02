package in.craves.auth.api;

import java.util.UUID;

/** The sign-in phone and name, for admin lists of people who started a Chef application. */
public record InternalIdentityContactResponse(UUID identityId, String phoneNumber, String displayName) {
    @Override public String toString() { return "InternalIdentityContact[REDACTED]"; }
}
