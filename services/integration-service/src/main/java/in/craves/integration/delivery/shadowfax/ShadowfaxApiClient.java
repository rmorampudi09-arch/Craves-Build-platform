package in.craves.integration.delivery.shadowfax;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.ShadowfaxProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
@ConditionalOnProperty(prefix = "craves.providers.shadowfax", name = "enabled", havingValue = "true")
public class ShadowfaxApiClient implements DeliveryProviderAdapter {
    public static final String PROVIDER_ID = "shadowfax";
    static final String AUTH_HEADER = "Authorization";
    private static final DateTimeFormatter SCHEDULED_TIME =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ShadowfaxProperties properties;
    private final ObjectMapper objectMapper;
    private final ShadowfaxStatusMapper statusMapper;
    private final RestClient restClient;

    @Autowired
    public ShadowfaxApiClient(ShadowfaxProperties properties,
                              ObjectMapper objectMapper,
                              ShadowfaxStatusMapper statusMapper,
                              RestClient.Builder builder) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.statusMapper = statusMapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getConnectTimeoutSeconds() * 1000);
        requestFactory.setReadTimeout(properties.getReadTimeoutSeconds() * 1000);
        this.restClient = builder
            .requestFactory(requestFactory)
            .defaultHeader(AUTH_HEADER, authorizationValue(properties.getAuthToken()))
            .build();
    }

    ShadowfaxApiClient(ShadowfaxProperties properties,
                       ObjectMapper objectMapper,
                       ShadowfaxStatusMapper statusMapper,
                       RestClient restClient) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.statusMapper = statusMapper;
        this.restClient = restClient;
    }

    @Override
    public String providerId() {
        return PROVIDER_ID;
    }

    @Override
    public ProviderQuote quote(QuoteRequest request) {
        validateQuote(request);
        JsonNode response = put("/api/v1/order-serviceability/", serviceabilityBody(request));
        boolean serviceable = response.path("serviceable").asBoolean(false);
        BigDecimal fee = decimal(response, "delivery_cost");
        Integer pickupEta = integer(response, "pickup_eta");
        Integer dropEta = integer(response, "drop_eta");
        List<String> warnings = new ArrayList<>();
        if (!serviceable) {
            warnings.add(safeReason(response));
        }
        if (fee == null || fee.signum() < 0) {
            warnings.add("Shadowfax did not return a usable delivery_cost");
        }
        Integer totalEta = pickupEta == null || dropEta == null ? null : pickupEta + dropEta;
        if (totalEta == null) {
            warnings.add("Shadowfax did not return pickup_eta and drop_eta in minutes");
        } else if (totalEta > properties.getMaximumAcceptedEtaMinutes()) {
            warnings.add("Shadowfax total ETA exceeds the configured Craves maximum");
        }

        ObjectNode metadata = objectMapper.createObjectNode();
        putIfPresent(metadata, "pickup_eta_minutes", pickupEta);
        putIfPresent(metadata, "drop_eta_minutes", dropEta);
        putIfPresent(metadata, "total_eta_minutes", totalEta);
        metadata.put("hyperlocal_marketplace", true);
        metadata.set("serviceability", response.deepCopy());

        return new ProviderQuote(
            PROVIDER_ID,
            serviceable && warnings.isEmpty(),
            request.declaredGoodsValue(),
            fee,
            "INR",
            List.copyOf(warnings),
            metadata,
            Instant.now()
        );
    }

    @Override
    public ProviderDelivery create(CreateDeliveryRequest request) {
        Objects.requireNonNull(request, "request is required");
        validateClientReference(request.clientReference());
        validateCreate(request.quoteRequest());
        ProviderQuote selected = Objects.requireNonNull(
            request.selectedQuote(), "Shadowfax create requires the selected serviceability quote"
        );
        if (!selected.available() || !PROVIDER_ID.equals(selected.providerId())) {
            throw new IllegalArgumentException("A current available Shadowfax quote is required");
        }

        Instant attemptedAt = Instant.now();
        try {
            JsonNode response = post("/api/v2/orders/", createBody(request));
            return mapDelivery(requiredData(response), request.quoteRequest().declaredGoodsValue());
        } catch (ShadowfaxApiException ex) {
            if (ex.getCause() instanceof ResourceAccessException
                || (ex.providerStatus() != null && ex.providerStatus().is5xxServerError())) {
                throw new ProviderCreateUncertainException(
                    PROVIDER_ID, request.clientReference(), attemptedAt, ex
                );
            }
            throw ex;
        }
    }

    @Override
    public ProviderDelivery cancel(String providerDeliveryId) {
        long orderId = parseOrderId(providerDeliveryId);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("reason", "Cancelled by Craves seller/order workflow");
        body.put("user", "Seller");
        JsonNode response = put("/api/v2/orders/" + orderId + "/cancel/", body);
        return mapDelivery(requiredData(response), null);
    }

    @Override
    public TrackingSnapshot track(String providerDeliveryId) {
        long orderId = parseOrderId(providerDeliveryId);
        JsonNode response = get("/api/v2/orders/" + orderId + "/status/");
        JsonNode data = requiredData(response);
        ProviderDelivery delivery = mapDelivery(data, decimal(data.path("order_details"), "order_value"));
        JsonNode rider = data.path("rider_details");
        Courier courier = rider.isObject() ? new Courier(
            text(rider, "rider_id"),
            text(rider, "rider_name"),
            text(rider, "rider_phone"),
            null,
            decimal(rider.path("rider_location"), "latitude"),
            decimal(rider.path("rider_location"), "longitude")
        ) : null;
        return new TrackingSnapshot(delivery, courier, Instant.now());
    }

    @Override
    public CreateReconciliationResult reconcileCreate(String clientReference, Instant notBefore) {
        validateClientReference(clientReference);
        Objects.requireNonNull(notBefore, "notBefore is required");
        return CreateReconciliationResult.unsupported(
            "Published Shadowfax HL Marketplace API has no lookup-by-client-order-id operation"
        );
    }

    public void markDispatchReady(String clientReference, Instant readyAt) {
        validateClientReference(clientReference);
        Objects.requireNonNull(readyAt, "readyAt is required");
        ObjectNode body = objectMapper.createObjectNode()
            .put("shipment_ready_timestamp", DateTimeFormatter.ISO_INSTANT.format(readyAt));
        JsonNode response = put("/api/v2/orders/" + clientReference + "/dispatch-ready/", body);
        if (!"done successfully".equalsIgnoreCase(response.path("message").asText(""))) {
            throw new ShadowfaxApiException(null, "Shadowfax rejected dispatch-ready", null);
        }
    }

    private ObjectNode serviceabilityBody(QuoteRequest request) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("pickup_latitude", request.pickup().latitude().toPlainString());
        body.put("pickup_longitude", request.pickup().longitude().toPlainString());
        body.put("drop_latitude", request.dropoff().latitude().toPlainString());
        body.put("drop_longitude", request.dropoff().longitude().toPlainString());
        body.put("paid", "true");
        body.put("stage_of_check", "pre_order");
        body.put("order_value", request.declaredGoodsValue());
        body.put("rain_flag", false);
        body.put("client_surge", 0);
        return body;
    }

    private ObjectNode createBody(CreateDeliveryRequest request) {
        QuoteRequest quote = request.quoteRequest();
        ObjectNode body = objectMapper.createObjectNode();
        body.put("has_tip", false);
        body.put("tip_amount", 0);
        body.put("client_code", properties.getClientCode());

        ObjectNode details = body.putObject("order_details");
        details.put("order_value", quote.declaredGoodsValue());
        details.put("paid", "true");
        details.put("client_order_id", request.clientReference());
        details.put("rain_flag", false);
        if (quote.pickup().requiredStart() != null) {
            details.put("scheduled_time", SCHEDULED_TIME.format(quote.pickup().requiredStart()));
        }
        if (StringUtils.hasText(quote.dropoff().note())) {
            details.putObject("delivery_instruction")
                .put("drop_instruction_text", quote.dropoff().note())
                .put("take_drop_off_picture", false)
                .put("drop_off_picture_mandatory", false)
                .put("client_surge", 0);
        }

        body.set("pickup_details", stopBody(quote.pickup()));
        body.set("drop_details", stopBody(quote.dropoff()));
        ArrayNode items = body.putArray("order_items");
        for (ShipmentItem item : quote.items()) {
            ObjectNode value = items.addObject();
            value.put("id", item.menuItemId().toString());
            value.put("name", item.itemName());
            value.put("price", item.unitPrice());
            value.put("quantity", item.quantity());
        }
        return body;
    }

    private ObjectNode stopBody(Stop stop) {
        ObjectNode value = objectMapper.createObjectNode();
        value.put("name", stop.contactName());
        value.put("contact_number", stop.contactPhone());
        value.put("address", stop.address());
        value.put("latitude", stop.latitude());
        value.put("longitude", stop.longitude());
        value.put("city", stop.city());
        return value;
    }

    private ProviderDelivery mapDelivery(JsonNode data, BigDecimal orderValue) {
        String orderId = requiredText(data, "sfx_order_id");
        String status = requiredText(data, "status");
        return new ProviderDelivery(
            PROVIDER_ID,
            orderId,
            text(data.path("order_details"), "client_order_id"),
            statusMapper.fromProvider(status),
            status,
            orderValue,
            decimal(data, "delivery_cost"),
            text(data, "track_url"),
            data.deepCopy(),
            Instant.now()
        );
    }

    private JsonNode get(String path) {
        try {
            return requireBody(restClient.get().uri(endpoint(path)).retrieve().body(JsonNode.class));
        } catch (RestClientResponseException ex) {
            throw providerError(ex);
        } catch (ResourceAccessException ex) {
            throw new ShadowfaxApiException(null, "Shadowfax API could not be reached", ex);
        }
    }

    private JsonNode post(String path, JsonNode body) {
        try {
            return requireBody(restClient.post().uri(endpoint(path)).body(body).retrieve().body(JsonNode.class));
        } catch (RestClientResponseException ex) {
            throw providerError(ex);
        } catch (ResourceAccessException ex) {
            throw new ShadowfaxApiException(null, "Shadowfax API could not be reached", ex);
        }
    }

    private JsonNode put(String path, JsonNode body) {
        try {
            return requireBody(restClient.put().uri(endpoint(path)).body(body).retrieve().body(JsonNode.class));
        } catch (RestClientResponseException ex) {
            throw providerError(ex);
        } catch (ResourceAccessException ex) {
            throw new ShadowfaxApiException(null, "Shadowfax API could not be reached", ex);
        }
    }

    private ShadowfaxApiException providerError(RestClientResponseException ex) {
        return new ShadowfaxApiException(
            ex.getStatusCode(), "Shadowfax returned HTTP " + ex.getStatusCode().value(), ex
        );
    }

    private URI endpoint(String path) {
        return URI.create(properties.normalizedBaseUrl() + path);
    }

    private static JsonNode requireBody(JsonNode response) {
        if (response == null || !response.isObject()) {
            throw new ShadowfaxApiException(null, "Shadowfax returned an empty or invalid response", null);
        }
        return response;
    }

    private static JsonNode requiredData(JsonNode response) {
        JsonNode data = response.path("data");
        if (!data.isObject()) {
            throw new ShadowfaxApiException(null, "Shadowfax response did not contain data", null);
        }
        return data;
    }

    private static void validateQuote(QuoteRequest request) {
        Objects.requireNonNull(request, "quote request is required");
        validateStop(request.pickup(), "pickup");
        validateStop(request.dropoff(), "dropoff");
        if (request.declaredGoodsValue() == null || request.declaredGoodsValue().signum() <= 0) {
            throw new IllegalArgumentException("Shadowfax order value must be positive");
        }
        String collectionMode = request.paymentCollectionMode();
        if (StringUtils.hasText(collectionMode)
            && !"PREPAID".equals(collectionMode.trim().toUpperCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Craves Shadowfax Hyperlocal supports prepaid orders only");
        }
    }

    private static void validateCreate(QuoteRequest request) {
        validateQuote(request);
        if (request.items() == null || request.items().isEmpty()) {
            throw new IllegalArgumentException("Shadowfax order_items cannot be empty");
        }
        for (ShipmentItem item : request.items()) {
            Objects.requireNonNull(item.menuItemId(), "Shadowfax item id is required");
            if (!StringUtils.hasText(item.itemName()) || item.unitPrice() == null
                || item.unitPrice().signum() < 0 || item.quantity() < 1) {
                throw new IllegalArgumentException("Shadowfax order item is invalid");
            }
        }
    }

    private static void validateStop(Stop stop, String name) {
        Objects.requireNonNull(stop, name + " stop is required");
        if (!StringUtils.hasText(stop.address()) || !StringUtils.hasText(stop.contactName())
            || !StringUtils.hasText(stop.contactPhone()) || !StringUtils.hasText(stop.city())
            || stop.latitude() == null || stop.longitude() == null) {
            throw new IllegalArgumentException(
                "Shadowfax " + name + " requires address, contact, city and coordinates"
            );
        }
    }

    private static void validateClientReference(String value) {
        if (!StringUtils.hasText(value) || value.length() > 64
            || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException(
                "Shadowfax clientReference must be 1-64 letters, digits, underscores or hyphens"
            );
        }
    }

    private static long parseOrderId(String value) {
        if (!StringUtils.hasText(value) || !value.trim().matches("[0-9]+")) {
            throw new IllegalArgumentException("Shadowfax providerDeliveryId must be numeric");
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Shadowfax providerDeliveryId is outside the supported range", ex);
        }
    }

    private static String authorizationValue(String token) {
        String value = token == null ? "" : token.trim();
        return value.regionMatches(true, 0, "Token ", 0, 6) ? value : "Token " + value;
    }

    private static String requiredText(JsonNode node, String field) {
        String value = text(node, field);
        if (!StringUtils.hasText(value)) {
            throw new ShadowfaxApiException(null, "Shadowfax response is missing " + field, null);
        }
        return value;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asText(null);
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        String value = text(node, field);
        try {
            return StringUtils.hasText(value) ? new BigDecimal(value) : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static Integer integer(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.canConvertToInt() ? value.intValue() : null;
    }

    private static void putIfPresent(ObjectNode node, String field, Integer value) {
        if (value != null) {
            node.put(field, value);
        }
    }

    private static String safeReason(JsonNode response) {
        String reason = text(response, "reason");
        return StringUtils.hasText(reason) ? "Shadowfax unavailable: " + reason
            : "Shadowfax reported this route as non-serviceable";
    }

    public static final class ShadowfaxApiException extends RuntimeException {
        private final HttpStatusCode providerStatus;

        ShadowfaxApiException(HttpStatusCode providerStatus, String message, Throwable cause) {
            super(message, cause);
            this.providerStatus = providerStatus;
        }

        public HttpStatusCode providerStatus() {
            return providerStatus;
        }
    }
}
