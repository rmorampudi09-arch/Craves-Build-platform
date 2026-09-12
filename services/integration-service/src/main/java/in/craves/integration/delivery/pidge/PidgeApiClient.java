package in.craves.integration.delivery.pidge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.PidgeProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class PidgeApiClient implements DeliveryProviderAdapter {
    private static final String ROOT = "/v1.0/store/channel/vendor";
    private final PidgeProperties properties;
    private final PidgeTransport transport;
    private final PidgeBookingRepository bookings;
    private final ObjectMapper mapper;

    public PidgeApiClient(PidgeProperties properties, PidgeTransport transport,
                          PidgeBookingRepository bookings, ObjectMapper mapper) {
        this.properties = properties;
        this.transport = transport;
        this.bookings = bookings;
        this.mapper = mapper;
    }
    @Override public String providerId() { return "pidge"; }

    /** Chargeable provider quote; does not create an order or dispatch a rider. */
    public ProviderQuote readOnlyQuote(QuoteRequest request) {
        validate(request);
        JsonNode body = buildQuote(request);
        JsonNode response = transport.quote(body);
        List<JsonNode> candidates = immediateCandidates(response);
        if (candidates.isEmpty()) return new ProviderQuote(providerId(), false, null, null, "INR",
            List.of("Pidge returned no available immediate-delivery partner"), mapper.createObjectNode(), Instant.now());
        JsonNode selected = candidates.getFirst();
        ObjectNode metadata = mapper.createObjectNode();
        metadata.put("network_id", selected.path("network_id").asText());
        metadata.put("service", selected.path("service").asText());
        metadata.put("network_name", selected.path("network_name").asText());
        metadata.put("pickup_now", true);
        metadata.put("hyperlocal", true);
        metadata.put("parcel_minimum_volumetric_weight_grams", properties.getDefaultVolumetricWeightGrams());
        metadata.put("route_fingerprint", fingerprint(body.toString()));
        metadata.put("quote_id", "pidge:" + selected.path("network_id").asText() + ":" + Instant.now().toEpochMilli());
        JsonNode eta = selected.path("quote").path("eta");
        if (eta.path("pickup_min").isNumber()) metadata.set("pickup_eta_minutes", eta.path("pickup_min"));
        if (eta.path("drop_min").isNumber()) metadata.set("delivery_eta_minutes", eta.path("drop_min"));
        // No serviceability tokens or personal addresses enter quote audit metadata.
        return new ProviderQuote(providerId(), true, request.declaredGoodsValue(), price(selected), "INR",
            List.of(), metadata, Instant.now());
    }

    @Override public ProviderQuote quote(QuoteRequest request) {
        if (!properties.productionCreateReady()) return new ProviderQuote(providerId(), false, null, null, "INR",
            List.of("Pidge production creation is not enabled"), mapper.createObjectNode(), Instant.now());
        return readOnlyQuote(request);
    }

    @Override public ProviderDelivery create(CreateDeliveryRequest request) {
        if (!properties.productionCreateReady()) throw new IllegalStateException("Pidge production gates are incomplete");
        Objects.requireNonNull(request);
        validate(request.quoteRequest());
        String reference = required(request.clientReference(), "client reference");
        if (reference.length() > 200) throw new IllegalArgumentException("Pidge reference is too long");
        ProviderQuote selected = Objects.requireNonNull(request.selectedQuote(), "Pidge selected quote is required");
        if (!providerId().equals(selected.providerId()) || !selected.available() || selected.deliveryFeeAmount() == null
            || selected.quotedAt() == null || Duration.between(selected.quotedAt(), Instant.now()).abs().toSeconds() > 120
            || selected.providerMetadata() == null
            || !fingerprint(buildQuote(request.quoteRequest()).toString()).equals(selected.providerMetadata().path("route_fingerprint").asText()))
            throw new IllegalArgumentException("Pidge requires a fresh quote for this exact route and package");
        String network = required(selected.providerMetadata().path("network_id").asText(), "network");
        String service = required(selected.providerMetadata().path("service").asText(), "service");
        Instant attempted = Instant.now();
        if (!bookings.claim(reference)) {
            PidgeBookingRepository.Booking prior = bookings.find(reference).orElseThrow();
            if ("FULFILLED".equals(prior.state()) && prior.id() != null) return track(prior.id()).delivery();
            if ("REJECTED".equals(prior.state()) || "CANCELLED".equals(prior.state()))
                throw new IllegalStateException("Pidge booking was already rejected or cancelled");
            throw uncertain(reference, attempted);
        }
        String id;
        try {
            JsonNode response = transport.mutate(ROOT + "/order", buildOrder(reference, request.quoteRequest()));
            id = requiredId(response.path("data").path(reference).asText(null));
            bookings.recordCreated(reference, id);
        } catch (PidgeTransport.ApiException ex) {
            if (!ex.uncertain()) { bookings.mark(reference, "REJECTED"); throw ex; }
            throw uncertain(reference, attempted);
        } catch (RuntimeException ex) { throw uncertain(reference, attempted); }

        // Once an order exists, every failure blocks fallback until its cancellation is confirmed.
        try {
            JsonNode current = getOrder(id);
            if (!"PENDING".equals(PidgeStatusMapper.providerStatus(current))) throw uncertain(reference, attempted);
            JsonNode availability = transport.get(ROOT + "/order/fulfillment/services?ids=" + id);
            JsonNode exact = immediateCandidates(availability).stream()
                .filter(c -> network.equals(c.path("network_id").asText()) && service.equals(c.path("service").asText()))
                .filter(c -> price(c).compareTo(selected.deliveryFeeAmount()) <= 0)
                .filter(c -> StringUtils.hasText(c.path("token").asText(null))).findFirst().orElse(null);
            if (exact == null) {
                ProviderDelivery cancelled = cancel(id);
                if (cancelled.status() != DeliveryStatus.CANCELLED) throw uncertain(reference, attempted);
                bookings.mark(reference, "CANCELLED");
                throw new BookingRejectedException();
            }
            ObjectNode fulfill = mapper.createObjectNode();
            fulfill.putArray("ids").add(id);
            fulfill.put("network_id", network).put("service", service).put("pickup_now", true)
                .put("token", exact.path("token").asText());
            transport.mutate(ROOT + "/order/fulfill", fulfill);
            ProviderDelivery result = track(id).delivery();
            if (result.status() == DeliveryStatus.PENDING || result.status() == DeliveryStatus.UNKNOWN
                || result.status() == DeliveryStatus.CANCELLED)
                throw uncertain(reference, attempted);
            bookings.mark(reference, "FULFILLED");
            return result;
        } catch (BookingRejectedException ex) { throw ex; }
        catch (RuntimeException ex) { throw uncertain(reference, attempted); }
    }

    @Override public ProviderDelivery cancel(String id) {
        if (!properties.isEnabled() || !properties.isProductionActivationApproved())
            throw new IllegalStateException("Pidge cancellation is not authorized in runtime configuration");
        id = requiredId(id);
        transport.mutate(ROOT + "/" + id + "/cancel", mapper.createObjectNode());
        return track(id).delivery();
    }

    @Override public TrackingSnapshot track(String id) {
        JsonNode order = getOrder(requiredId(id));
        ProviderDelivery delivery = mapOrder(order);
        JsonNode rider = order.path("fulfillment").path("rider");
        Courier courier = rider.isObject() ? new Courier(rider.path("id").asText(null), rider.path("name").asText(null),
            rider.path("mobile").asText(null), null, null, null) : null;
        // Status polling does not infer current rider coordinates from pickup/drop checkpoint locations.
        return new TrackingSnapshot(delivery, courier, delivery.observedAt());
    }

    @Override public CreateReconciliationResult reconcileCreate(String reference, Instant notBefore) {
        PidgeBookingRepository.Booking booking = bookings.find(reference).orElse(null);
        if (booking != null && "REJECTED".equals(booking.state()))
            return CreateReconciliationResult.notFound("Pidge explicitly rejected the original create request");
        String id = booking == null ? null : booking.id();
        if (id == null) {
            List<String> ids = bookings.webhookOrderIds(reference, notBefore);
            if (ids.size() != 1) return CreateReconciliationResult.inconclusive(
                "No unique authenticated Pidge webhook identifies the uncertain create; retry and fallback remain blocked");
            id = ids.getFirst();
        }
        JsonNode order = getOrder(requiredId(id));
        if (!reference.equals(order.path("dd_channel").path("order_id").asText()))
            return CreateReconciliationResult.inconclusive("Pidge order reference did not match the command");
        ProviderDelivery delivery = mapOrder(order);
        if (delivery.status() == DeliveryStatus.CANCELLED)
            return CreateReconciliationResult.notFound("Pidge order is confirmed cancelled and cannot dispatch");
        if (delivery.status() == DeliveryStatus.PENDING || delivery.status() == DeliveryStatus.UNKNOWN)
            return CreateReconciliationResult.inconclusive("Pidge order exists but fulfilment is not confirmed; operations review required");
        bookings.recordCreated(reference, id);
        bookings.mark(reference, "FULFILLED");
        return CreateReconciliationResult.found(delivery);
    }

    JsonNode getOrder(String id) {
        JsonNode order = transport.get(ROOT + "/order/" + id).path("data");
        if (!order.isObject() || !id.equals(order.path("id").asText()))
            throw new IllegalStateException("Pidge tracking response identity mismatch");
        return order;
    }

    ProviderDelivery mapOrder(JsonNode order) {
        String id = requiredId(order.path("id").asText(null));
        Instant observed = Instant.parse(required(order.path("updated_at").asText(null), "order update timestamp"));
        JsonNode fulfillment = order.path("fulfillment");
        ObjectNode metadata = mapper.createObjectNode();
        metadata.put("pidge_order_id", id);
        metadata.put("network_name", fulfillment.path("channel").path("name").asText());
        metadata.put("provider_status", PidgeStatusMapper.providerStatus(order));
        metadata.set("fulfillment", fulfillment.deepCopy());
        return new ProviderDelivery(providerId(), id, order.path("reference_id").asText(null), PidgeStatusMapper.map(order),
            PidgeStatusMapper.providerStatus(order), decimal(order.path("bill_amount")), decimal(fulfillment.path("delivery_charge")),
            null, metadata, observed);
    }

    ObjectNode buildQuote(QuoteRequest request) {
        ObjectNode body = mapper.createObjectNode();
        body.set("pickup", quoteLocation(request.pickup()));
        ObjectNode drop = body.putArray("drop").addObject().put("ref", "craves-drop");
        drop.set("location", quoteLocation(request.dropoff()));
        drop.putObject("attributes").put("cod_amount", 0).put("weight", request.totalWeightGrams())
            .put("volumetric_weight", properties.getDefaultVolumetricWeightGrams());
        return body;
    }

    ObjectNode buildOrder(String reference, QuoteRequest request) {
        ObjectNode body = mapper.createObjectNode().put("channel", properties.getChannel());
        body.set("sender_detail", stop(request.pickup()));
        body.putObject("poc_detail").put("name", request.pickup().contactName()).put("mobile", phone(request.pickup().contactPhone()));
        ObjectNode trip = body.putArray("trips").addObject();
        trip.set("receiver_detail", stop(request.dropoff()));
        trip.put("source_order_id", reference).put("reference_id", reference).put("order_category", "food")
            .put("cod_amount", 0).put("bill_amount", request.declaredGoodsValue());
        if (request.pickup().requiredStart() != null) trip.put("promised_prep_time", request.pickup().requiredStart().toInstant().toString());
        trip.putArray("packages").addObject().put("label", required(request.matter(), "package description"))
            .put("quantity", 1).put("dead_weight", request.totalWeightGrams())
            .put("volumetric_weight", properties.getDefaultVolumetricWeightGrams());
        var products = trip.putArray("products");
        for (ShipmentItem item : request.items()) products.addObject().put("name", item.itemName())
            .put("sku", item.menuItemId() == null ? item.itemName() : item.menuItemId().toString())
            .put("price", item.unitPrice()).put("quantity", item.quantity());
        return body;
    }

    private ObjectNode quoteLocation(Stop stop) {
        ObjectNode node = mapper.createObjectNode().put("pincode", stop.postalCode());
        node.putObject("coordinates").put("latitude", stop.latitude()).put("longitude", stop.longitude());
        return node;
    }
    private ObjectNode stop(Stop stop) {
        ObjectNode node = mapper.createObjectNode().put("name", stop.contactName()).put("mobile", phone(stop.contactPhone()));
        ObjectNode address = node.putObject("address");
        address.put("address_line_1", StringUtils.hasText(stop.addressLine1()) ? stop.addressLine1() : stop.address())
            .put("city", stop.city()).put("state", stop.state()).put("country", "India").put("pincode", stop.postalCode())
            .put("latitude", stop.latitude()).put("longitude", stop.longitude());
        if (StringUtils.hasText(stop.addressLine2())) address.put("address_line_2", stop.addressLine2());
        if (StringUtils.hasText(stop.landmark())) address.put("landmark", stop.landmark());
        if (StringUtils.hasText(stop.note())) address.put("instructions_to_reach", stop.note());
        return node;
    }

    static void validate(QuoteRequest request) {
        Objects.requireNonNull(request, "delivery request");
        validateStop(request.pickup()); validateStop(request.dropoff());
        if (!request.pickup().city().trim().equalsIgnoreCase(request.dropoff().city().trim()))
            throw new IllegalArgumentException("Pidge food delivery is limited to same-city routes");
        if (request.totalWeightGrams() <= 0 || request.thermoboxRequired())
            throw new IllegalArgumentException("Pidge requires measured weight and cannot guarantee thermobox service");
        if (!"PREPAID".equalsIgnoreCase(request.paymentCollectionMode()))
            throw new IllegalArgumentException("Pidge integration currently requires a verified prepaid order");
        if (request.declaredGoodsValue() == null || request.declaredGoodsValue().signum() < 0)
            throw new IllegalArgumentException("Pidge declared goods value is required");
        if (request.items() == null || request.items().isEmpty()) throw new IllegalArgumentException("Pidge food items are required");
        for (ShipmentItem item : request.items()) if (item == null || !StringUtils.hasText(item.itemName())
            || item.unitPrice() == null || item.unitPrice().signum() < 0 || item.quantity() <= 0)
            throw new IllegalArgumentException("Pidge food item is invalid");
    }
    private static void validateStop(Stop stop) {
        Objects.requireNonNull(stop, "delivery stop");
        required(stop.city(), "city"); required(stop.state(), "state"); required(stop.contactName(), "contact name");
        required(StringUtils.hasText(stop.addressLine1()) ? stop.addressLine1() : stop.address(), "address");
        if (stop.postalCode() == null || !stop.postalCode().matches("[1-9][0-9]{5}"))
            throw new IllegalArgumentException("Valid Indian pincode is required");
        if (stop.latitude() == null || stop.longitude() == null || stop.latitude().abs().compareTo(BigDecimal.valueOf(90)) > 0
            || stop.longitude().abs().compareTo(BigDecimal.valueOf(180)) > 0
            || (stop.latitude().signum() == 0 && stop.longitude().signum() == 0))
            throw new IllegalArgumentException("Valid delivery coordinates are required");
        if (StringUtils.hasText(stop.country()) && !List.of("IN", "INDIA").contains(stop.country().toUpperCase(java.util.Locale.ROOT)))
            throw new IllegalArgumentException("Pidge supports Indian delivery stops only");
        phone(stop.contactPhone());
    }
    static List<JsonNode> immediateCandidates(JsonNode response) {
        List<JsonNode> result = new ArrayList<>();
        JsonNode items = response.path("data").path("items");
        if (!items.isArray()) throw new IllegalStateException("Pidge did not return a serviceability items array");
        for (JsonNode item : items) if (item.path("pickup_now").isBoolean() && item.path("pickup_now").booleanValue()
            && !item.hasNonNull("error") && StringUtils.hasText(item.path("network_id").asText(null))
            && StringUtils.hasText(item.path("service").asText(null)) && !"self".equalsIgnoreCase(item.path("service").asText())
            && !"captive".equalsIgnoreCase(item.path("service").asText())
            && price(item) != null && price(item).signum() >= 0) result.add(item);
        result.sort(Comparator.comparing(PidgeApiClient::price).thenComparing(i -> i.path("network_id").asText())
            .thenComparing(i -> i.path("service").asText()));
        return result;
    }
    static BigDecimal price(JsonNode item) { return decimal(item.path("quote").path("price")); }
    static BigDecimal decimal(JsonNode node) { return node.isNumber() ? node.decimalValue() : null; }
    static String required(String value, String field) {
        if (!StringUtils.hasText(value)) throw new IllegalArgumentException("Pidge " + field + " is required");
        return value.trim();
    }
    static String requiredId(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,200}")) throw new IllegalArgumentException("Invalid Pidge order id");
        return id;
    }
    static String phone(String value) {
        String normalized = required(value, "phone").replaceAll("[ ()-]", "");
        if (normalized.startsWith("+91")) normalized = normalized.substring(3);
        if (!normalized.matches("[6-9][0-9]{9}")) throw new IllegalArgumentException("Valid Indian mobile number is required");
        return normalized;
    }
    static String fingerprint(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception ex) { throw new IllegalStateException("Could not fingerprint Pidge request"); }
    }
    private ProviderCreateUncertainException uncertain(String reference, Instant attempted) {
        return new ProviderCreateUncertainException(providerId(), reference, attempted,
            new IllegalStateException("Pidge booking requires reconciliation before retry or fallback"));
    }
    static class BookingRejectedException extends RuntimeException {
        BookingRejectedException() { super("Selected Pidge partner or price changed; pending order cancellation confirmed"); }
    }
}
