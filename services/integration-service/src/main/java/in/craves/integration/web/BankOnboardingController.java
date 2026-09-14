package in.craves.integration.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.payout.bank.BankOnboardingModels;
import in.craves.integration.payout.bank.BankOnboardingService;
import in.craves.integration.security.CravesPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class BankOnboardingController {
    private final BankOnboardingService service;
    private final ObjectMapper json;
    public BankOnboardingController(BankOnboardingService service,ObjectMapper json) {this.service=service;this.json=json;}
    @GetMapping("/api/v1/chef-onboarding/bank")
    public ResponseEntity<BankOnboardingModels.Status> status(@AuthenticationPrincipal CravesPrincipal actor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(service.status(actor));
    }
    @PostMapping("/api/v1/chef-onboarding/bank")
    public ResponseEntity<BankOnboardingModels.Status> submit(@AuthenticationPrincipal CravesPrincipal actor,@RequestBody byte[] body) {
        var request=bounded(body,BankOnboardingModels.Submission.class);
        return ResponseEntity.ok().header("Cache-Control","no-store").body(service.submit(actor,request));
    }
    @GetMapping("/api/v1/admin/finance/bank-onboarding")
    public BankOnboardingService.Controls controls(@AuthenticationPrincipal CravesPrincipal actor) {return service.controls(actor);}
    @PostMapping("/api/v1/admin/finance/bank-onboarding")
    public BankOnboardingService.Controls configure(@AuthenticationPrincipal CravesPrincipal actor,@RequestBody byte[] body) {
        return service.configure(actor,bounded(body,BankOnboardingService.ControlChange.class));
    }
    private <T>T bounded(byte[] body,Class<T> type) {
        if(body==null || body.length>8192) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"Bank request too large");
        try {return json.readerFor(type).with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(body);}
        catch(Exception e) {throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid bank request");}
    }
}
