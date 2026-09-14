package in.craves.integration.web;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.payout.ManualChefSettlementService;
import in.craves.integration.security.CravesPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/finance")
public class ManualChefSettlementController {
    private final ManualChefSettlementService service;private final ObjectMapper json;
    public ManualChefSettlementController(ManualChefSettlementService service,ObjectMapper json) {
        this.service=service;this.json=json.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,DeserializationFeature.FAIL_ON_TRAILING_TOKENS).enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    }
    @GetMapping("/manual-settlements") public ResponseEntity<List<ManualChefSettlementService.Instruction>> list(@AuthenticationPrincipal CravesPrincipal actor) {return noStore(service.list(actor));}
    @GetMapping("/chefs/{chef}/manual-settlement") public ResponseEntity<ManualChefSettlementService.Balance> balance(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID chef) {return noStore(service.balance(actor,chef));}
    @PostMapping("/chefs/{chef}/manual-settlements") public ResponseEntity<ManualChefSettlementService.Instruction> reserve(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID chef,HttpServletRequest request)throws IOException {
        in.craves.integration.finance.FinancePolicyService.operator(actor);
        return noStore(service.reserveAdmin(actor,chef,read(request,ManualChefSettlementService.Reservation.class)));
    }
    @PostMapping("/manual-settlements/{id}/actions") public ResponseEntity<ManualChefSettlementService.Instruction> action(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID id,HttpServletRequest request)throws IOException {
        in.craves.integration.finance.FinancePolicyService.operator(actor);
        return noStore(service.change(actor,id,read(request,ManualChefSettlementService.Change.class)));
    }
    private <T>T read(HttpServletRequest request,Class<T> type)throws IOException {
        if(request.getContentType()==null || !request.getContentType().toLowerCase(java.util.Locale.ROOT).startsWith("application/json"))throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        byte[] body=request.getInputStream().readNBytes(16385);if(body.length>16384)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        try{return json.readValue(body,type);}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid manual settlement request");}
    }
    private static <T>ResponseEntity<T> noStore(T body){return ResponseEntity.ok().header("Cache-Control","no-store").body(body);}
}
