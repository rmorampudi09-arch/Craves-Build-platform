package in.craves.userchef.controller;

import in.craves.userchef.dto.ChefTrustBadgeResponse;
import in.craves.userchef.service.ChefTrustBadgeService;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chefs")
public class ChefTrustBadgeController {
    private final ChefTrustBadgeService service;
    public ChefTrustBadgeController(ChefTrustBadgeService service) { this.service = service; }
    @GetMapping("/{chefId}/trust")
    public ResponseEntity<ChefTrustBadgeResponse> getTrust(@PathVariable UUID chefId) {
        return ResponseEntity.ok(service.getTrust(chefId));
    }
}
