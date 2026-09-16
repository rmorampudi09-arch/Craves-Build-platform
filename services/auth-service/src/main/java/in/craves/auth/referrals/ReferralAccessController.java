package in.craves.auth.referrals;

import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Authoritative, uncached account check after the existing JWT/admin-session filters. */
@RestController
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED", havingValue="true")
public class ReferralAccessController {
    private final AuthIdentityRepository identities;
    private final AuthIdentityRoleRepository roles;
    public ReferralAccessController(AuthIdentityRepository identities, AuthIdentityRoleRepository roles) {
        this.identities=identities; this.roles=roles;
    }
    public record Access(UUID userId, long tokenVersion, String status, List<String> roles) {}
    @GetMapping("/api/v1/auth/referrals/access")
    @Transactional(readOnly=true)
    public ResponseEntity<Access> access(Authentication authentication) {
        if(authentication==null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof CurrentUser actor))
            throw AuthException.unauthorized("AUTHENTICATION_REQUIRED","Authentication required");
        var identity=identities.findById(actor.identityId()).orElseThrow(
            ()->AuthException.unauthorized("ACCESS_TOKEN_REVOKED","Current active account required"));
        if(!"ACTIVE".equals(identity.getStatus()) || actor.tokenVersion()!=identity.getTokenVersion())
            throw AuthException.unauthorized("ACCESS_TOKEN_REVOKED","Current active account required");
        List<String> currentRoles=roles.findRoleCodesByIdentityId(actor.identityId()).stream()
            .filter(role->actor.roles()!=null && actor.roles().contains(role)).distinct().sorted().toList();
        return ResponseEntity.ok().header("Cache-Control","private, no-store").header("Vary","Authorization")
            .body(new Access(actor.identityId(),identity.getTokenVersion(),"ACTIVE",currentRoles));
    }
}
