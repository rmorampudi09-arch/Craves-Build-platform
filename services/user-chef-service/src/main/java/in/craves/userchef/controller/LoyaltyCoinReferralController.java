package in.craves.userchef.controller;

import in.craves.userchef.dto.LoyaltyCoinReferralResponse;
import in.craves.userchef.service.LoyaltyCoinReferralService;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rewards")
public class LoyaltyCoinReferralController {
    private final LoyaltyCoinReferralService service;
    public LoyaltyCoinReferralController(LoyaltyCoinReferralService service) { this.service = service; }
    @GetMapping
    public ResponseEntity<LoyaltyCoinReferralResponse> getRewards(@RequestParam UUID customerId) {
        return ResponseEntity.ok(service.getRewards(customerId));
    }
}
