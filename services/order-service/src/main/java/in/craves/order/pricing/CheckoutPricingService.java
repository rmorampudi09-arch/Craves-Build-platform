package in.craves.order.pricing;

import in.craves.order.exception.OrderApiException;
import in.craves.order.pricing.AzureMapsRouteClient.RouteResult;
import in.craves.order.pricing.CheckoutPricingModels.KitchenQuoteWrite;
import in.craves.order.pricing.CheckoutPricingModels.QuoteWrite;
import in.craves.order.pricing.CheckoutPricingModels.StoredKitchenQuote;
import in.craves.order.pricing.CheckoutPricingModels.StoredQuote;
import in.craves.order.pricing.MarketDeliveryPricing.DeliveryPrice;
import in.craves.order.pricing.MarketplaceTaxPolicy.TaxBreakdown;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient;
import in.craves.order.service.CatalogClient.CatalogKitchen;
import in.craves.order.service.CatalogClient.CatalogMenuItem;
import in.craves.order.service.CheckoutSnapshotFactory;
import in.craves.order.service.CustomerAddressClient;
import in.craves.order.service.CustomerAddressClient.CustomerAddress;
import in.craves.order.service.NotificationInternalClient;
import in.craves.order.service.OrderService;
import in.craves.order.web.ApiDtos.CartItemResponse;
import in.craves.order.web.ApiDtos.CartResponse;
import in.craves.order.web.ApiDtos.ChargePolicyResponse;
import in.craves.order.web.ApiDtos.CheckoutQuoteRequest;
import in.craves.order.web.ApiDtos.CheckoutQuoteResponse;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import in.craves.order.web.ApiDtos.CheckoutStatus;
import in.craves.order.web.ApiDtos.CustomerAddressSnapshotResponse;
import in.craves.order.web.ApiDtos.KitchenDeliveryQuoteResponse;
import in.craves.order.web.ApiDtos.KitchenPickupSnapshotResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import in.craves.order.web.ApiDtos.TaxBreakdownResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CheckoutPricingService {
    private static final String INR = "INR";
    private static final String DELIVERY_ADDRESS_REQUIRED_MESSAGE =
        "Save the current location or select a saved delivery address before placing the order.";

    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedJdbc;
    private final OrderService orderService;
    private final CatalogClient catalogClient;
    private final CustomerAddressClient customerAddressClient;
    private final CheckoutSnapshotFactory checkoutSnapshotFactory;
    private final NotificationInternalClient notificationInternalClient;
    private final CheckoutPricingQuoteRepository quoteRepository;
    private final AzureMapsRouteClient routeClient;
    private final MarketDeliveryPricing deliveryPricing;
    private final MarketplaceTaxPolicy taxPolicy;
    private final long quoteTtlMinutes;

    public CheckoutPricingService(
        JdbcTemplate jdbcTemplate,
        OrderService orderService,
        CatalogClient catalogClient,
        CustomerAddressClient customerAddressClient,
        CheckoutSnapshotFactory checkoutSnapshotFactory,
        NotificationInternalClient notificationInternalClient,
        CheckoutPricingQuoteRepository quoteRepository,
        AzureMapsRouteClient routeClient,
        MarketDeliveryPricing deliveryPricing,
        MarketplaceTaxPolicy taxPolicy,
        @Value("${craves.checkout-pricing.quote-ttl-minutes:10}") long quoteTtlMinutes
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.namedJdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
        this.orderService = orderService;
        this.catalogClient = catalogClient;
        this.customerAddressClient = customerAddressClient;
        this.checkoutSnapshotFactory = checkoutSnapshotFactory;
        this.notificationInternalClient = notificationInternalClient;
        this.quoteRepository = quoteRepository;
        this.routeClient = routeClient;
        this.deliveryPricing = deliveryPricing;
        this.taxPolicy = taxPolicy;
        this.quoteTtlMinutes = Math.max(1L, Math.min(quoteTtlMinutes, 30L));
    }

    /**
     * Deliberately not transactional: address/catalog/route I/O must not hold a PostgreSQL
     * connection. Quote persistence is atomic inside CheckoutPricingQuoteRepository.save().
     */
    public CheckoutQuoteResponse quote(CravesPrincipal principal, CheckoutQuoteRequest request) {
        requireCustomer(principal);
        if (request == null || request.deliveryAddressId() == null) {
            throw OrderApiException.badRequest("DELIVERY_ADDRESS_REQUIRED", DELIVERY_ADDRESS_REQUIRED_MESSAGE);
        }

        CustomerAddress customerAddress = customerAddressClient.getActiveOwnedAddress(
            principal.identityId(),
            request.deliveryAddressId()
        );
        CustomerAddressSnapshotResponse dropoff = checkoutSnapshotFactory.customerDropoff(customerAddress);
        CartResponse cart = orderService.validateCart(principal);
        if (cart.items().isEmpty()) {
            throw OrderApiException.badRequest(
                "CART_EMPTY",
                "Add at least one item before calculating checkout charges."
            );
        }

        ChargePolicyResponse policy = orderService.currentChargePolicy();
        PreparedCart prepared = prepareCart(cart);
        UUID quoteId = UUID.randomUUID();
        java.time.Instant createdAt = java.time.Instant.now();
        java.time.Instant expiresAt = createdAt.plusSeconds(quoteTtlMinutes * 60L);
        List<PricedKitchen> pricedKitchens = new ArrayList<>();

        BigDecimal checkoutFood = BigDecimal.ZERO;
        BigDecimal checkoutPlatform = BigDecimal.ZERO;
        BigDecimal checkoutTaxAdded = BigDecimal.ZERO;
        BigDecimal checkoutPlatformTaxIncluded = BigDecimal.ZERO;
        BigDecimal checkoutDeliveryTaxIncluded = BigDecimal.ZERO;
        BigDecimal checkoutTotalTax = BigDecimal.ZERO;
        BigDecimal checkoutDelivery = BigDecimal.ZERO;

        for (Map.Entry<UUID, List<CartItemResponse>> entry : prepared.byKitchen().entrySet()) {
            UUID kitchenId = entry.getKey();
            CatalogKitchen kitchen = catalogClient.getKitchen(kitchenId);
            KitchenPickupSnapshotResponse pickup = checkoutSnapshotFactory.kitchenPickup(kitchen);
            BigDecimal foodSubtotal = sumFood(entry.getValue());
            BigDecimal platformFee = platformFee(foodSubtotal, policy);

            RouteResult route = routeClient.drivingRoute(
                pickup.latitude(),
                pickup.longitude(),
                dropoff.latitude(),
                dropoff.longitude()
            );
            DeliveryPrice delivery = deliveryPricing.calculate(route.distanceMeters());
            TaxBreakdown taxes = taxPolicy.calculate(foodSubtotal, platformFee, delivery.total());
            BigDecimal grandTotal = foodSubtotal
                .add(platformFee)
                .add(taxes.taxAmountAddedToCheckout())
                .add(delivery.total())
                .setScale(2, RoundingMode.HALF_UP);

            pricedKitchens.add(new PricedKitchen(
                kitchenId,
                displayKitchenName(kitchen),
                pickup,
                foodSubtotal,
                platformFee,
                route,
                delivery,
                taxes,
                grandTotal
            ));
            checkoutFood = checkoutFood.add(foodSubtotal);
            checkoutPlatform = checkoutPlatform.add(platformFee);
            checkoutTaxAdded = checkoutTaxAdded.add(taxes.taxAmountAddedToCheckout());
            checkoutPlatformTaxIncluded = checkoutPlatformTaxIncluded.add(taxes.platformTaxIncluded());
            checkoutDeliveryTaxIncluded = checkoutDeliveryTaxIncluded.add(taxes.deliveryTaxIncluded());
            checkoutTotalTax = checkoutTotalTax.add(taxes.totalTaxAmount());
            checkoutDelivery = checkoutDelivery.add(delivery.total());
        }

        checkoutFood = money(checkoutFood);
        checkoutPlatform = money(checkoutPlatform);
        checkoutTaxAdded = money(checkoutTaxAdded);
        checkoutPlatformTaxIncluded = money(checkoutPlatformTaxIncluded);
        checkoutDeliveryTaxIncluded = money(checkoutDeliveryTaxIncluded);
        checkoutTotalTax = money(checkoutTotalTax);
        checkoutDelivery = money(checkoutDelivery);
        BigDecimal grandTotal = checkoutFood
            .add(checkoutPlatform)
            .add(checkoutTaxAdded)
            .add(checkoutDelivery)
            .setScale(2, RoundingMode.HALF_UP);

        List<KitchenQuoteWrite> kitchenWrites = pricedKitchens.stream()
            .map(this::toKitchenQuoteWrite)
            .toList();
        quoteRepository.save(new QuoteWrite(
            quoteId,
            principal.identityId(),
            dropoff.sourceAddressId(),
            INR,
            cartFingerprint(cart),
            checkoutFood,
            checkoutPlatform,
            checkoutTaxAdded,
            checkoutPlatformTaxIncluded,
            checkoutDeliveryTaxIncluded,
            checkoutTaxAdded,
            checkoutTotalTax,
            checkoutDelivery,
            grandTotal,
            policy.id(),
            MarketDeliveryPricing.VERSION,
            MarketplaceTaxPolicy.VERSION,
            dropoff.latitude(),
            dropoff.longitude(),
            expiresAt,
            createdAt,
            kitchenWrites
        ));

        TaxBreakdown aggregateTaxes = taxPolicy.calculate(checkoutFood, checkoutPlatform, checkoutDelivery);
        TaxBreakdownResponse taxResponse = new TaxBreakdownResponse(
            MarketplaceTaxPolicy.VERSION,
            aggregateTaxes.restaurantGstPercent(),
            aggregateTaxes.feeInclusiveGstPercent(),
            checkoutTaxAdded,
            checkoutPlatformTaxIncluded,
            checkoutDeliveryTaxIncluded,
            checkoutTaxAdded,
            checkoutTotalTax
        );

        return new CheckoutQuoteResponse(
            quoteId,
            dropoff.sourceAddressId(),
            INR,
            checkoutFood,
            checkoutPlatform,
            checkoutTaxAdded,
            checkoutDelivery,
            grandTotal,
            policy.id(),
            taxResponse,
            pricedKitchens.stream().map(this::toDeliveryResponse).toList(),
            expiresAt,
            createdAt
        );
    }

    @Transactional
    public CheckoutResponse checkout(CravesPrincipal principal, CheckoutRequest request) {
        requireCustomer(principal);
        if (request == null || request.deliveryAddressId() == null) {
            throw OrderApiException.badRequest("DELIVERY_ADDRESS_REQUIRED", DELIVERY_ADDRESS_REQUIRED_MESSAGE);
        }
        if (request.pricingQuoteId() == null) {
            throw OrderApiException.badRequest(
                "PRICING_QUOTE_REQUIRED",
                "Calculate and review delivery pricing before creating checkout."
            );
        }

        CustomerAddress customerAddress = customerAddressClient.getActiveOwnedAddress(
            principal.identityId(),
            request.deliveryAddressId()
        );
        CustomerAddressSnapshotResponse dropoff = checkoutSnapshotFactory.customerDropoff(customerAddress);
        CartResponse cart = orderService.validateCart(principal);
        if (cart.items().isEmpty()) {
            throw OrderApiException.badRequest("CART_EMPTY", "Your cart is empty.");
        }

        StoredQuote quote = requireUsableQuote(
            principal.identityId(),
            request.pricingQuoteId(),
            dropoff,
            cart
        );
        PreparedCart prepared = prepareCart(cart);
        Map<UUID, StoredKitchenQuote> quoteByKitchen = new LinkedHashMap<>();
        for (StoredKitchenQuote kitchenQuote : quote.kitchens()) {
            quoteByKitchen.put(kitchenQuote.kitchenId(), kitchenQuote);
        }
        if (!quoteByKitchen.keySet().equals(prepared.byKitchen().keySet())) {
            throw staleQuote();
        }

        List<PendingKitchenOrder> pendingOrders = new ArrayList<>();
        for (Map.Entry<UUID, List<CartItemResponse>> entry : prepared.byKitchen().entrySet()) {
            UUID kitchenId = entry.getKey();
            CatalogKitchen kitchen = catalogClient.getKitchen(kitchenId);
            KitchenPickupSnapshotResponse pickup = checkoutSnapshotFactory.kitchenPickup(kitchen);
            StoredKitchenQuote kitchenQuote = quoteByKitchen.get(kitchenId);
            requireSameCoordinates(
                pickup.latitude(),
                pickup.longitude(),
                kitchenQuote.pickupLatitude(),
                kitchenQuote.pickupLongitude()
            );
            BigDecimal currentFood = money(sumFood(entry.getValue()));
            if (currentFood.compareTo(kitchenQuote.foodSubtotal()) != 0) {
                throw staleQuote();
            }
            OrderPackaging packaging = calculatePackaging(entry.getValue(), prepared.catalogItems());
            pendingOrders.add(new PendingKitchenOrder(
                kitchenId,
                kitchen,
                pickup,
                List.copyOf(entry.getValue()),
                kitchenQuote,
                packaging
            ));
        }

        UUID checkoutId = UUID.randomUUID();
        if (quoteRepository.consume(quote.id(), checkoutId) != 1) {
            throw staleQuote();
        }

        insertCheckout(checkoutId, principal.identityId(), dropoff, quote);
        for (PendingKitchenOrder pending : pendingOrders) {
            UUID orderId = UUID.randomUUID();
            insertCustomerOrder(orderId, checkoutId, principal.identityId(), dropoff, pending, quote);
            addStatusHistory(orderId, principal.identityId());
            insertOrderItems(orderId, pending.items(), prepared.catalogItems());
        }

        orderService.clearCart(principal);
        CheckoutResponse response = orderService.getCheckout(principal, checkoutId);
        notifyOrderCreatedAfterCommit(response);
        return response;
    }

    private PreparedCart prepareCart(CartResponse cart) {
        Map<UUID, CatalogMenuItem> catalogItems = new LinkedHashMap<>();
        Map<UUID, List<CartItemResponse>> byKitchen = new LinkedHashMap<>();
        for (CartItemResponse cartItem : cart.items()) {
            CatalogMenuItem catalogItem = catalogClient.getActiveMenuItem(cartItem.menuItemId());
            catalogItems.put(catalogItem.id(), catalogItem);
            byKitchen.computeIfAbsent(catalogItem.kitchenId(), ignored -> new ArrayList<>()).add(cartItem);
        }
        return new PreparedCart(catalogItems, byKitchen);
    }

    private KitchenQuoteWrite toKitchenQuoteWrite(PricedKitchen priced) {
        return new KitchenQuoteWrite(
            priced.kitchenId(),
            priced.kitchenName(),
            priced.pickup().latitude(),
            priced.pickup().longitude(),
            priced.route().distanceMeters(),
            priced.route().trafficDurationSeconds(),
            priced.foodSubtotal(),
            priced.platformFee(),
            priced.taxes().foodTaxAdded(),
            priced.taxes().platformTaxIncluded(),
            priced.taxes().deliveryTaxIncluded(),
            priced.taxes().taxAmountAddedToCheckout(),
            priced.delivery().baseDistanceKm(),
            priced.delivery().baseFee(),
            priced.delivery().extraDistanceKm(),
            priced.delivery().extraPerKm(),
            priced.delivery().extraDistanceFee(),
            priced.delivery().total(),
            priced.grandTotal()
        );
    }

    private KitchenDeliveryQuoteResponse toDeliveryResponse(PricedKitchen priced) {
        long minutes = Math.max(1L, (priced.route().trafficDurationSeconds() + 59L) / 60L);
        return new KitchenDeliveryQuoteResponse(
            priced.kitchenId(),
            priced.kitchenName(),
            priced.delivery().roadDistanceKm(),
            priced.route().distanceMeters(),
            minutes,
            priced.delivery().baseDistanceKm(),
            priced.delivery().baseFee(),
            priced.delivery().extraDistanceKm(),
            priced.delivery().extraPerKm(),
            priced.delivery().extraDistanceFee(),
            priced.delivery().total(),
            priced.delivery().version()
        );
    }

    private StoredQuote requireUsableQuote(
        UUID customerIdentityId,
        UUID quoteId,
        CustomerAddressSnapshotResponse dropoff,
        CartResponse cart
    ) {
        StoredQuote quote = quoteRepository.findOwned(quoteId, customerIdentityId)
            .orElseThrow(() -> OrderApiException.notFound(
                "PRICING_QUOTE_NOT_FOUND",
                "The checkout pricing quote was not found."
            ));
        if (quote.consumedAt() != null
            || quote.expiresAt() == null
            || !quote.expiresAt().isAfter(java.time.Instant.now())) {
            throw staleQuote();
        }
        if (!quote.deliveryAddressId().equals(dropoff.sourceAddressId())
            || !quote.cartFingerprint().equals(cartFingerprint(cart))) {
            throw staleQuote();
        }
        requireSameCoordinates(
            dropoff.latitude(),
            dropoff.longitude(),
            quote.dropoffLatitude(),
            quote.dropoffLongitude()
        );
        return quote;
    }

    private void insertCheckout(
        UUID checkoutId,
        UUID customerIdentityId,
        CustomerAddressSnapshotResponse dropoff,
        StoredQuote quote
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("id", checkoutId)
            .addValue("customerIdentityId", customerIdentityId)
            .addValue("status", CheckoutStatus.PAYMENT_PENDING.name())
            .addValue("currency", quote.currency())
            .addValue("foodSubtotal", quote.foodSubtotal())
            .addValue("platformFee", quote.platformFee())
            .addValue("taxAmount", quote.taxAmount())
            .addValue("deliveryFee", quote.deliveryFee())
            .addValue("grandTotal", quote.grandTotal())
            .addValue("chargePolicyId", quote.chargePolicyId())
            .addValue("deliveryAddressId", dropoff.sourceAddressId())
            .addValue("recipientName", dropoff.recipientName())
            .addValue("contactPhone", dropoff.contactPhoneNumber())
            .addValue("addressLine1", dropoff.addressLine1())
            .addValue("addressLine2", dropoff.addressLine2())
            .addValue("landmark", dropoff.landmark())
            .addValue("areaName", dropoff.areaName())
            .addValue("city", dropoff.city())
            .addValue("state", dropoff.state())
            .addValue("postalCode", dropoff.postalCode())
            .addValue("latitude", dropoff.latitude())
            .addValue("longitude", dropoff.longitude())
            .addValue("pricingQuoteId", quote.id())
            .addValue("deliveryPricingVersion", quote.deliveryPricingVersion())
            .addValue("taxProfileVersion", quote.taxProfileVersion())
            .addValue("foodTaxAdded", quote.foodTaxAdded())
            .addValue("platformTaxIncluded", quote.platformTaxIncluded())
            .addValue("deliveryTaxIncluded", quote.deliveryTaxIncluded())
            .addValue("totalTaxAmount", quote.totalTaxAmount());
        namedJdbc.update(
            """
                INSERT INTO order_schema.checkout (
                    id, customer_identity_id, status, currency,
                    food_subtotal, platform_fee, tax_amount, delivery_fee, grand_total, charge_policy_id,
                    delivery_address_id,
                    dropoff_recipient_name, dropoff_contact_phone, dropoff_address_line1,
                    dropoff_address_line2, dropoff_landmark, dropoff_area_name, dropoff_city,
                    dropoff_state, dropoff_postal_code, dropoff_latitude, dropoff_longitude,
                    pricing_quote_id, delivery_pricing_version, tax_profile_version,
                    food_tax_added, platform_tax_included, delivery_tax_included, total_tax_amount,
                    created_at, updated_at
                ) VALUES (
                    :id, :customerIdentityId, :status, :currency,
                    :foodSubtotal, :platformFee, :taxAmount, :deliveryFee, :grandTotal, :chargePolicyId,
                    :deliveryAddressId,
                    :recipientName, :contactPhone, :addressLine1,
                    :addressLine2, :landmark, :areaName, :city,
                    :state, :postalCode, :latitude, :longitude,
                    :pricingQuoteId, :deliveryPricingVersion, :taxProfileVersion,
                    :foodTaxAdded, :platformTaxIncluded, :deliveryTaxIncluded, :totalTaxAmount,
                    now(), now()
                )
                """,
            params
        );
    }

    private void insertCustomerOrder(
        UUID orderId,
        UUID checkoutId,
        UUID customerIdentityId,
        CustomerAddressSnapshotResponse dropoff,
        PendingKitchenOrder pending,
        StoredQuote quote
    ) {
        StoredKitchenQuote priced = pending.priced();
        KitchenPickupSnapshotResponse pickup = pending.pickup();
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("id", orderId)
            .addValue("checkoutId", checkoutId)
            .addValue("customerIdentityId", customerIdentityId)
            .addValue("kitchenId", pending.kitchenId())
            .addValue("kitchenName", displayKitchenName(pending.kitchen()))
            .addValue("status", OrderStatus.PAYMENT_PENDING.name())
            .addValue("currency", quote.currency())
            .addValue("foodSubtotal", priced.foodSubtotal())
            .addValue("platformFee", priced.platformFee())
            .addValue("taxAmount", priced.taxAmount())
            .addValue("deliveryFee", priced.deliveryFee())
            .addValue("grandTotal", priced.grandTotal())
            .addValue("packageWeight", pending.packaging().totalPackageWeightGrams())
            .addValue("thermoboxRequired", pending.packaging().thermoboxRequired())
            .addValue("deliveryAddressId", dropoff.sourceAddressId())
            .addValue("dropoffRecipientName", dropoff.recipientName())
            .addValue("dropoffContactPhone", dropoff.contactPhoneNumber())
            .addValue("dropoffAddressLine1", dropoff.addressLine1())
            .addValue("dropoffAddressLine2", dropoff.addressLine2())
            .addValue("dropoffLandmark", dropoff.landmark())
            .addValue("dropoffAreaName", dropoff.areaName())
            .addValue("dropoffCity", dropoff.city())
            .addValue("dropoffState", dropoff.state())
            .addValue("dropoffPostalCode", dropoff.postalCode())
            .addValue("dropoffLatitude", dropoff.latitude())
            .addValue("dropoffLongitude", dropoff.longitude())
            .addValue("pickupPhoneNumber", pickup.contactPhoneNumber())
            .addValue("pickupEmail", pickup.email())
            .addValue("pickupAddressLine1", pickup.addressLine1())
            .addValue("pickupAddressLine2", pickup.addressLine2())
            .addValue("pickupLandmark", pickup.landmark())
            .addValue("pickupAreaName", pickup.areaName())
            .addValue("pickupCity", pickup.city())
            .addValue("pickupState", pickup.state())
            .addValue("pickupPostalCode", pickup.postalCode())
            .addValue("pickupLatitude", pickup.latitude())
            .addValue("pickupLongitude", pickup.longitude())
            .addValue("pricingQuoteId", quote.id())
            .addValue("roadDistanceMeters", priced.roadDistanceMeters())
            .addValue("trafficDurationSeconds", priced.trafficDurationSeconds())
            .addValue("deliveryPricingVersion", quote.deliveryPricingVersion())
            .addValue("taxProfileVersion", quote.taxProfileVersion())
            .addValue("foodTaxAdded", priced.foodTaxAdded())
            .addValue("platformTaxIncluded", priced.platformTaxIncluded())
            .addValue("deliveryTaxIncluded", priced.deliveryTaxIncluded())
            .addValue(
                "totalTaxAmount",
                priced.foodTaxAdded()
                    .add(priced.platformTaxIncluded())
                    .add(priced.deliveryTaxIncluded())
                    .setScale(2, RoundingMode.HALF_UP)
            );
        namedJdbc.update(
            """
                INSERT INTO order_schema.customer_order (
                    id, checkout_id, customer_identity_id, kitchen_id, kitchen_name_snapshot,
                    status, currency, food_subtotal, platform_fee, tax_amount, delivery_fee,
                    grand_total, total_package_weight_grams, thermobox_required,
                    delivery_address_id,
                    dropoff_recipient_name, dropoff_contact_phone, dropoff_address_line1,
                    dropoff_address_line2, dropoff_landmark, dropoff_area_name, dropoff_city,
                    dropoff_state, dropoff_postal_code, dropoff_latitude, dropoff_longitude,
                    pickup_phone_number, pickup_email, pickup_address_line1, pickup_address_line2,
                    pickup_landmark, pickup_area_name, pickup_city, pickup_state,
                    pickup_postal_code, pickup_latitude, pickup_longitude,
                    pricing_quote_id, road_distance_meters, traffic_duration_seconds,
                    delivery_pricing_version, tax_profile_version, food_tax_added,
                    platform_tax_included, delivery_tax_included, total_tax_amount,
                    created_at, updated_at
                ) VALUES (
                    :id, :checkoutId, :customerIdentityId, :kitchenId, :kitchenName,
                    :status, :currency, :foodSubtotal, :platformFee, :taxAmount, :deliveryFee,
                    :grandTotal, :packageWeight, :thermoboxRequired,
                    :deliveryAddressId,
                    :dropoffRecipientName, :dropoffContactPhone, :dropoffAddressLine1,
                    :dropoffAddressLine2, :dropoffLandmark, :dropoffAreaName, :dropoffCity,
                    :dropoffState, :dropoffPostalCode, :dropoffLatitude, :dropoffLongitude,
                    :pickupPhoneNumber, :pickupEmail, :pickupAddressLine1, :pickupAddressLine2,
                    :pickupLandmark, :pickupAreaName, :pickupCity, :pickupState,
                    :pickupPostalCode, :pickupLatitude, :pickupLongitude,
                    :pricingQuoteId, :roadDistanceMeters, :trafficDurationSeconds,
                    :deliveryPricingVersion, :taxProfileVersion, :foodTaxAdded,
                    :platformTaxIncluded, :deliveryTaxIncluded, :totalTaxAmount,
                    now(), now()
                )
                """,
            params
        );
    }

    private void insertOrderItems(
        UUID orderId,
        List<CartItemResponse> items,
        Map<UUID, CatalogMenuItem> catalogItems
    ) {
        for (CartItemResponse cartItem : items) {
            CatalogMenuItem catalogItem = catalogItems.get(cartItem.menuItemId());
            jdbcTemplate.update(
                "INSERT INTO order_schema.order_item (id, order_id, menu_item_id, item_name_snapshot, category_snapshot, food_type_snapshot, unit_price_snapshot, unit_package_weight_grams_snapshot, thermobox_required_snapshot, quantity, line_total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())",
                UUID.randomUUID(),
                orderId,
                cartItem.menuItemId(),
                cartItem.itemName(),
                catalogItem.category(),
                catalogItem.foodType(),
                cartItem.unitPrice(),
                catalogItem.unitPackageWeightGrams(),
                catalogItem.thermoboxRequired(),
                cartItem.quantity(),
                cartItem.lineTotal()
            );
        }
    }

    private static BigDecimal platformFee(BigDecimal foodSubtotal, ChargePolicyResponse policy) {
        return foodSubtotal.multiply(policy.platformFeePercent())
            .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
            .add(policy.platformFeeFlat())
            .setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal sumFood(List<CartItemResponse> items) {
        return items.stream()
            .map(CartItemResponse::lineTotal)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .setScale(2, RoundingMode.HALF_UP);
    }

    private static String cartFingerprint(CartResponse cart) {
        StringBuilder canonical = new StringBuilder();
        canonical.append(cart.currency()).append('|');
        cart.items().stream()
            .sorted(Comparator.comparing(item -> item.menuItemId().toString()))
            .forEach(item -> canonical
                .append(item.menuItemId()).append('|')
                .append(item.kitchenId()).append('|')
                .append(item.unitPrice().setScale(2, RoundingMode.HALF_UP).toPlainString()).append('|')
                .append(item.quantity()).append(';'));
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                digest.digest(canonical.toString().getBytes(StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private static OrderPackaging calculatePackaging(
        List<CartItemResponse> cartItems,
        Map<UUID, CatalogMenuItem> catalogItems
    ) {
        long totalWeightGrams = 0;
        boolean thermoboxRequired = false;
        try {
            for (CartItemResponse cartItem : cartItems) {
                CatalogMenuItem catalogItem = catalogItems.get(cartItem.menuItemId());
                if (catalogItem == null
                    || catalogItem.unitPackageWeightGrams() == null
                    || catalogItem.unitPackageWeightGrams() <= 0
                    || catalogItem.thermoboxRequired() == null) {
                    throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Menu item delivery metadata is incomplete"
                    );
                }
                totalWeightGrams = Math.addExact(
                    totalWeightGrams,
                    Math.multiplyExact(
                        catalogItem.unitPackageWeightGrams().longValue(),
                        cartItem.quantity()
                    )
                );
                thermoboxRequired = thermoboxRequired || catalogItem.thermoboxRequired();
            }
        } catch (ArithmeticException exception) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Calculated package weight is too large"
            );
        }
        if (totalWeightGrams <= 0 || totalWeightGrams > Integer.MAX_VALUE) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Calculated package weight is invalid"
            );
        }
        return new OrderPackaging((int) totalWeightGrams, thermoboxRequired);
    }

    private static void requireSameCoordinates(
        BigDecimal leftLatitude,
        BigDecimal leftLongitude,
        BigDecimal rightLatitude,
        BigDecimal rightLongitude
    ) {
        if (leftLatitude == null
            || leftLongitude == null
            || rightLatitude == null
            || rightLongitude == null
            || leftLatitude.compareTo(rightLatitude) != 0
            || leftLongitude.compareTo(rightLongitude) != 0) {
            throw staleQuote();
        }
    }

    private static OrderApiException staleQuote() {
        return OrderApiException.conflict(
            "PRICING_QUOTE_STALE",
            "Checkout pricing changed or expired. Recalculate the delivery fee before payment."
        );
    }

    private void addStatusHistory(UUID orderId, UUID actorIdentityId) {
        jdbcTemplate.update(
            "INSERT INTO order_schema.order_status_history (id, order_id, old_status, new_status, actor_identity_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, now())",
            UUID.randomUUID(),
            orderId,
            null,
            OrderStatus.PAYMENT_PENDING.name(),
            actorIdentityId,
            "Checkout created from pricing quote"
        );
    }

    private void notifyOrderCreatedAfterCommit(CheckoutResponse checkout) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            notificationInternalClient.orderCreated(checkout);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                notificationInternalClient.orderCreated(checkout);
            }
        });
    }

    private static String displayKitchenName(CatalogKitchen kitchen) {
        return StringUtils.hasText(kitchen.displayName()) ? kitchen.displayName() : kitchen.kitchenName();
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static void requireCustomer(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CUSTOMER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer role is required");
        }
    }

    private record PreparedCart(
        Map<UUID, CatalogMenuItem> catalogItems,
        Map<UUID, List<CartItemResponse>> byKitchen
    ) {
    }

    private record PricedKitchen(
        UUID kitchenId,
        String kitchenName,
        KitchenPickupSnapshotResponse pickup,
        BigDecimal foodSubtotal,
        BigDecimal platformFee,
        RouteResult route,
        DeliveryPrice delivery,
        TaxBreakdown taxes,
        BigDecimal grandTotal
    ) {
    }

    private record OrderPackaging(int totalPackageWeightGrams, boolean thermoboxRequired) {
    }

    private record PendingKitchenOrder(
        UUID kitchenId,
        CatalogKitchen kitchen,
        KitchenPickupSnapshotResponse pickup,
        List<CartItemResponse> items,
        StoredKitchenQuote priced,
        OrderPackaging packaging
    ) {
    }
}
