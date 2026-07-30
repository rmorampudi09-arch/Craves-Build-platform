package in.craves.integration.subscription;

import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.subscription.SubscriptionPaymentModels.CreateSubscriptionPaymentOrderRequest;
import in.craves.integration.subscription.SubscriptionPaymentModels.EventEnvelope;
import in.craves.integration.subscription.SubscriptionPaymentModels.PaymentRequestedData;
import in.craves.integration.subscription.SubscriptionPaymentModels.StatusChangedData;
import in.craves.integration.subscription.SubscriptionPaymentModels.SubscriptionPaymentResponse;
import in.craves.integration.subscription.SubscriptionPaymentRepository.PaymentIntent;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SubscriptionPaymentService {
    private static final Set<String> SUPPORTED_EVENT_VERSIONS = Set.of("v1");

    private final SubscriptionPaymentRepository repository;
    private final SubscriptionPaymentProperties properties;
    private final PaymentProviderProperties provider;
    private final ObjectMapper objectMapper;
    private final RestClient providerClient;
    private final RestClient subscriptionClient;

    public SubscriptionPaymentService(
        SubscriptionPaymentRepository repository,
        SubscriptionPaymentProperties properties,
        PaymentProviderProperties provider,
        ObjectMapper objectMapper,
        RestClient.Builder builder
    ) {
        this.repository = repository;
        this.properties = properties;
        this.provider = provider;
        this.objectMapper = objectMapper;
        this.providerClient = builder.clone().baseUrl(provider.baseUrl()).build();
        this.subscriptionClient = StringUtils.hasText(properties.getSubscriptionServiceBaseUrl())
            ? builder.clone().baseUrl(properties.getSubscriptionServiceBaseUrl()).build()
            : null;
    }

    public boolean acceptRequested(String rawPayload) {
        try {
            JsonNode raw = objectMapper.readTree(rawPayload);
            JavaType type = objectMapper.getTypeFactory().constructParametricType(
                EventEnvelope.class,
                PaymentRequestedData.class
            );
            EventEnvelope<PaymentRequestedData> event = objectMapper.treeToValue(raw, type);
            validate(event);
            return repository.acceptRequest(event, raw);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Subscription payment event is invalid", exception);
        }
    }

    public SubscriptionPaymentResponse getOwned(String authorization, UUID invoiceId) {
        PaymentIntent intent = owned(authorization, invoiceId);
        return repository.response(intent);
    }

    public SubscriptionPaymentResponse createProviderOrder(
        String authorization,
        UUID invoiceId,
        CreateSubscriptionPaymentOrderRequest request
    ) {
        PaymentIntent intent = owned(authorization, invoiceId);
        if ("PAID".equals(intent.status()) || "PAYMENT_PENDING".equals(intent.status())) {
            return repository.response(intent);
        }
        if (!provider.paymentExecutionAllowed()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Cashfree production payment execution is not enabled");
        }
        String orderId = "CRVSUB_" + invoiceId.toString().replace("-", "");
        Map<String, Object> customer = new LinkedHashMap<>();
        customer.put("customer_id", intent.customerIdentityId().toString());
        customer.put("customer_name", request.customerName().trim());
        customer.put("customer_phone", request.customerPhone().trim());
        if (StringUtils.hasText(request.customerEmail())) {
            customer.put("customer_email", request.customerEmail().trim());
        }
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("return_url", returnUrl(request.returnUrl()));
        meta.put("notify_url", provider.webhookUrl());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("order_id", orderId);
        body.put("order_amount", intent.amount());
        body.put("order_currency", intent.currency());
        body.put("customer_details", customer);
        body.put("order_meta", meta);
        body.put("order_note", "Craves subscription invoice " + invoiceId);

        JsonNode response = providerClient.post()
            .uri("/pg/orders")
            .header("x-client-id", provider.clientId())
            .header("x-client-" + "secret", provider.clientKey())
            .header("x-api-version", provider.apiVersion())
            .body(body)
            .retrieve()
            .body(JsonNode.class);
        if (response == null || !StringUtils.hasText(text(response, "payment_session_id"))) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cashfree subscription payment response is incomplete");
        }
        PaymentIntent stored = repository.storeProviderOrder(
            intent.id(),
            text(response, "order_id"),
            text(response, "cf_order_id"),
            text(response, "payment_session_id"),
            text(response, "order_status"),
            objectMapper.valueToTree(body),
            response
        );
        return repository.response(stored);
    }

    public boolean handlesWebhook(JsonNode payload) {
        String orderId = firstText(payload, "/data/order/order_id", "/order/order_id", "/order_id");
        return StringUtils.hasText(orderId) && orderId.startsWith("CRVSUB_");
    }

    public void applyWebhook(JsonNode payload) {
        String orderId = firstText(payload, "/data/order/order_id", "/order/order_id", "/order_id");
        String paymentStatus = firstText(payload, "/data/payment/payment_status", "/payment/payment_status", "/payment_status");
        String providerPaymentId = firstText(payload, "/data/payment/cf_payment_id", "/payment/cf_payment_id", "/cf_payment_id");
        BigDecimal amount = decimal(firstText(payload, "/data/payment/payment_amount", "/payment/payment_amount", "/payment_amount"));
        String currency = firstText(payload, "/data/payment/payment_currency", "/payment/payment_currency", "/payment_currency");
        PaymentIntent intent = repository.findByCashfreeOrder(orderId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription payment intent was not found"));
        if (amount == null || amount.compareTo(intent.amount()) != 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Subscription payment amount does not match invoice");
        }
        if (StringUtils.hasText(currency) && !intent.currency().equalsIgnoreCase(currency)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Subscription payment currency does not match invoice");
        }
        String normalized = switch (paymentStatus == null ? "" : paymentStatus.toUpperCase(Locale.ROOT)) {
            case "SUCCESS" -> "PAID";
            case "FAILED", "USER_DROPPED", "CANCELLED" -> "FAILED";
            default -> "PAYMENT_PENDING";
        };
        StatusChangedData data = new StatusChangedData(
            intent.id(), intent.invoiceId(), intent.subscriptionId(), normalized, paymentStatus,
            providerPaymentId, intent.amount(), intent.currency(), Instant.now()
        );
        ObjectNode event = objectMapper.createObjectNode();
        UUID eventId = UUID.randomUUID();
        event.put("eventId", eventId.toString());
        event.put("eventType", SubscriptionPaymentModels.PAYMENT_STATUS_CHANGED);
        event.put("eventVersion", "v1");
        event.put("occurredAt", data.changedAt().toString());
        event.put("correlationId", intent.invoiceId().toString());
        event.put("causationId", providerPaymentId == null ? eventId.toString() : UUID.nameUUIDFromBytes(providerPaymentId.getBytes()).toString());
        event.put("subject", intent.invoiceId().toString());
        event.set("data", objectMapper.valueToTree(data));
        repository.applyProviderStatus(intent, normalized, paymentStatus, providerPaymentId, event);
    }

    private PaymentIntent owned(String authorization, UUID invoiceId) {
        requireAuthorization(authorization);
        PaymentIntent intent = repository.findByInvoice(invoiceId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription payment was not found"));
        if (subscriptionClient == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Subscription ownership validation is unavailable");
        }
        try {
            subscriptionClient.get()
                .uri("/api/v1/subscriptions/{subscriptionId}", intent.subscriptionId())
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .retrieve()
                .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 401 || exception.getStatusCode().value() == 403) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Customer access token is invalid");
            }
            if (exception.getStatusCode().value() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription payment was not found");
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Subscription ownership validation failed");
        }
        return intent;
    }

    private static void validate(EventEnvelope<PaymentRequestedData> event) {
        if (event == null || event.eventId() == null || event.data() == null
            || !SubscriptionPaymentModels.PAYMENT_REQUESTED.equals(event.eventType())
            || !SUPPORTED_EVENT_VERSIONS.contains(event.eventVersion())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported subscription payment event");
        }
        PaymentRequestedData data = event.data();
        if (data.invoiceId() == null || data.subscriptionId() == null || data.planId() == null
            || data.customerIdentityId() == null || data.cycleStart() == null || data.cycleEnd() == null
            || !data.cycleEnd().isAfter(data.cycleStart()) || data.amount() == null || data.amount().signum() <= 0
            || !StringUtils.hasText(data.currency()) || data.currency().length() != 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Subscription payment event data is incomplete");
        }
    }

    private String returnUrl(String requested) {
        String value = StringUtils.hasText(requested) ? requested.trim() : provider.defaultReturnUrl();
        if (!value.startsWith("https://")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment return URL must use HTTPS");
        }
        return value;
    }

    private static void requireAuthorization(String authorization) {
        if (!StringUtils.hasText(authorization) || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static String firstText(JsonNode node, String... pointers) {
        if (node == null) {
            return null;
        }
        for (String pointer : pointers) {
            JsonNode value = node.at(pointer);
            if (!value.isMissingNode() && !value.isNull() && StringUtils.hasText(value.asText())) {
                return value.asText();
            }
        }
        return null;
    }

    private static BigDecimal decimal(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cashfree payment amount is invalid");
        }
    }
}
