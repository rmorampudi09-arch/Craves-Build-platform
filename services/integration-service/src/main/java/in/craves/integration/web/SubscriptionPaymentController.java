package in.craves.integration.web;

import in.craves.integration.subscription.SubscriptionPaymentModels.CreateSubscriptionPaymentOrderRequest;
import in.craves.integration.subscription.SubscriptionPaymentModels.SubscriptionPaymentResponse;
import in.craves.integration.subscription.SubscriptionPaymentService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/subscription-payments")
public class SubscriptionPaymentController {
    private final SubscriptionPaymentService service;

    public SubscriptionPaymentController(SubscriptionPaymentService service) {
        this.service = service;
    }

    @GetMapping("/invoices/{invoiceId}")
    public SubscriptionPaymentResponse get(
        @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
        @PathVariable UUID invoiceId
    ) {
        return service.getOwned(authorization, invoiceId);
    }

    @PostMapping("/invoices/{invoiceId}/orders")
    public SubscriptionPaymentResponse createOrder(
        @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
        @PathVariable UUID invoiceId,
        @Valid @RequestBody CreateSubscriptionPaymentOrderRequest request
    ) {
        return service.createProviderOrder(authorization, invoiceId, request);
    }
}
