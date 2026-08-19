package in.craves.integration.payment;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.config.RazorpayProviderProperties;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class RazorpayPaymentClient {
    private final RazorpayProviderProperties properties;
    private final RestClient client;

    public RazorpayPaymentClient(RazorpayProviderProperties properties, RestClient.Builder builder) {
        this.properties = properties;
        this.client = builder.clone().baseUrl(properties.baseUrl()).build();
    }

    public CreatedOrder createOrder(String receipt, BigDecimal amount, String currency, Map<String, String> notes) {
        requireCredentials();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("amount", RazorpayRequestSafety.toSubunits(amount));
        request.put("currency", currency);
        request.put("receipt", receipt);
        request.put("notes", notes);
        try {
            JsonNode response = client.post()
                .uri("/v1/orders")
                .headers(this::basicAuth)
                .body(request)
                .retrieve()
                .body(JsonNode.class);
            String orderId = text(response, "id");
            if (!StringUtils.hasText(orderId) || !orderId.startsWith("order_")) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay returned an invalid order identity");
            }
            RazorpayRequestSafety.requireMoney(
                amount, currency, longValue(response, "amount"), text(response, "currency"), "Razorpay order"
            );
            if (!receipt.equals(text(response, "receipt"))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay receipt identity does not match Craves");
            }
            if (!"created".equalsIgnoreCase(text(response, "status"))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay order was not created in the expected state");
            }
            return new CreatedOrder(orderId, text(response, "status"), properties.keyId(), request, response);
        } catch (RestClientResponseException exception) {
            throw providerFailure("Razorpay order creation failed", exception);
        }
    }

    public VerifiedPayment verifyCheckout(
        String expectedOrderId,
        String paymentId,
        String signature,
        BigDecimal expectedAmount,
        String expectedCurrency
    ) {
        requireCredentials();
        if (!StringUtils.hasText(paymentId) || !paymentId.startsWith("pay_")
            || !StringUtils.hasText(signature) || !verifyHex(expectedOrderId + "|" + paymentId, signature, properties.keySecret())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Razorpay payment signature");
        }
        JsonNode payment = fetchPayment(paymentId);
        requirePaymentIdentityAndMoney(payment, paymentId, expectedOrderId, expectedAmount, expectedCurrency);
        if ("authorized".equalsIgnoreCase(text(payment, "status")) && properties.autoCapture()) {
            payment = capture(paymentId, expectedAmount, expectedCurrency);
            requirePaymentIdentityAndMoney(payment, paymentId, expectedOrderId, expectedAmount, expectedCurrency);
        }
        return requireCapturedProviderState(payment, paymentId, expectedOrderId, expectedAmount, expectedCurrency);
    }

    public VerifiedPayment verifyCapturedProviderState(
        String paymentId,
        String expectedOrderId,
        BigDecimal expectedAmount,
        String expectedCurrency
    ) {
        requireCredentials();
        JsonNode payment = fetchPayment(paymentId);
        requirePaymentIdentityAndMoney(payment, paymentId, expectedOrderId, expectedAmount, expectedCurrency);
        return requireCapturedProviderState(payment, paymentId, expectedOrderId, expectedAmount, expectedCurrency);
    }

    public JsonNode fetchPayment(String paymentId) {
        requireCredentials();
        if (!StringUtils.hasText(paymentId) || !paymentId.startsWith("pay_")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Razorpay payment identity");
        }
        try {
            JsonNode payment = client.get().uri("/v1/payments/{paymentId}", paymentId)
                .headers(this::basicAuth).retrieve().body(JsonNode.class);
            if (!paymentId.equals(text(payment, "id"))) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay payment identity does not match the requested payment");
            }
            return payment;
        } catch (RestClientResponseException exception) {
            throw providerFailure("Razorpay payment verification failed", exception);
        }
    }

    public JsonNode fetchOrder(String orderId) {
        requireCredentials();
        if (!StringUtils.hasText(orderId) || !orderId.startsWith("order_")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Razorpay order identity");
        }
        try {
            JsonNode order = client.get().uri("/v1/orders/{orderId}", orderId)
                .headers(this::basicAuth).retrieve().body(JsonNode.class);
            if (!orderId.equals(text(order, "id"))) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay order identity does not match the requested order");
            }
            return order;
        } catch (RestClientResponseException exception) {
            throw providerFailure("Razorpay order verification failed", exception);
        }
    }

    public boolean verifyWebhook(String rawBody, String signature) {
        return StringUtils.hasText(properties.webhookSecret())
            && StringUtils.hasText(signature)
            && rawBody != null
            && verifyHex(rawBody, signature, properties.webhookSecret());
    }

    private VerifiedPayment requireCapturedProviderState(
        JsonNode payment,
        String paymentId,
        String expectedOrderId,
        BigDecimal expectedAmount,
        String expectedCurrency
    ) {
        String status = text(payment, "status");
        if (!"captured".equalsIgnoreCase(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay payment is not captured");
        }
        JsonNode order = fetchOrder(expectedOrderId);
        RazorpayRequestSafety.requireMoney(
            expectedAmount, expectedCurrency, longValue(order, "amount"), text(order, "currency"), "Razorpay paid order"
        );
        if (!"paid".equalsIgnoreCase(text(order, "status"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay order is not paid");
        }
        if (longValue(order, "amount_paid") != RazorpayRequestSafety.toSubunits(expectedAmount)
            || longValue(order, "amount_due") != 0L) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay order paid amount does not match Craves");
        }
        return new VerifiedPayment(paymentId, status, payment, order);
    }

    private void requirePaymentIdentityAndMoney(
        JsonNode payment,
        String expectedPaymentId,
        String expectedOrderId,
        BigDecimal expectedAmount,
        String expectedCurrency
    ) {
        if (!expectedPaymentId.equals(text(payment, "id"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay payment identity does not match Craves");
        }
        if (!expectedOrderId.equals(text(payment, "order_id"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay order identity does not match Craves");
        }
        RazorpayRequestSafety.requireMoney(
            expectedAmount, expectedCurrency, longValue(payment, "amount"), text(payment, "currency"), "Razorpay payment"
        );
    }

    private JsonNode capture(String paymentId, BigDecimal amount, String currency) {
        Map<String, Object> request = Map.of(
            "amount", RazorpayRequestSafety.toSubunits(amount),
            "currency", currency
        );
        try {
            JsonNode response = client.post().uri("/v1/payments/{paymentId}/capture", paymentId)
                .headers(this::basicAuth).body(request).retrieve().body(JsonNode.class);
            if (!paymentId.equals(text(response, "id")) || !"captured".equalsIgnoreCase(text(response, "status"))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay capture did not return the expected captured payment");
            }
            RazorpayRequestSafety.requireMoney(
                amount, currency, longValue(response, "amount"), text(response, "currency"), "Razorpay capture"
            );
            return response;
        } catch (RestClientResponseException exception) {
            throw providerFailure("Razorpay payment capture failed", exception);
        }
    }

    private void basicAuth(HttpHeaders headers) {
        headers.setBasicAuth(properties.keyId(), properties.keySecret(), StandardCharsets.UTF_8);
    }

    private void requireCredentials() {
        if (!properties.paymentExecutionAllowed()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Razorpay payment execution is not enabled");
        }
        if (!properties.hasCredentials()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Razorpay credentials are not configured");
        }
    }

    private static boolean verifyHex(String value, String provided, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder generated = new StringBuilder(digest.length * 2);
            for (byte item : digest) generated.append(String.format("%02x", item & 0xff));
            return MessageDigest.isEqual(
                generated.toString().getBytes(StandardCharsets.UTF_8),
                provided.trim().toLowerCase().getBytes(StandardCharsets.UTF_8)
            );
        } catch (Exception exception) {
            return false;
        }
    }

    private static ResponseStatusException providerFailure(String prefix, RestClientResponseException exception) {
        int status = exception.getStatusCode().value();
        HttpStatus mapped = status == 401 || status == 403 || status == 408 || status == 429 || status >= 500
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.BAD_GATEWAY;
        return new ResponseStatusException(mapped, prefix + " with HTTP " + status);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static long longValue(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || !value.canConvertToLong()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay response is missing " + field);
        }
        return value.longValue();
    }

    public record CreatedOrder(
        String orderId,
        String providerStatus,
        String checkoutKeyId,
        Map<String, Object> request,
        JsonNode response
    ) {}

    public record VerifiedPayment(
        String paymentId,
        String providerStatus,
        JsonNode paymentResponse,
        JsonNode orderResponse
    ) {
        public JsonNode response() { return paymentResponse; }
    }
}
