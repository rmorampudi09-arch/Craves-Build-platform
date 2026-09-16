package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CheckoutOperationService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/checkout/operations")
public class CheckoutOperationController {
    private final CheckoutOperationService service;
    public CheckoutOperationController(CheckoutOperationService service) { this.service = service; }
    @PostMapping("/{operationId}")
    public CheckoutOperationDtos.Response execute(@AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID operationId, @Valid @RequestBody CheckoutOperationDtos.Request request) {
        return service.execute(principal, operationId, request);
    }
    @GetMapping("/{operationId}")
    public CheckoutOperationDtos.Response get(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID operationId) {
        return service.get(principal, operationId);
    }
}
