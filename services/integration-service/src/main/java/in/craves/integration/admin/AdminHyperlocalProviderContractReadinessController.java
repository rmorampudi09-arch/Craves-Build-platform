package in.craves.integration.admin;

import in.craves.integration.delivery.production.HyperlocalProviderContractReadinessService;
import in.craves.integration.delivery.production.HyperlocalProviderContractReadinessService.ContractReadinessMatrix;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/operations/delivery-provider-contracts")
public class AdminHyperlocalProviderContractReadinessController {
    private final HyperlocalProviderContractReadinessService readinessService;

    public AdminHyperlocalProviderContractReadinessController(
        HyperlocalProviderContractReadinessService readinessService
    ) {
        this.readinessService = readinessService;
    }

    @GetMapping("/readiness")
    public ResponseEntity<ContractReadinessMatrix> readiness() {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(readinessService.matrix());
    }
}
