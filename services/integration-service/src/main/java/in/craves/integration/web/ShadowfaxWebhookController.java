package in.craves.integration.web;

import in.craves.integration.delivery.shadowfax.ShadowfaxWebhookService;
import in.craves.integration.delivery.shadowfax.ShadowfaxWebhookService.WebhookReceipt;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/webhooks/delivery/shadowfax")
public class ShadowfaxWebhookController {
    public static final String CALLBACK_HEADER = "X-Craves-Shadowfax-Token";
    private final ShadowfaxWebhookService service;

    public ShadowfaxWebhookController(ShadowfaxWebhookService service) {
        this.service = service;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public WebhookReceipt accept(
        @RequestHeader(value = CALLBACK_HEADER, required = false) String credential,
        @RequestBody String rawBody
    ) {
        return service.accept(rawBody, credential);
    }
}
