package in.craves.referral.api;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralProblem;
import in.craves.referral.erasure.AccountErasureService;
import in.craves.referral.erasure.AccountErasureService.Scope;
import in.craves.referral.infra.Json;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Private calls from the auth-service deletion coordinator; SourceAuthenticationFilter lets only the signed `auth` source reach them. */
@RestController
@RequestMapping("/internal/v1/account-erasure")
public class AccountErasureController {
    private final AccountErasureService erasure;
    public AccountErasureController(AccountErasureService erasure) { this.erasure=erasure; }
    private record Input(UUID requestId,UUID identity,Scope scope) { }

    @PostMapping("/blockers") public Object blockers(HttpServletRequest request) {
        return Map.of("service",AccountErasureService.SERVICE,"blockers",erasure.blockers(read(request,false).identity()));
    }
    /** Only subscription and catalog have work at this step; every other service answers DONE with nothing. */
    @PostMapping("/prepare") public Object prepare(HttpServletRequest request) {
        read(request,true); return Map.of("service",AccountErasureService.SERVICE,"status","DONE","counts",Map.of());
    }
    @PostMapping public ResponseEntity<?> erase(HttpServletRequest request) {
        Input in=read(request,true); var result=erasure.erase(in.requestId(),in.identity(),in.scope());
        return result.done()
            ? ResponseEntity.ok(Map.of("service",AccountErasureService.SERVICE,"status","DONE","counts",result.counts()))
            : ResponseEntity.status(409).body(Map.of("service",AccountErasureService.SERVICE,"status","BLOCKED","blockers",result.blockers()));
    }
    /** A missing field, a bad id or an unknown scope is the caller's mistake: 400, and the body never echoes what was sent. */
    private static Input read(HttpServletRequest request,boolean needsRequestId) {
        JsonNode body=ApiBodies.read(request);
        try {
            Json.fields(body,"requestId","identityId","scope");
            UUID requestId=needsRequestId?Json.uuid(body,"requestId"):null;
            return new Input(requestId,Json.uuid(body,"identityId"),Scope.valueOf(Json.text(body,"scope",16)));
        } catch(ReferralProblem|IllegalArgumentException ex) { throw new ReferralProblem(400,"INVALID_ACCOUNT_ERASURE_REQUEST"); }
    }
}
