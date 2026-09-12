package in.craves.integration.delivery.pidge;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PidgeWebhookController {
    private final PidgeWebhookService service;
    public PidgeWebhookController(PidgeWebhookService service) { this.service = service; }
    @PostMapping("/api/v1/webhooks/delivery/pidge")
    public PidgeWebhookService.Receipt accept(@RequestBody(required = false) String raw,
        @RequestHeader(value = "Authorization", required = false) String authorization) {
        return service.accept(raw, authorization);
    }
}
