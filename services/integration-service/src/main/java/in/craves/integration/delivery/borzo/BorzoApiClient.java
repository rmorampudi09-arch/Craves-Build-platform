package in.craves.integration.delivery.borzo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.BorzoProperties;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.CourierApiUsage;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateRejectedException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class BorzoApiClient implements DeliveryProviderAdapter {
    static final String PROVIDER_ID = "borzo";
    static final String AUTH_HEADER = "X-DV-Auth-Token";
    private static final int MOTORBIKE_VEHICLE_TYPE_ID = 8;
    private static final int MOTORBIKE_MAX_WEIGHT_GRAMS = 20_000;
    private static final DateTimeFormatter BORZO_TIMESTAMP =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");
    private static final Logger log = LoggerFactory.getLogger(BorzoApiClient.class);
    // Borzo's request error codes (Business API 1.8, "Errors") that say the request was refused before any order existed.
    // Not here, so read as "outcome unknown": unexpected_error, service_unavailable, order_is_duplicate and any new code.
    private static final Set<String> NOT_CREATED = Set.of("invalid_parameters", "requests_limit_exceeded", "required_auth_token",
        "invalid_auth_token", "invalid_api_version", "required_api_upgrade", "invalid_api_method", "required_method_post",
        "invalid_post_json", "unapproved_contract", "insufficient_balance", "insufficient_funds", "card_payment_failed",
        "tax_retension_limit", "route_not_found", "total_payment_amount_limit_exceeded", "buyout_not_allowed",
        "insufficient_balance_for_buyout", "buyout_amount_limit_exceeded", "impossible_delivery_fee_calculation");
    // The key, the contract or the wallet: every order is refused until a person fixes it.
    private static final Set<String> ACCOUNT = Set.of("required_auth_token", "invalid_auth_token", "unapproved_contract",
        "insufficient_balance", "insufficient_funds", "card_payment_failed", "tax_retension_limit");
    private static final Set<Integer> REFUSAL_STATUSES = Set.of(400, 401, 403, 404, 422, 429);

    private final BorzoProperties properties;
    private final ObjectMapper objectMapper;
    private final BorzoStatusMapper statusMapper;
    private final RestClient restClient;
    private DeliveryCommandProperties commandProperties;

    @Autowired
    public BorzoApiClient(BorzoProperties properties,
                          ObjectMapper objectMapper,
                          BorzoStatusMapper statusMapper,
                          RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.statusMapper = statusMapper;

        RestClient.Builder configured = restClientBuilder.requestFactory(requestFactory(properties));
        if (StringUtils.hasText(properties.getAuthToken())) {
            configured.defaultHeader(AUTH_HEADER, properties.getAuthToken());
        }
        this.restClient = configured.build();
    }

    /**
     * Sends a request body as a stream, so the JDK never sends a POST a second time on its own (BorzoSendOnceTest). Keep it
     * unbuffered: a buffered body may be re-sent when the server has closed the connection, and the booking made twice.
     */
    static SimpleClientHttpRequestFactory requestFactory(BorzoProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Math.multiplyExact(properties.getConnectTimeoutSeconds(), 1000));
        requestFactory.setReadTimeout(Math.multiplyExact(properties.getReadTimeoutSeconds(), 1000));
        return requestFactory;
    }

    BorzoApiClient(BorzoProperties properties,
                   ObjectMapper objectMapper,
                   BorzoStatusMapper statusMapper,
                   RestClient restClient) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.statusMapper = statusMapper;
        this.restClient = restClient;
    }

    /** The booking journal's switches (booking-journal-enabled, borzo-refusals); without them a refusal is "unknown" as before. */
    @Autowired(required = false)
    public void setCommandProperties(DeliveryCommandProperties commandProperties) {
        this.commandProperties = commandProperties;
    }

    /** is_thermobox_required on the order; event_datetime on callbacks. */
    @Override
    public java.util.Set<Capability> capabilities() {
        return java.util.Set.of(Capability.THERMOBOX, Capability.PROVIDER_EVENT_TIME);
    }

    @Override
    public String providerId() {
        return PROVIDER_ID;
    }

    @Override
    public ProviderQuote quote(QuoteRequest request) {
        requireCreateReady();
        validateQuoteRequest(request);
        JsonNode response = post("/calculate-order", buildOrderRequest(request, null));
        requireSuccessful(response, "Borzo quote");

        JsonNode order = response.path("order");
        List<String> warnings = readWarnings(response);
        boolean hasParameterWarnings = response.path("parameter_warnings").isObject()
            && !response.path("parameter_warnings").isEmpty();
        if (hasParameterWarnings) {
            warnings.add("parameter_warnings=" + response.path("parameter_warnings"));
        }

        return new ProviderQuote(
            PROVIDER_ID,
            warnings.isEmpty(),
            money(order, "payment_amount"),
            money(order, "delivery_fee_amount"),
            "INR",
            List.copyOf(warnings),
            order.deepCopy(),
            Instant.now()
        );
    }

    @Override
    public ProviderDelivery create(CreateDeliveryRequest request) {
        requireCreateReady();
        Objects.requireNonNull(request, "request is required");
        String clientReference = toBorzoClientReference(request.clientReference());
        validateQuoteRequest(request.quoteRequest());
        ObjectNode orderRequest = buildOrderRequest(request.quoteRequest(), clientReference);

        Instant attemptedAt = Instant.now();
        try {
            JsonNode response = post(
                "/create-order",
                orderRequest
            );
            requireSuccessful(response, "Borzo create-order");
            return mapOrder(response.path("order"));
        } catch (RuntimeException ex) {
            if (commandProperties != null && commandProperties.isBookingJournalEnabled() && ex instanceof BorzoApiException refusal) {
                List<String> codes = refusalCodes(refusal);
                int status = refusal.getProviderStatus() == null ? 200 : refusal.getProviderStatus().value();
                if (status == 401 || status == 403 || (codes != null && codes.stream().anyMatch(ACCOUNT::contains))) {
                    log.error("CRAVES_ALERT alert=COURIER_ACCOUNT_REFUSED provider={} status={} code={}", PROVIDER_ID, status,
                        codes == null ? "none" : String.join(",", codes));
                }
                String mode = commandProperties.getBorzoRefusals();
                if (codes != null && !"unknown".equals(mode)) {
                    // During an overload a lookup only deepens it.
                    boolean overloaded = status == 429 || codes.contains("requests_limit_exceeded");
                    throw new ProviderCreateRejectedException(PROVIDER_ID, "verify".equals(mode) && !overloaded,
                        "Borzo refused the booking: " + String.join(",", codes), ex);
                }
            }
            // The request may have reached Borzo even when the reply is 5xx, empty,
            // malformed, or times out. Reconcile the client reference before any retry.
            throw new ProviderCreateUncertainException(
                PROVIDER_ID, clientReference, attemptedAt, ex
            );
        }
    }

    /**
     * The codes of a definite refusal, or null when the outcome is unknown. Definite means Borzo answered is_successful
     * false with only codes that say nothing was created. A failed connection is not: the JDK client may re-send a POST
     * on a stale connection, so an earlier send can have arrived.
     */
    private List<String> refusalCodes(BorzoApiException error) {
        // No status: Borzo answered 2xx and the body said is_successful false.
        if (error.getProviderStatus() != null && !REFUSAL_STATUSES.contains(error.getProviderStatus().value())) {
            return null;
        }
        try {
            JsonNode body = objectMapper.readTree(error.getSafeProviderResponse());
            JsonNode errors = body.path("errors");
            if (!body.path("is_successful").isBoolean() || body.path("is_successful").booleanValue() || !errors.isArray() || errors.isEmpty()) {
                return null;
            }
            List<String> codes = new ArrayList<>();
            errors.forEach(code -> codes.add(code.asText()));
            return NOT_CREATED.containsAll(codes) ? codes : null;
        } catch (Exception unreadable) {
            return null;
        }
    }

    @Override
    public CreateReconciliationResult reconcileCreate(String clientReference, Instant notBefore) {
        requireApiReady();
        validateClientReference(clientReference);
        Objects.requireNonNull(notBefore, "notBefore is required");

        int pageSize = properties.getReconciliationPageSize();
        int offset = 0;
        Instant lowerBound = notBefore.minusSeconds(properties.getReconciliationLookbackSeconds());

        try {
            for (int page = 0; page < properties.getReconciliationMaxPages(); page++) {
                JsonNode response = getOrdersPage(offset, pageSize);
                requireSuccessful(response, "Borzo create reconciliation");

                JsonNode orders = response.path("orders");
                if (!orders.isArray()) {
                    return CreateReconciliationResult.inconclusive(
                        "Borzo orders response did not contain an orders array"
                    );
                }

                Instant oldestCreatedAt = null;
                for (JsonNode order : orders) {
                    if (hasClientReference(order, clientReference)) {
                        return CreateReconciliationResult.found(mapOrder(order));
                    }
                    Instant createdAt = orderCreatedAt(order);
                    if (createdAt != null && (oldestCreatedAt == null || createdAt.isBefore(oldestCreatedAt))) {
                        oldestCreatedAt = createdAt;
                    }
                }

                int returned = orders.size();
                int ordersCount = response.path("orders_count").asInt(-1);
                offset += returned;

                if (returned == 0 || (ordersCount >= 0 && offset >= ordersCount)) {
                    return CreateReconciliationResult.notFound(
                        "All Borzo orders in the bounded result set were checked"
                    );
                }
                if (oldestCreatedAt != null && oldestCreatedAt.isBefore(lowerBound)) {
                    return CreateReconciliationResult.notFound(
                        "Borzo results crossed the uncertain create time window"
                    );
                }
            }
            return CreateReconciliationResult.inconclusive(
                "Borzo reconciliation reached the configured page limit"
            );
        } catch (BorzoApiException ex) {
            return CreateReconciliationResult.inconclusive(safeMessage(ex));
        }
    }

    @Override
    public ProviderDelivery cancel(String providerDeliveryId) {
        requireApiReady();
        long orderId = parseOrderId(providerDeliveryId);
        ObjectNode body = objectMapper.createObjectNode().put("order_id", orderId);
        JsonNode response = post("/cancel-order", body);
        requireSuccessful(response, "Borzo cancel-order");
        return mapOrder(response.path("order"));
    }

    @Override
    public TrackingSnapshot track(String providerDeliveryId) {
        ProviderDelivery delivery = readOrder(providerDeliveryId);
        Courier courier = readCourier(providerDeliveryId);
        return new TrackingSnapshot(delivery, courier, Instant.now());
    }

    /** Webhook-first tracking: GET /courier only for a reading that changes the job and has a rider; else one call, no courier. */
    @Override
    public TrackingSnapshot track(String providerDeliveryId, Predicate<ProviderDelivery> hasNews) {
        ProviderDelivery delivery = readOrder(providerDeliveryId);
        boolean rider = delivery.status() != DeliveryStatus.PENDING && delivery.status() != DeliveryStatus.SEARCHING;
        Courier courier = rider && hasNews.test(delivery) ? readCourier(providerDeliveryId) : null;
        return new TrackingSnapshot(delivery, courier, Instant.now());
    }

    public Courier readCourier(String providerDeliveryId) {
        requireApiReady();
        long orderId = parseOrderId(providerDeliveryId);
        JsonNode courierResponse = get("/courier", orderId);
        requireSuccessful(courierResponse, "Borzo courier");
        return mapCourier(courierResponse.path("courier"));
    }

    /** Reads assignment state without requiring a courier to exist yet. */
    public ProviderDelivery readOrder(String providerDeliveryId) {
        requireApiReady();
        long orderId = parseOrderId(providerDeliveryId);
        JsonNode ordersResponse = get("/orders", orderId);
        requireSuccessful(ordersResponse, "Borzo orders");
        JsonNode orders = ordersResponse.path("orders");
        if (!orders.isArray() || orders.isEmpty()) {
            throw new BorzoApiException(null, "Borzo order was not found", null);
        }

        ProviderDelivery delivery = mapOrder(orders.get(0));
        return delivery;
    }

    private ObjectNode buildOrderRequest(QuoteRequest request, String clientReference) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("type", "standard");
        root.put("matter", request.matter());
        root.put("vehicle_type_id", MOTORBIKE_VEHICLE_TYPE_ID);
        root.put("total_weight_kg", toBorzoWeightKg(request.totalWeightGrams()));
        root.put("is_thermobox_required", request.thermoboxRequired());
        root.put("is_client_notification_enabled", false);
        root.put("is_contact_person_notification_enabled", false);

        ArrayNode points = root.putArray("points");
        points.add(buildPoint(request.pickup(), null));
        points.add(buildPoint(request.dropoff(), clientReference));
        return root;
    }

    private ObjectNode buildPoint(Stop stop, String clientReference) {
        ObjectNode point = objectMapper.createObjectNode();
        point.put("address", stop.address());

        ObjectNode contact = point.putObject("contact_person");
        contact.put("phone", stop.contactPhone());
        putIfText(contact, "name", stop.contactName());

        putIfText(point, "client_order_id", clientReference);
        if (stop.latitude() != null) {
            point.put("latitude", stop.latitude().toPlainString());
        }
        if (stop.longitude() != null) {
            point.put("longitude", stop.longitude().toPlainString());
        }
        if (stop.requiredStart() != null) {
            point.put("required_start_datetime", BORZO_TIMESTAMP.format(stop.requiredStart()));
        }
        if (stop.requiredFinish() != null) {
            point.put("required_finish_datetime", BORZO_TIMESTAMP.format(stop.requiredFinish()));
        }
        putIfText(point, "note", stop.note());
        return point;
    }

    private ProviderDelivery mapOrder(JsonNode order) {
        if (!order.isObject()) {
            throw new BorzoApiException(null, "Borzo response did not contain order data", null);
        }
        String orderId = order.path("order_id").asText(null);
        if (!StringUtils.hasText(orderId)) {
            throw new BorzoApiException(null, "Borzo response did not contain order_id", order.toString());
        }
        return new ProviderDelivery(
            PROVIDER_ID,
            orderId,
            textOrNull(order, "order_name"),
            statusMapper.fromOrder(order),
            providerStatus(order),
            money(order, "payment_amount"),
            money(order, "delivery_fee_amount"),
            trackingUrl(order),
            order.deepCopy(),
            Instant.now()
        );
    }

    private Courier mapCourier(JsonNode courier) {
        if (courier == null || courier.isMissingNode() || courier.isNull() || !courier.isObject()) {
            return null;
        }
        String fullName = Stream.of(
                textOrNull(courier, "name"),
                textOrNull(courier, "middlename"),
                textOrNull(courier, "surname")
            )
            .filter(StringUtils::hasText)
            .reduce((left, right) -> left + " " + right)
            .orElse(null);

        return new Courier(
            textOrNull(courier, "courier_id"),
            fullName,
            textOrNull(courier, "phone"),
            textOrNull(courier, "photo_url"),
            decimalOrNull(courier.path("latitude").asText(null)),
            decimalOrNull(courier.path("longitude").asText(null))
        );
    }

    private JsonNode post(String path, JsonNode body) {
        CourierApiUsage.call(PROVIDER_ID);
        try {
            JsonNode response = restClient.post()
                .uri(endpoint(path))
                .body(body)
                .retrieve()
                .body(JsonNode.class);
            return requireBody(response);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 429) {
                CourierApiUsage.rateLimited(PROVIDER_ID);
            }
            throw new BorzoApiException(ex.getStatusCode(),
                "Borzo returned HTTP " + ex.getStatusCode().value(), ex.getResponseBodyAsString(), ex);
        } catch (ResourceAccessException ex) {
            throw new BorzoApiException(null, "Borzo API could not be reached", null, ex);
        }
    }

    private JsonNode get(String path, long orderId) {
        UriComponentsBuilder uriBuilder = UriComponentsBuilder.fromUriString(properties.normalizedBaseUrl())
            .path(path)
            .queryParam("order_id", orderId);
        if ("/orders".equals(path)) {
            uriBuilder.queryParam("count", 1);
        }
        return get(uriBuilder.build(true).toUri());
    }

    private JsonNode getOrdersPage(int offset, int count) {
        URI uri = UriComponentsBuilder.fromUriString(properties.normalizedBaseUrl())
            .path("/orders")
            .queryParam("offset", offset)
            .queryParam("count", count)
            .build(true)
            .toUri();
        return get(uri);
    }

    private JsonNode get(URI uri) {
        CourierApiUsage.call(PROVIDER_ID);
        try {
            JsonNode response = restClient.get()
                .uri(uri)
                .retrieve()
                .body(JsonNode.class);
            return requireBody(response);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 429) {
                CourierApiUsage.rateLimited(PROVIDER_ID);
            }
            throw new BorzoApiException(ex.getStatusCode(),
                "Borzo returned HTTP " + ex.getStatusCode().value(), ex.getResponseBodyAsString(), ex);
        } catch (ResourceAccessException ex) {
            throw new BorzoApiException(null, "Borzo API could not be reached", null, ex);
        }
    }

    private URI endpoint(String path) {
        return URI.create(properties.normalizedBaseUrl() + path);
    }

    private void requireApiReady() {
        if (!properties.isEnabled()) {
            throw new BorzoApiException(null, "Borzo API integration is disabled", null);
        }
        if (!StringUtils.hasText(properties.getAuthToken())) {
            throw new BorzoApiException(null, "Borzo API auth token is not configured", null);
        }
    }

    private void requireCreateReady() {
        requireApiReady();
        if (!properties.isCreateEnabled()) {
            throw new BorzoApiException(null, "Borzo new bookings are disabled", null);
        }
    }

    private static void validateQuoteRequest(QuoteRequest request) {
        Objects.requireNonNull(request, "quote request is required");
        if (!StringUtils.hasText(request.matter())) {
            throw new IllegalArgumentException("Delivery matter is required");
        }
        if (request.totalWeightGrams() <= 0 || request.totalWeightGrams() > MOTORBIKE_MAX_WEIGHT_GRAMS) {
            throw new IllegalArgumentException(
                "Borzo motorbike delivery weight must be between 1 and 20000 grams"
            );
        }
        validateStop(request.pickup(), "pickup");
        validateStop(request.dropoff(), "dropoff");
    }

    private static int toBorzoWeightKg(int totalWeightGrams) {
        return Math.max(1, (totalWeightGrams + 999) / 1000);
    }

    private static void validateStop(Stop stop, String name) {
        Objects.requireNonNull(stop, name + " stop is required");
        if (!StringUtils.hasText(stop.address())) {
            throw new IllegalArgumentException(name + " address is required");
        }
        if (!StringUtils.hasText(stop.contactPhone())) {
            throw new IllegalArgumentException(name + " contact phone is required");
        }
        if ((stop.latitude() == null) != (stop.longitude() == null)) {
            throw new IllegalArgumentException(name + " latitude and longitude must be supplied together");
        }
        if (stop.requiredStart() != null && stop.requiredFinish() != null
            && stop.requiredFinish().isBefore(stop.requiredStart())) {
            throw new IllegalArgumentException(name + " requiredFinish cannot be before requiredStart");
        }
    }

    private static String toBorzoClientReference(String clientReference) {
        if (!StringUtils.hasText(clientReference)) {
            throw new IllegalArgumentException("clientReference is required");
        }

        if (clientReference.length() <= 32) {
            return clientReference;
        }

        String compactUuid = clientReference.replace("-", "");
        if (compactUuid.length() == 32
            && compactUuid.matches("[0-9a-fA-F]{32}")) {
            return compactUuid;
        }

        throw new IllegalArgumentException(
            "Borzo clientReference cannot exceed 32 characters"
        );
    }

    private static void validateClientReference(String clientReference) {
        if (!StringUtils.hasText(clientReference)) {
            throw new IllegalArgumentException("clientReference is required");
        }
        if (clientReference.length() > 32) {
            throw new IllegalArgumentException("Borzo clientReference cannot exceed 32 characters");
        }
    }

    private static void requireSuccessful(JsonNode response, String operation) {
        if (!response.path("is_successful").asBoolean(false)) {
            throw new BorzoApiException(null, operation + " was rejected", response.toString());
        }
    }

    private static JsonNode requireBody(JsonNode response) {
        if (response == null) {
            throw new BorzoApiException(null, "Borzo returned an empty response", null);
        }
        return response;
    }

    private static List<String> readWarnings(JsonNode response) {
        List<String> warnings = new ArrayList<>();
        JsonNode values = response.path("warnings");
        if (values.isArray()) {
            values.forEach(value -> warnings.add(value.asText()));
        }
        return warnings;
    }

    private static boolean hasClientReference(JsonNode order, String clientReference) {
        JsonNode points = order.path("points");
        if (!points.isArray()) {
            return false;
        }
        for (JsonNode point : points) {
            if (clientReference.equals(point.path("client_order_id").asText(null))) {
                return true;
            }
        }
        return false;
    }

    private static Instant orderCreatedAt(JsonNode order) {
        String value = order.path("created_datetime").asText(null);
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static String providerStatus(JsonNode order) {
        JsonNode points = order.path("points");
        if (points.isArray()) {
            for (int index = points.size() - 1; index >= 0; index--) {
                String status = points.path(index).path("delivery").path("status").asText(null);
                if (StringUtils.hasText(status)) {
                    return status;
                }
            }
        }
        return textOrNull(order, "status");
    }

    private static String trackingUrl(JsonNode order) {
        JsonNode points = order.path("points");
        if (points.isArray()) {
            for (int index = points.size() - 1; index >= 0; index--) {
                String trackingUrl = points.path(index).path("tracking_url").asText(null);
                if (StringUtils.hasText(trackingUrl)) {
                    return trackingUrl;
                }
            }
        }
        return null;
    }

    private static BigDecimal money(JsonNode object, String field) {
        return decimalOrNull(object.path(field).asText(null));
    }

    private static BigDecimal decimalOrNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String textOrNull(JsonNode object, String field) {
        JsonNode value = object.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText(null);
        return StringUtils.hasText(text) ? text : null;
    }

    private static void putIfText(ObjectNode node, String field, String value) {
        if (StringUtils.hasText(value)) {
            node.put(field, value);
        }
    }

    private static long parseOrderId(String providerDeliveryId) {
        if (!StringUtils.hasText(providerDeliveryId)
            || !providerDeliveryId.trim().matches("[0-9]+")) {
            throw new IllegalArgumentException("Borzo providerDeliveryId must be numeric");
        }
        try {
            return Long.parseLong(providerDeliveryId.trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Borzo providerDeliveryId is outside the supported range", ex);
        }
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (!StringUtils.hasText(message)) {
            return error.getClass().getSimpleName();
        }
        String normalized = message.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() <= 500 ? normalized : normalized.substring(0, 500);
    }

    public static class BorzoApiException extends RuntimeException {
        private final HttpStatusCode providerStatus;
        private final String safeProviderResponse;

        BorzoApiException(HttpStatusCode providerStatus, String message, String safeProviderResponse) {
            this(providerStatus, message, safeProviderResponse, null);
        }

        BorzoApiException(HttpStatusCode providerStatus,
                          String message,
                          String safeProviderResponse,
                          Throwable cause) {
            super(message, cause);
            this.providerStatus = providerStatus;
            this.safeProviderResponse = safeProviderResponse;
        }

        public HttpStatusCode getProviderStatus() {
            return providerStatus;
        }

        public String getSafeProviderResponse() {
            return safeProviderResponse;
        }
    }
}
