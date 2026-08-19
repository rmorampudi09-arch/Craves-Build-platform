package in.craves.integration.admin;

import in.craves.integration.admin.AdminIntegrationRecoveryService.DeadLetterSnapshot;
import in.craves.integration.admin.AdminIntegrationRecoveryService.RecoverySource;
import in.craves.integration.admin.AdminIntegrationRecoveryService.ReplayResponse;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/operations/recovery/webhooks")
public class AdminIntegrationRecoveryController {
    private final AdminIntegrationRecoveryService recoveryService;

    public AdminIntegrationRecoveryController(AdminIntegrationRecoveryService recoveryService) {
        this.recoveryService = recoveryService;
    }

    @GetMapping("/{source}/{id}")
    public ResponseEntity<DeadLetterSnapshot> investigate(
        Authentication authentication,
        @PathVariable String source,
        @PathVariable UUID id,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader
    ) {
        RecoverySource parsed = RecoverySource.parse(source);
        CravesPrincipal principal = requireReadAccess(authentication, parsed);
        String normalizedReason = validateReason(reason);
        UUID correlationId = correlationId(correlationHeader);
        DeadLetterSnapshot result = recoveryService.investigate(
            parsed,
            id,
            principal.identityId(),
            normalizedReason,
            correlationId
        );
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header("X-Correlation-ID", correlationId.toString())
            .body(result);
    }

    @PostMapping("/{source}/{id}/replay")
    public ResponseEntity<ReplayResponse> replay(
        Authentication authentication,
        @PathVariable String source,
        @PathVariable UUID id,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader
    ) {
        RecoverySource parsed = RecoverySource.parse(source);
        CravesPrincipal principal = requireReplayAccess(authentication, parsed);
        String normalizedReason = validateReason(reason);
        UUID correlationId = correlationId(correlationHeader);
        ReplayResponse result = recoveryService.replay(
            parsed,
            id,
            principal.identityId(),
            normalizedReason,
            correlationId
        );
        return ResponseEntity.accepted()
            .cacheControl(CacheControl.noStore())
            .header("X-Correlation-ID", correlationId.toString())
            .body(result);
    }

    private static CravesPrincipal requireReadAccess(Authentication authentication, RecoverySource source) {
        CravesPrincipal principal = requirePrincipal(authentication);
        boolean allowed = switch (source) {
            case CASHFREE -> principal.hasAnyRole(
                "PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "AUDIT_ADMIN"
            );
            case DELIVERY -> principal.hasAnyRole(
                "PLATFORM_ADMIN", "SUPPORT_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN"
            );
        };
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Recovery investigation role is required");
        }
        return principal;
    }

    private static CravesPrincipal requireReplayAccess(Authentication authentication, RecoverySource source) {
        CravesPrincipal principal = requirePrincipal(authentication);
        boolean allowed = switch (source) {
            case CASHFREE -> principal.hasAnyRole("PLATFORM_ADMIN", "PAYMENTS_ADMIN");
            case DELIVERY -> principal.hasAnyRole("PLATFORM_ADMIN", "OPERATIONS_ADMIN");
        };
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Recovery replay role is required");
        }
        return principal;
    }

    private static CravesPrincipal requirePrincipal(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CravesPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves admin access token is required");
        }
        return principal;
    }

    private static String validateReason(String value) {
        String normalized = value == null ? "" : value.replace('\n', ' ').replace('\r', ' ').trim();
        if (normalized.length() < 10 || normalized.length() > 500) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "X-Admin-Reason must contain 10 to 500 characters"
            );
        }
        return normalized;
    }

    private static UUID correlationId(String value) {
        if (value == null || value.isBlank()) {
            return UUID.randomUUID();
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Correlation-ID must be a UUID");
        }
    }
}
