package in.craves.integration.admin;

import in.craves.integration.payment.RazorpayProductionReadinessService;
import in.craves.integration.payment.RazorpayProductionReadinessService.Snapshot;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/operations/payments/razorpay")
public class AdminRazorpayProductionReadinessController {
    private final RazorpayProductionReadinessService readinessService;

    public AdminRazorpayProductionReadinessController(RazorpayProductionReadinessService readinessService) {
        this.readinessService = readinessService;
    }

    @GetMapping("/readiness")
    public ResponseEntity<Snapshot> readiness() {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(readinessService.snapshot());
    }
}
