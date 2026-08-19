package in.craves.integration.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.payment.RazorpayWebhookInboxService.WorkItem;
import in.craves.integration.service.PaymentService;
import java.math.BigDecimal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Component
@ConditionalOnProperty(prefix = "craves.razorpay.webhook", name = "worker-enabled", havingValue = "true")
public class RazorpayWebhookWorker {
    private static final Logger LOGGER = LoggerFactory.getLogger(RazorpayWebhookWorker.class);

    private final RazorpayWebhookInboxService inbox;
    private final RazorpayPaymentClient paymentClient;
    private final PaymentService paymentService;
    private final ObjectMapper objectMapper;

    public RazorpayWebhookWorker(
        RazorpayWebhookInboxService inbox,
        RazorpayPaymentClient paymentClient,
        PaymentService paymentService,
        ObjectMapper objectMapper
    ) {
        this.inbox = inbox;
        this.paymentClient = paymentClient;
        this.paymentService = paymentService;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedDelayString = "${craves.razorpay.webhook.fixed-delay-ms:1000}")
    public void process() {
        for (WorkItem item : inbox.claimBatch()) {
            try {
                verifySuccessStateWhenRequired(item.rawPayload());
                paymentService.handleRazorpayWebhook(item.signature(), item.eventIdentity(), item.rawPayload());
                inbox.complete(item);
                LOGGER.info(
                    "Razorpay webhook processed deliveryId={} eventId={} attempt={}",
                    item.id(), item.eventIdentity(), item.attemptCount()
                );
            } catch (Exception exception) {
                inbox.fail(item, exception);
                LOGGER.warn(
                    "Razorpay webhook processing failed deliveryId={} eventId={} attempt={}",
                    item.id(), item.eventIdentity(), item.attemptCount()
                );
            }
        }
    }

    private void verifySuccessStateWhenRequired(String rawBody) {
        JsonNode payload;
        try {
            payload = objectMapper.readTree(rawBody);
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay webhook JSON is invalid");
        }
        String eventType = text(payload, "event");
        if (!"payment.captured".equalsIgnoreCase(eventType) && !"order.paid".equalsIgnoreCase(eventType)) {
            return;
        }
        JsonNode payment = payload.at("/payload/payment/entity");
        String paymentId = text(payment, "id");
        String orderId = text(payment, "order_id");
        String currency = text(payment, "currency");
        JsonNode amountNode = payment.get("amount");
        if (!StringUtils.hasText(paymentId) || !StringUtils.hasText(orderId)
            || !StringUtils.hasText(currency) || amountNode == null || !amountNode.canConvertToLong()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay success webhook is missing payment identity or money fields");
        }
        BigDecimal amount = RazorpayRequestSafety.fromSubunits(amountNode.longValue());
        paymentClient.verifyCapturedProviderState(paymentId, orderId, amount, currency);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
