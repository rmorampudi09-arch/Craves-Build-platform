package in.craves.referral.api;

import in.craves.referral.domain.BenefitOperations;
import in.craves.referral.infra.InboxService;
import in.craves.referral.infra.OutboxService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/referrals")
public class InternalController {
    private final InboxService inbox;
    private final BenefitOperations operations;
    private final OutboxService outbox;
    public InternalController(InboxService inbox,BenefitOperations operations,OutboxService outbox) {
        this.inbox=inbox; this.operations=operations; this.outbox=outbox;
    }
    @PostMapping("/events") public ResponseEntity<?> events(Authentication authentication,HttpServletRequest request) {
        return ResponseEntity.accepted().body(inbox.receive(authentication.getName(),ApiBodies.read(request)));
    }
    @PostMapping("/operations") public Object operations(Authentication authentication,HttpServletRequest request) {
        return operations.apply(authentication.getName(),ApiBodies.read(request));
    }
    @PostMapping("/outbox/claim") public Object claim(Authentication authentication,HttpServletRequest request) {
        return outbox.claim(authentication.getName(),ApiBodies.read(request));
    }
    @PostMapping("/outbox/ack") public ResponseEntity<Void> acknowledge(Authentication authentication,HttpServletRequest request) {
        outbox.acknowledge(authentication.getName(),ApiBodies.read(request)); return ResponseEntity.noContent().build();
    }
}
