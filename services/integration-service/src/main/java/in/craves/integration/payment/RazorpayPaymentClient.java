package in.craves.integration.payment;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.config.RazorpayProviderProperties;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
            return new CreatedOrder(orderId, text(response, "status"), properties.keyId(), request, response);
        } catch (RestClientResponseException exception) {
            throw providerFailure("Razorpay order creation failed", exception);
        }
    }

    /** Read-only recovery of an uncertain original order; verifies the persisted receipt and amount. */
    public CreatedOrder fetchCreatedOrder(String id,String receipt,BigDecimal amount,String currency) {
        requireCredentials();
        if(id==null || !id.matches("order_[A-Za-z0-9]+"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Original provider order ID required");
        JsonNode response=client.get().uri("/v1/orders/{id}",id).headers(this::basicAuth).retrieve().body(JsonNode.class);
        if(!id.equals(text(response,"id")) || !receipt.equals(text(response,"receipt")))throw new ResponseStatusException(HttpStatus.CONFLICT,"Original provider order context differs");
        RazorpayRequestSafety.requireMoney(amount,currency,longValue(response,"amount"),text(response,"currency"),"Recovered Razorpay order");
        return new CreatedOrder(id,text(response,"status"),properties.keyId(),Map.of("receipt",receipt,"amount",RazorpayRequestSafety.toSubunits(amount),"currency",currency),response);
    }

    /**
     * Read-only catch-up for an existing order whose callback/webhook was missed.
     * Never creates, captures or refunds a payment. Pausing new payment execution
     * does not stop this read; changing the original account binding does.
     */
    public Optional<VerifiedPayment> findCapturedOrderPayment(
        String orderId, BigDecimal amount, String currency, String originalCheckoutKeyId
    ) {
        if (!StringUtils.hasText(properties.keyId()) || !StringUtils.hasText(properties.keySecret())) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Razorpay read credentials are unavailable");
        }
        if (orderId == null || !orderId.matches("order_[A-Za-z0-9]+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Original provider order ID required");
        }
        if (!properties.keyId().equals(originalCheckoutKeyId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Original Razorpay account binding requires review");
        }
        String prefix = properties.production() ? "rzp_live_" : "rzp_test_";
        if (!originalCheckoutKeyId.startsWith(prefix)
            || (properties.production() && !properties.productionActivationApproved())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay recovery environment differs");
        }
        try {
            JsonNode response = client.get().uri("/v1/orders/{id}/payments", orderId)
                .headers(this::basicAuth).retrieve().body(JsonNode.class);
            JsonNode items = response == null ? null : response.get("items");
            if (!"collection".equals(text(response, "entity")) || items == null || !items.isArray()
                || items.size() > 1000 || exactLong(response, "count") != items.size()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay payment collection is incomplete");
            }
            VerifiedPayment captured = null;
            Set<String> seen = new HashSet<>();
            for (JsonNode payment : items) {
                String id = text(payment, "id");
                String status = text(payment, "status");
                if (!"payment".equals(text(payment, "entity")) || id == null
                    || !id.matches("pay_[A-Za-z0-9]+") || !seen.add(id)
                    || !orderId.equals(text(payment, "order_id"))
                    || !Set.of("created", "authorized", "captured", "refunded", "failed").contains(status == null ? "" : status)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay recovery payment identity differs");
                }
                if (!"captured".equals(status)) continue;
                RazorpayRequestSafety.requireMoney(
                    amount, currency, exactLong(payment, "amount"), text(payment, "currency"), "Recovered Razorpay payment"
                );
                JsonNode capturedFlag = payment.get("captured");
                JsonNode refundStatus = payment.get("refund_status");
                if (capturedFlag == null || !capturedFlag.isBoolean() || !capturedFlag.booleanValue()
                    || exactLong(payment, "amount_refunded") != 0
                    || refundStatus == null || !refundStatus.isNull() || captured != null) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay captured payment requires recovery review");
                }
                captured = new VerifiedPayment(id, status, payment);
            }
            return Optional.ofNullable(captured);
        } catch (RestClientResponseException exception) {
            throw providerFailure("Razorpay order-payment recovery failed", exception);
        }
    }

    private static long exactLong(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay recovery field is invalid");
        }
        return value.longValue();
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
        if (!expectedOrderId.equals(text(payment, "order_id"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay order identity does not match Craves");
        }
        RazorpayRequestSafety.requireMoney(
            expectedAmount, expectedCurrency, longValue(payment, "amount"), text(payment, "currency"), "Razorpay payment"
        );
        if ("authorized".equalsIgnoreCase(text(payment, "status")) && properties.autoCapture()) {
            payment = capture(paymentId, expectedAmount, expectedCurrency);
        }
        String status = text(payment, "status");
        if (!"captured".equalsIgnoreCase(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay payment is not captured");
        }
        return new VerifiedPayment(paymentId, status, payment);
    }

    public JsonNode fetchPayment(String paymentId) {
        try {
            return client.get().uri("/v1/payments/{paymentId}", paymentId)
                .headers(this::basicAuth).retrieve().body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            throw providerFailure("Razorpay payment verification failed", exception);
        }
    }

    public boolean verifyWebhook(String rawBody, String signature) {
        return StringUtils.hasText(properties.webhookSecret())
            && StringUtils.hasText(signature)
            && verifyHex(rawBody, signature, properties.webhookSecret());
    }

    private JsonNode capture(String paymentId, BigDecimal amount, String currency) {
        Map<String, Object> request = Map.of(
            "amount", RazorpayRequestSafety.toSubunits(amount),
            "currency", currency
        );
        try {
            return client.post().uri("/v1/payments/{paymentId}/capture", paymentId)
                .headers(this::basicAuth).body(request).retrieve().body(JsonNode.class);
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
        if (!StringUtils.hasText(properties.keyId()) || !StringUtils.hasText(properties.keySecret())) {
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
        HttpStatus mapped = status == 401 || status == 403 ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
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

    public record VerifiedPayment(String paymentId, String providerStatus, JsonNode response) {}
}
