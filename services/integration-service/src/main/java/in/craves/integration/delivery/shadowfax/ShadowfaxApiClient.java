package in.craves.integration.delivery.shadowfax;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.ShadowfaxProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Objects;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class ShadowfaxApiClient implements DeliveryProviderAdapter {
    private static final String PROVIDER_ID = "shadowfax";
    private final ShadowfaxProperties properties;
    private final ObjectMapper mapper;
    private final RestClient restClient;

    public ShadowfaxApiClient(ShadowfaxProperties properties,
                              ObjectMapper mapper,
                              RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.mapper = mapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Math.multiplyExact(properties.getConnectTimeoutSeconds(), 1000));
        requestFactory.setReadTimeout(Math.multiplyExact(properties.getReadTimeoutSeconds(), 1000));
        RestClient.Builder builder = restClientBuilder.requestFactory(requestFactory);
        if (StringUtils.hasText(properties.getAuthToken())) {
            builder.defaultHeader("Authorization", "Token " + properties.getAuthToken());
        }
        this.restClient = builder.build();
    }

    ShadowfaxApiClient(ShadowfaxProperties properties, ObjectMapper mapper, RestClient restClient) {
        this.properties = properties;
        this.mapper = mapper;
        this.restClient = restClient;
    }

    @Override public String providerId() { return PROVIDER_ID; }

    @Override
    public ProviderQuote quote(QuoteRequest request) {
        if (!properties.createReady()) {
            return new ProviderQuote(PROVIDER_ID, false, null, null, "INR",
                java.util.List.of("Shadowfax Marketplace create gates are incomplete"),
                mapper.createObjectNode(), Instant.now());
        }
        validate(request);
        ObjectNode metadata = mapper.createObjectNode();
        metadata.put("product", properties.normalizedProduct());
        metadata.put("assignment_status_required", "ALLOTTED");
        metadata.put("quote_id", "shadowfax:" + Instant.now().toEpochMilli());
        return new ProviderQuote(PROVIDER_ID, true, request.declaredGoodsValue(), null, "INR",
            java.util.List.of(), metadata, Instant.now());
    }

    @Override
    public ProviderDelivery create(CreateDeliveryRequest request) {
        requireReady();
        Objects.requireNonNull(request, "request is required");
        String reference = requireReference(request.clientReference());
        validate(request.quoteRequest());
        Instant attempted = Instant.now();
        try {
            JsonNode response = mutate("POST", "/api/v2/orders/", buildOrder(reference, request.quoteRequest()));
            ProviderDelivery delivery = mapOrder(response.path("data").isObject() ? response.path("data") : response);
            if (!reference.equals(text(delivery.providerMetadata(), "client_order_id"))) {
                throw new IllegalStateException("Shadowfax create response client_order_id mismatch");
            }
            return delivery;
        } catch (ShadowfaxApiException ex) {
            if (ambiguousCreateFailure(ex)) {
                throw new ProviderCreateUncertainException(PROVIDER_ID, reference, attempted, ex);
            }
            throw ex;
        } catch (RuntimeException ex) {
            throw new ProviderCreateUncertainException(PROVIDER_ID, reference, attempted, ex);
        }
    }

    @Override
    public ProviderDelivery cancel(String providerDeliveryId) {
        requireReady();
        String id = requireProviderId(providerDeliveryId);
        ObjectNode body = mapper.createObjectNode()
            .put("reason", "Expected a shorter wait time")
            .put("user", "Seller");
        mutate("PUT", "/api/v2/orders/" + id + "/cancel/", body);
        ProviderDelivery reconciled = track(id).delivery();
        if (reconciled.status() != DeliveryStatus.CANCELLED) {
            throw new IllegalStateException("Shadowfax cancellation is not confirmed; fallback remains blocked");
        }
        return reconciled;
    }

    @Override
    public TrackingSnapshot track(String providerDeliveryId) {
        requireReady();
        String id = requireProviderId(providerDeliveryId);
        JsonNode response = get("/api/v2/orders/" + id + "/status/");
        ProviderDelivery delivery = mapOrder(response.path("data").isObject() ? response.path("data") : response);
        JsonNode data = delivery.providerMetadata();
        Courier courier = null;
        if (data != null && (StringUtils.hasText(text(data, "rider_name")) || StringUtils.hasText(text(data, "rider_id")))) {
            courier = new Courier(text(data, "rider_id"), text(data, "rider_name"), text(data, "rider_contact"),
                null, decimal(data, "rider_latitude"), decimal(data, "rider_longitude"));
        }
        return new TrackingSnapshot(delivery, courier, delivery.observedAt());
    }

    private ObjectNode buildOrder(String reference, QuoteRequest request) {
        ObjectNode root = mapper.createObjectNode();
        root.put("client_code", properties.getClientCode());
        ObjectNode details = root.putObject("order_details");
        details.put("order_value", request.declaredGoodsValue() == null ? BigDecimal.ZERO : request.declaredGoodsValue());
        details.put("paid", Boolean.toString(!"COD".equalsIgnoreCase(request.paymentCollectionMode())));
        details.put("client_order_id", reference);
        if (request.pickup().requiredStart() != null) {
            details.put("scheduled_time", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                .withZone(ZoneOffset.UTC)
                .format(request.pickup().requiredStart().toInstant()));
        }
        ObjectNode instruction = details.putObject("delivery_instruction");
        instruction.put("drop_instruction_text", nullToBlank(request.dropoff().note()));
        instruction.put("take_drop_off_picture", false);
        instruction.put("drop_off_picture_mandatory", false);
        root.set("pickup_details", location(request.pickup()));
        root.set("drop_details", location(request.dropoff()));
        ArrayNode items = root.putArray("order_items");
        for (ShipmentItem item : request.items()) {
            items.addObject()
                .put("id", item.menuItemId() == null ? item.itemName() : item.menuItemId().toString())
                .put("name", item.itemName())
                .put("price", item.unitPrice())
                .put("quantity", item.quantity());
        }
        return root;
    }

    private ObjectNode location(Stop stop) {
        ObjectNode node = mapper.createObjectNode();
        node.put("city", required(stop.city(), "city"));
        node.put("contact_number", phone(stop.contactPhone()));
        node.put("name", required(stop.contactName(), "contact name"));
        node.put("address", StringUtils.hasText(stop.addressLine1()) ? stop.addressLine1() : required(stop.address(), "address"));
        node.put("latitude", stop.latitude());
        node.put("longitude", stop.longitude());
        return node;
    }

    private ProviderDelivery mapOrder(JsonNode order) {
        String id = requireProviderId(firstText(order, "sfx_order_id", "id", "order_id"));
        DeliveryStatus status = ShadowfaxStatusMapper.map(order);
        String providerStatus = ShadowfaxStatusMapper.providerStatus(order);
        ObjectNode metadata = order.deepCopy();
        if (!StringUtils.hasText(text(metadata, "client_order_id"))) {
            metadata.put("client_order_id", text(order.path("order_details"), "client_order_id"));
        }
        return new ProviderDelivery(PROVIDER_ID, id, text(order, "client_order_id"), status, providerStatus,
            decimal(order, "order_value"), decimal(order, "delivery_cost"),
            firstText(order, "track_url", "track"), metadata, Instant.now());
    }

    private JsonNode mutate(String method, String path, JsonNode body) {
        try {
            RestClient.RequestBodySpec spec = "POST".equals(method)
                ? restClient.post().uri(properties.normalizedBaseUrl() + path)
                : restClient.put().uri(properties.normalizedBaseUrl() + path);
            JsonNode response = spec.body(body).retrieve().body(JsonNode.class);
            if (response == null) throw new ShadowfaxApiException(null, "Shadowfax returned an empty response", null);
            return response;
        } catch (RestClientResponseException ex) {
            throw new ShadowfaxApiException(ex.getStatusCode(),
                "Shadowfax returned HTTP " + ex.getStatusCode().value(), ex.getResponseBodyAsString(), ex);
        } catch (ResourceAccessException ex) {
            throw new ShadowfaxApiException(null, "Shadowfax API could not be reached", null, ex);
        }
    }

    private static boolean ambiguousCreateFailure(ShadowfaxApiException ex) {
        return ex.getCause() instanceof ResourceAccessException
            || ex.getProviderStatus() == null
            || ex.getProviderStatus().is5xxServerError();
    }

    private JsonNode get(String path) {
        try {
            JsonNode response = restClient.get().uri(properties.normalizedBaseUrl() + path).retrieve().body(JsonNode.class);
            if (response == null) throw new ShadowfaxApiException(null, "Shadowfax returned an empty response", null);
            return response;
        } catch (RestClientResponseException ex) {
            throw new ShadowfaxApiException(ex.getStatusCode(),
                "Shadowfax returned HTTP " + ex.getStatusCode().value(), ex.getResponseBodyAsString(), ex);
        } catch (ResourceAccessException ex) {
            throw new ShadowfaxApiException(null, "Shadowfax API could not be reached", null, ex);
        }
    }

    private void requireReady() {
        if (!properties.createReady()) {
            throw new IllegalStateException("Shadowfax Marketplace create gates are incomplete");
        }
        if (!"MARKETPLACE".equals(properties.normalizedProduct())) {
            throw new IllegalStateException("Shadowfax Dedicated Store product requires separate callback/status mapping verification");
        }
    }

    static void validate(QuoteRequest request) {
        Objects.requireNonNull(request, "delivery request is required");
        validateStop(request.pickup());
        validateStop(request.dropoff());
        if (request.declaredGoodsValue() == null || request.declaredGoodsValue().signum() < 0) {
            throw new IllegalArgumentException("Shadowfax order value is required");
        }
        if (request.items() == null || request.items().isEmpty()) {
            throw new IllegalArgumentException("Shadowfax order items are required");
        }
        if (!request.pickup().city().trim().equalsIgnoreCase(request.dropoff().city().trim())) {
            throw new IllegalArgumentException("Shadowfax hyperlocal requires same-city pickup and drop");
        }
    }

    private static void validateStop(Stop stop) {
        Objects.requireNonNull(stop, "delivery stop is required");
        required(stop.city(), "city");
        required(stop.contactName(), "contact name");
        required(StringUtils.hasText(stop.addressLine1()) ? stop.addressLine1() : stop.address(), "address");
        phone(stop.contactPhone());
        if (stop.latitude() == null || stop.longitude() == null) {
            throw new IllegalArgumentException("Shadowfax latitude and longitude are required");
        }
    }

    static String requireReference(String value) {
        if (!StringUtils.hasText(value) || value.length() > 64 || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("Invalid Shadowfax client_order_id");
        }
        return value.trim();
    }

    static String requireProviderId(String value) {
        if (!StringUtils.hasText(value) || !value.trim().matches("[0-9]+")) {
            throw new IllegalArgumentException("Invalid Shadowfax order id");
        }
        return value.trim();
    }

    private static String phone(String value) {
        String normalized = required(value, "phone").replaceAll("[ ()-]", "");
        if (normalized.startsWith("+91")) normalized = normalized.substring(3);
        if (!normalized.matches("[6-9][0-9]{9}")) {
            throw new IllegalArgumentException("Valid Indian mobile number is required");
        }
        return normalized;
    }

    private static String required(String value, String field) {
        if (!StringUtils.hasText(value)) throw new IllegalArgumentException("Shadowfax " + field + " is required");
        return value.trim();
    }

    private static String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = text(node, field);
            if (StringUtils.hasText(value)) return value;
        }
        return null;
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asText(null);
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        if (node == null || node.path(field).isMissingNode() || node.path(field).isNull()) return null;
        if (node.path(field).isNumber()) return node.path(field).decimalValue();
        try { return new BigDecimal(node.path(field).asText()); } catch (Exception ignored) { return null; }
    }

    private static String nullToBlank(String value) {
        return value == null ? "" : value;
    }

    public static class ShadowfaxApiException extends RuntimeException {
        private final HttpStatusCode providerStatus;
        private final String safeProviderResponse;

        ShadowfaxApiException(HttpStatusCode providerStatus, String message, String safeProviderResponse) {
            this(providerStatus, message, safeProviderResponse, null);
        }

        ShadowfaxApiException(HttpStatusCode providerStatus, String message, String safeProviderResponse, Throwable cause) {
            super(message, cause);
            this.providerStatus = providerStatus;
            this.safeProviderResponse = safeProviderResponse;
        }

        public HttpStatusCode getProviderStatus() { return providerStatus; }
        public String getSafeProviderResponse() { return safeProviderResponse; }
    }
}
