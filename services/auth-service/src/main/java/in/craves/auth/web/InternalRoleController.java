package in.craves.auth.web;

import in.craves.auth.api.IdentityResponse;
import in.craves.auth.api.InternalChefRoleGrantRequest;
import in.craves.auth.api.InternalRiderRoleRequest;
import in.craves.auth.api.InternalRoleGrantResponse;
import in.craves.auth.config.InternalServiceProperties;
import in.craves.auth.exception.AuthException;
import in.craves.auth.service.AuthService;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/roles")
public class InternalRoleController {
    private static final String INTERNAL_SECRET_HEADER = "X-Craves-Internal-Secret";

    private final AuthService authService;
    private final InternalServiceProperties properties;

    public InternalRoleController(AuthService authService, InternalServiceProperties properties) {
        this.authService = authService;
        this.properties = properties;
    }

    @PostMapping("/chef/grant")
    public InternalRoleGrantResponse grantChefRole(
        @RequestHeader(name = INTERNAL_SECRET_HEADER, required = false) String providedSecret,
        @Valid @RequestBody InternalChefRoleGrantRequest request
    ) {
        requireInternalSecret(providedSecret);
        IdentityResponse identity = authService.grantChefRole(request.identityId(), request.sourceApplicationId());
        return new InternalRoleGrantResponse(identity.id(), identity.roles());
    }

    /**
     * Called by the fleet backend (integration-service) when ops activates a rider.
     * <pre>
     * POST /internal/v1/roles/rider/grant
     * X-Craves-Internal-Secret: &lt;auth-service CRAVES_INTERNAL_SERVICE_SECRET&gt;
     * Content-Type: application/json
     * {"identityId": "&lt;auth identity uuid&gt;", "riderId": "&lt;fleet rider uuid, audit only&gt;"}
     *
     * 200 {"identityId": "...", "roles": ["CUSTOMER", "RIDER"]}   also when RIDER was already held (idempotent)
     * 400 VALIDATION_FAILED | IDENTITY_NOT_FOUND
     * 401 INTERNAL_SECRET_REQUIRED | INTERNAL_SECRET_INVALID      403 INTERNAL_SECRET_NOT_CONFIGURED | IDENTITY_NOT_ACTIVE
     * </pre>
     * RIDER appears in the access token issued at the rider's next sign-in or refresh (access tokens last 15 min).
     */
    @PostMapping("/rider/grant")
    public InternalRoleGrantResponse grantRiderRole(
        @RequestHeader(name = INTERNAL_SECRET_HEADER, required = false) String providedSecret,
        @Valid @RequestBody InternalRiderRoleRequest request
    ) {
        requireInternalSecret(providedSecret);
        IdentityResponse identity = authService.grantRiderRole(request.identityId(), request.riderId());
        return new InternalRoleGrantResponse(identity.id(), identity.roles());
    }

    /**
     * Called by the fleet backend when a rider is deactivated. Same headers, body and errors as grant,
     * except that it works for an account in any status (no IDENTITY_NOT_ACTIVE).
     * <pre>
     * POST /internal/v1/roles/rider/revoke
     * 200 {"identityId": "...", "roles": ["CUSTOMER"]}   also when RIDER was not held (idempotent)
     * </pre>
     * Revocation bumps token_version, so services with token revocation on reject older access tokens and the
     * app refreshes into a token without RIDER. Refresh sessions are kept: customer sign-in is unaffected.
     */
    @PostMapping("/rider/revoke")
    public InternalRoleGrantResponse revokeRiderRole(
        @RequestHeader(name = INTERNAL_SECRET_HEADER, required = false) String providedSecret,
        @Valid @RequestBody InternalRiderRoleRequest request
    ) {
        requireInternalSecret(providedSecret);
        IdentityResponse identity = authService.revokeRiderRole(request.identityId(), request.riderId());
        return new InternalRoleGrantResponse(identity.id(), identity.roles());
    }

    private void requireInternalSecret(String providedSecret) {
        String expectedSecret = properties.getServiceSecret();
        if (!StringUtils.hasText(expectedSecret)) {
            throw AuthException.forbidden("INTERNAL_SECRET_NOT_CONFIGURED", "Internal service secret is not configured");
        }
        if (!StringUtils.hasText(providedSecret)) {
            throw AuthException.unauthorized("INTERNAL_SECRET_REQUIRED", "Internal service secret is required");
        }

        byte[] expected = expectedSecret.getBytes(StandardCharsets.UTF_8);
        byte[] actual = providedSecret.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, actual)) {
            throw AuthException.unauthorized("INTERNAL_SECRET_INVALID", "Internal service secret is invalid");
        }
    }
}
