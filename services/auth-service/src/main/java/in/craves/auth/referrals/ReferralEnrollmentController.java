package in.craves.auth.referrals;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.security.CurrentUser;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralEnrollmentController {
    private final AuthIdentityRepository identities;private final ReferralEnrollment enrollment;private final org.springframework.jdbc.core.JdbcTemplate db;
    public ReferralEnrollmentController(AuthIdentityRepository identities,ReferralEnrollment enrollment,org.springframework.jdbc.core.JdbcTemplate db){this.identities=identities;this.enrollment=enrollment;this.db=db;}
    @PostMapping("/api/v1/auth/referrals/enroll") @Transactional
    public Object enroll(Authentication authentication,@RequestBody com.fasterxml.jackson.databind.JsonNode body){
        if(authentication==null || !(authentication.getPrincipal() instanceof CurrentUser actor))throw AuthException.unauthorized("AUTHENTICATION_REQUIRED","Authentication required");
        ReferralSignup consent=ReferralSignup.parse(body);
        enrollment.validate(consent);
        if(consent.attributionToken()!=null)throw AuthException.conflict("EXISTING_ACCOUNT_PARENT_LOCKED","Existing accounts can join only without a new parent");
        var identity=identities.findById(actor.identityId()).orElseThrow(()->AuthException.unauthorized("IDENTITY_NOT_FOUND","Identity not found"));
        if(!"ACTIVE".equals(identity.getStatus()) || actor.tokenVersion()<identity.getTokenVersion())throw AuthException.unauthorized("ACCOUNT_INACTIVE","Current active account required");
        if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM auth_schema.referral_enrollment WHERE identity_id=?)",Boolean.class,identity.getId())))return Map.of("accepted",true,"status","ALREADY_ENROLLED","userId",identity.getId().toString());
        enrollment.signup(identity,consent);
        return Map.of("accepted",true,"status","QUEUED","userId",identity.getId().toString());
    }
}
