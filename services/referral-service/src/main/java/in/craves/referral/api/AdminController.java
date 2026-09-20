package in.craves.referral.api;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.domain.CashoutService;
import in.craves.referral.domain.ProgramService;
import in.craves.referral.domain.ReversalService;
import in.craves.referral.infra.InboxService;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.OutboxService;
import in.craves.referral.infra.Store;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import static in.craves.referral.ReferralProblem.require;

@RestController
@RequestMapping("/api/v1/referrals/admin")
public class AdminController {
    private final AdminQueries queries;
    private final ProgramService program;
    private final ReversalService reversals;
    private final CashoutService cashouts;
    private final InboxService inbox;
    private final OutboxService outbox;
    private final Store db;
    public AdminController(AdminQueries queries,ProgramService program,ReversalService reversals,CashoutService cashouts,InboxService inbox,OutboxService outbox,Store db) {
        this.queries=queries; this.program=program; this.reversals=reversals; this.cashouts=cashouts; this.inbox=inbox; this.outbox=outbox; this.db=db;
    }
    private static UUID actor(Authentication auth) { return UUID.fromString(auth.getName()); }
    @GetMapping("/overview") public Object overview(Authentication auth) { return queries.overview(actor(auth)); }
    @GetMapping("/policies") public Object policies() { return queries.policies(); }
    @PostMapping("/policies") public ResponseEntity<?> createPolicy(Authentication auth,HttpServletRequest request) {
        long id=program.createPolicy(actor(auth),ApiBodies.read(request)); return ResponseEntity.status(201).body(Map.of("revision",Long.toString(id),"state","DRAFT"));
    }
    @PostMapping("/policies/{id}/approve") public ResponseEntity<Void> approvePolicy(Authentication auth,@PathVariable long id,HttpServletRequest request) {
        JsonNode body=ApiBodies.read(request); Json.fields(body,"effectiveAt","expectedLatestActivatedRevision");
        program.approvePolicy(actor(auth),id,Json.instant(body,"effectiveAt"),Json.money(body,"expectedLatestActivatedRevision"));
        return ResponseEntity.noContent().build();
    }
    @GetMapping("/queues/{name}") public Object queue(@PathVariable String name,@RequestParam String state,@RequestParam(defaultValue="25") int limit,@RequestParam(required=false) String cursor) {
        return queries.queue(name,state,limit,cursor);
    }
    @GetMapping("/inbox") public Object inbox(@RequestParam(defaultValue="25") int limit,@RequestParam String source,@RequestParam(required=false) UUID afterId) {
        return queries.inbox(limit,source,afterId);
    }
    @PostMapping("/fraud/{id}/resolve") public ResponseEntity<Void> resolveFraud(Authentication auth,@PathVariable UUID id,HttpServletRequest request) {
        JsonNode body=ApiBodies.read(request); Json.fields(body,"result","evidenceRef");
        String result=Json.text(body,"result",12); require(List.of("CLEARED","CONFIRMED").contains(result),422,"INVALID_FRAUD_REVIEW_RESULT");
        program.resolveFraud(actor(auth),id,result.equals("CLEARED"),Json.text(body,"evidenceRef",180)); return ResponseEntity.noContent().build();
    }
    @PostMapping("/rewards/{id}/reverse") public ResponseEntity<Void> reverse(Authentication auth,@PathVariable UUID id,HttpServletRequest request) {
        JsonNode body=ApiBodies.read(request); Json.fields(body,"operationId","amountPaise","reasonCode");
        reversals.manual(actor(auth),id,Json.money(body,"amountPaise"),Json.text(body,"reasonCode",80),Json.uuid(body,"operationId"));
        return ResponseEntity.noContent().build();
    }
    @PostMapping("/cashouts/{id}/approve") public ResponseEntity<Void> approveCashout(Authentication auth,@PathVariable UUID id,HttpServletRequest request) {
        JsonNode body=ApiBodies.read(request); Json.fields(body,"netPaise","withholdingPaise","evidenceRef");
        cashouts.approve(actor(auth),id,Json.money(body,"netPaise"),Json.money(body,"withholdingPaise"),Json.text(body,"evidenceRef",180));
        return ResponseEntity.noContent().build();
    }
    @PostMapping("/inbox/{source}/{id}/replay") public ResponseEntity<Void> replayInbox(Authentication auth,@PathVariable String source,@PathVariable UUID id,HttpServletRequest request) {
        JsonNode body=ApiBodies.read(request); Json.fields(body,"evidenceRef");
        inbox.replay(actor(auth),source,id,Json.text(body,"evidenceRef",180)); return ResponseEntity.noContent().build();
    }
    @PostMapping("/outbox/{id}/replay") public ResponseEntity<Void> replayOutbox(Authentication auth,@PathVariable UUID id,HttpServletRequest request) {
        JsonNode body=ApiBodies.read(request); Json.fields(body,"evidenceRef");
        outbox.replay(actor(auth),id,Json.text(body,"evidenceRef",180)); return ResponseEntity.noContent().build();
    }
    @GetMapping("/audit") public Object audit(@RequestParam(defaultValue="0") long afterId,@RequestParam(defaultValue="100") int limit) { return queries.audit(afterId,limit); }
    @GetMapping("/audit/export") public ResponseEntity<String> export(Authentication auth,@RequestParam(defaultValue="0") long afterId,@RequestParam(defaultValue="500") int limit) {
        Map<String,Object> page=queries.audit(afterId,limit); StringBuilder content=new StringBuilder();
        for(Object item:(List<?>)page.get("items")) content.append(Json.write(item)).append('\n');
        db.audit(actor(auth).toString(),"AUDIT_PAGE_EXPORTED",Long.toString(afterId),Map.of("nextId",page.get("nextId"),"limit",limit));
        return ResponseEntity.ok().contentType(MediaType.valueOf("application/x-ndjson"))
            .header("Content-Disposition","attachment; filename=\"craves-referral-audit-"+afterId+".ndjson\"")
            .header("X-Next-Audit-Id",page.get("nextId").toString()).header("X-Has-More",page.get("hasMore").toString()).body(content.toString());
    }
}
