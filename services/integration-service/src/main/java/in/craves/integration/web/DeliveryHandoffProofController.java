package in.craves.integration.web;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.InternalRequestAuthorizer;
import in.craves.integration.delivery.command.DeliveryHandoffProofRepository;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/delivery-handoff-proof")
public class DeliveryHandoffProofController {
    private final InternalRequestAuthorizer authorizer;
    private final DeliveryHandoffProofRepository evidence;

    public DeliveryHandoffProofController(InternalRequestAuthorizer authorizer,
                                          DeliveryHandoffProofRepository evidence) {
        this.authorizer = authorizer;
        this.evidence = evidence;
    }

    @GetMapping("/{jobId}/events/{eventId}")
    public ResponseEntity<Proof> find(
        @RequestHeader(value = "X-Craves-Internal-Secret", required = false) String key,
        @PathVariable UUID jobId, @PathVariable UUID eventId
    ) {
        authorizer.requireValid(key);
        JsonNode event = evidence.find(jobId, eventId).orElse(null);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(new Proof("1.0", jobId, eventId,
                event == null ? "NOT_CONFIRMED" : "COMPLETED", event));
    }

    public record Proof(String proofVersion, UUID deliveryJobId, UUID eventId,
                        String state, JsonNode event) {}
}
