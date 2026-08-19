package in.craves.integration.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.payment.RazorpayWebhookInboxService.WorkItem;
import in.craves.integration.service.PaymentService;
import java.math.BigDecimal;
import java.util.Set;
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
    private static final Set<String> SUPPORTED_EVENTS = Set.of(
        "payment.authorized",
        "payment.captured",
        "payment.failed",
        "order.paid"
    );

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
                ProcessingDecision decision = inspect(item.rawPayload());
                if (decision == ProcessingDecision.PROCESS) {
                    paymentService.handleRazorpayWebhook(item.signature(), item.eventIdentity(), item.rawPayload());
                }
                inbox.complete(item);
                LOGGER.info(
                    "Razorpay webhook completed deliveryId={} eventId={} attempt={} decision={}",
                    item.id(), item.eventIdentity(), item.attemptCount(), decision
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

    private ProcessingDecision inspect(String rawBody) {
        JsonNode payload;
        try {
            payload = objectMapper.readTree(rawBody);
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay webhook JSON is invalid");
        }

        String eventType = text(payload, "event");
        if (!StringUtils.hasText(eventType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay webhook event type is missing");
        }
        if (!SUPPORTED_EVENTS.contains(eventType.toLowerCase())) {
            return ProcessingDecision.IGNORE_UNSUPPORTED_EVENT;
        }

        JsonNode payment = payload.at("/payload/payment/entity");
        String paymentId = text(payment, "id");
        String orderId = text(payment, "order_id");
        String currency = text(payment, "currency");
        JsonNode amountNode = payment.get("amount");
        if (!StringUtils.hasText(paymentId) || !StringUtils.hasText(orderId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay payment webhook is missing payment or order identity");
        }

        if ("payment.captured".equalsIgnoreCase(eventType) || "order.paid".equalsIgnoreCase(eventType)) {
            if (!StringUtils.hasText(currency) || amountNode == null || !amountNode.canConvertToLong()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay success webhook is missing money fields");
            }
            BigDecimal amount = RazorpayRequestSafety.fromSubunits(amountNode.longValue());
            paymentClient.verifyCapturedProviderState(paymentId, orderId, amount, currency);
            return ProcessingDecision.PROCESS;
        }

        JsonNode currentOrder = paymentClient.fetchOrder(orderId);
        if ("paid".equalsIgnoreCase(text(currentOrder, "status"))) {
            return ProcessingDecision.IGNORE_STALE_NON_TERMINAL_EVENT;
        }
        return ProcessingDecision.PROCESS;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    enum ProcessingDecision {
        PROCESS,
        IGNORE_STALE_NON_TERMINAL_EVENT,
        IGNORE_UNSUPPORTED_EVENT
    }
}
