package in.craves.integration.delivery.shadowfax;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ShadowfaxWebhookController {
    private final ShadowfaxWebhookService service;

    public ShadowfaxWebhookController(ShadowfaxWebhookService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/webhooks/delivery/shadowfax")
    public ShadowfaxWebhookService.Receipt acceptPost(
        @RequestBody(required = false) String raw,
        @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return service.accept(raw, authorization);
    }

    @PutMapping("/api/v1/webhooks/delivery/shadowfax")
    public ShadowfaxWebhookService.Receipt acceptPut(
        @RequestBody(required = false) String raw,
        @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return service.accept(raw, authorization);
    }
}
