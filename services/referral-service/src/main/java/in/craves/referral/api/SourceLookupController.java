package in.craves.referral.api;

import in.craves.referral.ReferralSettings;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import jakarta.servlet.http.HttpServletRequest;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import static in.craves.referral.ReferralProblem.require;

/** Private readiness lookup; never returns contact hashes, ancestry, balances or other users' data. */
@RestController
public class SourceLookupController {
    private final Store db;private final ReferralSettings settings;
    public SourceLookupController(Store db,ReferralSettings settings){this.db=db;this.settings=settings;}
    @PostMapping("/internal/v1/referrals/lookup")
    public Object lookup(Authentication auth,HttpServletRequest request){
        settings.requireEnabled();require("order".equals(auth.getName()),403,"SOURCE_LOOKUP_FORBIDDEN");
        var body=ApiBodies.read(request);Json.fields(body,"requestId","at","userIds");
        UUID id=Json.uuid(body,"requestId");var at=Json.instant(body,"at");
        var users=body.path("userIds");require(users.isArray() && users.size()>0 && users.size()<=101,422,"BOUNDED_PARTICIPANTS_REQUIRED");
        var unique=new HashSet<UUID>();
        for(var user:users){require(user.isTextual() && user.asText().matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"),422,"INVALID_PARTICIPANT");unique.add(UUID.fromString(user.asText()));}
        boolean eligible=true;
        for(var user:unique)if(db.count("SELECT count(*) FROM referral_schema.member WHERE user_id=? AND is_active AND registered_at<=?",user,Store.time(at))!=1)eligible=false;
        var policy=db.rows("SELECT p.id FROM referral_schema.policy p JOIN referral_schema.policy_activation a ON a.policy_id=p.id WHERE a.effective_at<=? ORDER BY a.effective_at DESC LIMIT 1",Store.time(at));
        return Map.of("requestId",id.toString(),"eligible",eligible && !policy.isEmpty(),"policyRevision",policy.isEmpty()?"0":policy.getFirst().get("id").toString());
    }
}
