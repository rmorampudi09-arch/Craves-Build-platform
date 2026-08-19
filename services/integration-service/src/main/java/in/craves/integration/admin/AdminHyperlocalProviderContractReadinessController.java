package in.craves.integration.admin;

import in.craves.integration.delivery.production.HyperlocalProviderContractReadinessService;
import in.craves.integration.delivery.production.HyperlocalProviderContractReadinessService.ContractReadinessMatrix;
import in.craves.integration.delivery.provider.DeliveryProviderCapabilityRegistry;
import in.craves.integration.delivery.provider.DeliveryProviderCapabilityRegistry.CapabilityMatrix;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/operations/delivery-provider-contracts")
public class AdminHyperlocalProviderContractReadinessController {
    private final HyperlocalProviderContractReadinessService readinessService;
    private final DeliveryProviderCapabilityRegistry capabilityRegistry;

    public AdminHyperlocalProviderContractReadinessController(
        HyperlocalProviderContractReadinessService readinessService,
        DeliveryProviderCapabilityRegistry capabilityRegistry
    ) {
        this.readinessService = readinessService;
        this.capabilityRegistry = capabilityRegistry;
    }

    @GetMapping("/readiness")
    public ResponseEntity<ContractReadinessMatrix> readiness() {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(readinessService.matrix());
    }

    @GetMapping("/capabilities")
    public ResponseEntity<CapabilityMatrix> capabilities() {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(capabilityRegistry.matrix());
    }
}
