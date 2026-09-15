package in.craves.integration.web;

import in.craves.integration.payout.RazorpayXPayoutWebhookService;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class RazorpayXPayoutWebhookController {
    private final RazorpayXPayoutWebhookService service;
    public RazorpayXPayoutWebhookController(RazorpayXPayoutWebhookService service) {this.service=service;}
    @PostMapping("/api/v1/webhooks/razorpayx/payouts")
    public Map<String,String> receive(@RequestBody byte[] raw,
        @RequestHeader(value="X-Razorpay-Signature",required=false) String signature,
        @RequestHeader(value="X-Razorpay-Event-Id",required=false) String eventId) {
        return Map.of("status",service.accept(raw,signature,eventId));
    }
}
