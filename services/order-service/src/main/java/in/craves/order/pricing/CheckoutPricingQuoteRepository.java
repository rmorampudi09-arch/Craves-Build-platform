package in.craves.order.pricing;

import in.craves.order.pricing.CheckoutPricingModels.KitchenQuoteWrite;
import in.craves.order.pricing.CheckoutPricingModels.QuoteWrite;
import in.craves.order.pricing.CheckoutPricingModels.StoredKitchenQuote;
import in.craves.order.pricing.CheckoutPricingModels.StoredQuote;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class CheckoutPricingQuoteRepository {
    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedJdbc;

    public CheckoutPricingQuoteRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.namedJdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    @Transactional
    public void save(QuoteWrite quote) {
        jdbcTemplate.update(
            "DELETE FROM order_schema.checkout_pricing_quote WHERE customer_identity_id = ? AND consumed_at IS NULL AND expires_at < now() - INTERVAL '1 day'",
            quote.customerIdentityId()
        );

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("id", quote.id())
            .addValue("customerIdentityId", quote.customerIdentityId())
            .addValue("deliveryAddressId", quote.deliveryAddressId())
            .addValue("currency", quote.currency())
            .addValue("cartFingerprint", quote.cartFingerprint())
            .addValue("foodSubtotal", quote.foodSubtotal())
            .addValue("platformFee", quote.platformFee())
            .addValue("foodTaxAdded", quote.foodTaxAdded())
            .addValue("platformTaxIncluded", quote.platformTaxIncluded())
            .addValue("deliveryTaxIncluded", quote.deliveryTaxIncluded())
            .addValue("taxAmount", quote.taxAmount())
            .addValue("totalTaxAmount", quote.totalTaxAmount())
            .addValue("deliveryFee", quote.deliveryFee())
            .addValue("grandTotal", quote.grandTotal())
            .addValue("chargePolicyId", quote.chargePolicyId())
            .addValue("deliveryPricingVersion", quote.deliveryPricingVersion())
            .addValue("taxProfileVersion", quote.taxProfileVersion())
            .addValue("dropoffLatitude", quote.dropoffLatitude())
            .addValue("dropoffLongitude", quote.dropoffLongitude())
            .addValue("expiresAt", Timestamp.from(quote.expiresAt()))
            .addValue("createdAt", Timestamp.from(quote.createdAt()));
        namedJdbc.update(
            """
                INSERT INTO order_schema.checkout_pricing_quote (
                    id, customer_identity_id, delivery_address_id, currency, cart_fingerprint,
                    food_subtotal, platform_fee, food_tax_added, platform_tax_included,
                    delivery_tax_included, tax_amount, total_tax_amount, delivery_fee, grand_total,
                    charge_policy_id, delivery_pricing_version, tax_profile_version,
                    dropoff_latitude, dropoff_longitude, expires_at, created_at
                ) VALUES (
                    :id, :customerIdentityId, :deliveryAddressId, :currency, :cartFingerprint,
                    :foodSubtotal, :platformFee, :foodTaxAdded, :platformTaxIncluded,
                    :deliveryTaxIncluded, :taxAmount, :totalTaxAmount, :deliveryFee, :grandTotal,
                    :chargePolicyId, :deliveryPricingVersion, :taxProfileVersion,
                    :dropoffLatitude, :dropoffLongitude, :expiresAt, :createdAt
                )
                """,
            params
        );

        for (KitchenQuoteWrite kitchen : quote.kitchens()) {
            insertKitchen(quote.id(), kitchen);
        }
    }

    public Optional<StoredQuote> findOwned(UUID quoteId, UUID customerIdentityId) {
        List<StoredQuote> rows = jdbcTemplate.query(
            "SELECT * FROM order_schema.checkout_pricing_quote WHERE id = ? AND customer_identity_id = ?",
            (rs, rowNum) -> mapStoredQuote(rs, List.of()),
            quoteId,
            customerIdentityId
        );
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        StoredQuote header = rows.getFirst();
        List<StoredKitchenQuote> kitchens = jdbcTemplate.query(
            "SELECT * FROM order_schema.checkout_pricing_quote_kitchen WHERE quote_id = ? ORDER BY kitchen_id",
            (rs, rowNum) -> mapStoredKitchenQuote(rs),
            quoteId
        );
        return Optional.of(new StoredQuote(
            header.id(),
            header.customerIdentityId(),
            header.deliveryAddressId(),
            header.currency(),
            header.cartFingerprint(),
            header.foodSubtotal(),
            header.platformFee(),
            header.foodTaxAdded(),
            header.platformTaxIncluded(),
            header.deliveryTaxIncluded(),
            header.taxAmount(),
            header.totalTaxAmount(),
            header.deliveryFee(),
            header.grandTotal(),
            header.chargePolicyId(),
            header.deliveryPricingVersion(),
            header.taxProfileVersion(),
            header.dropoffLatitude(),
            header.dropoffLongitude(),
            header.expiresAt(),
            header.consumedAt(),
            List.copyOf(kitchens)
        ));
    }

    public int consume(UUID quoteId, UUID checkoutId) {
        return jdbcTemplate.update(
            "UPDATE order_schema.checkout_pricing_quote SET consumed_at = now(), consumed_checkout_id = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > now()",
            checkoutId,
            quoteId
        );
    }

    private void insertKitchen(UUID quoteId, KitchenQuoteWrite kitchen) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("quoteId", quoteId)
            .addValue("kitchenId", kitchen.kitchenId())
            .addValue("kitchenName", kitchen.kitchenName())
            .addValue("pickupLatitude", kitchen.pickupLatitude())
            .addValue("pickupLongitude", kitchen.pickupLongitude())
            .addValue("roadDistanceMeters", kitchen.roadDistanceMeters())
            .addValue("trafficDurationSeconds", kitchen.trafficDurationSeconds())
            .addValue("foodSubtotal", kitchen.foodSubtotal())
            .addValue("platformFee", kitchen.platformFee())
            .addValue("foodTaxAdded", kitchen.foodTaxAdded())
            .addValue("platformTaxIncluded", kitchen.platformTaxIncluded())
            .addValue("deliveryTaxIncluded", kitchen.deliveryTaxIncluded())
            .addValue("taxAmount", kitchen.taxAmount())
            .addValue("baseDistanceKm", kitchen.baseDistanceKm())
            .addValue("baseDeliveryFee", kitchen.baseDeliveryFee())
            .addValue("extraDistanceKm", kitchen.extraDistanceKm())
            .addValue("extraPerKm", kitchen.extraPerKm())
            .addValue("extraDistanceFee", kitchen.extraDistanceFee())
            .addValue("deliveryFee", kitchen.deliveryFee())
            .addValue("grandTotal", kitchen.grandTotal());
        namedJdbc.update(
            """
                INSERT INTO order_schema.checkout_pricing_quote_kitchen (
                    quote_id, kitchen_id, kitchen_name, pickup_latitude, pickup_longitude,
                    road_distance_meters, traffic_duration_seconds, food_subtotal, platform_fee,
                    food_tax_added, platform_tax_included, delivery_tax_included, tax_amount,
                    base_distance_km, base_delivery_fee, extra_distance_km, extra_per_km,
                    extra_distance_fee, delivery_fee, grand_total
                ) VALUES (
                    :quoteId, :kitchenId, :kitchenName, :pickupLatitude, :pickupLongitude,
                    :roadDistanceMeters, :trafficDurationSeconds, :foodSubtotal, :platformFee,
                    :foodTaxAdded, :platformTaxIncluded, :deliveryTaxIncluded, :taxAmount,
                    :baseDistanceKm, :baseDeliveryFee, :extraDistanceKm, :extraPerKm,
                    :extraDistanceFee, :deliveryFee, :grandTotal
                )
                """,
            params
        );
    }

    private StoredQuote mapStoredQuote(ResultSet rs, List<StoredKitchenQuote> kitchens) throws SQLException {
        return new StoredQuote(
            rs.getObject("id", UUID.class),
            rs.getObject("customer_identity_id", UUID.class),
            rs.getObject("delivery_address_id", UUID.class),
            rs.getString("currency"),
            rs.getString("cart_fingerprint"),
            rs.getBigDecimal("food_subtotal"),
            rs.getBigDecimal("platform_fee"),
            rs.getBigDecimal("food_tax_added"),
            rs.getBigDecimal("platform_tax_included"),
            rs.getBigDecimal("delivery_tax_included"),
            rs.getBigDecimal("tax_amount"),
            rs.getBigDecimal("total_tax_amount"),
            rs.getBigDecimal("delivery_fee"),
            rs.getBigDecimal("grand_total"),
            rs.getObject("charge_policy_id", UUID.class),
            rs.getString("delivery_pricing_version"),
            rs.getString("tax_profile_version"),
            rs.getBigDecimal("dropoff_latitude"),
            rs.getBigDecimal("dropoff_longitude"),
            instant(rs, "expires_at"),
            instant(rs, "consumed_at"),
            kitchens
        );
    }

    private StoredKitchenQuote mapStoredKitchenQuote(ResultSet rs) throws SQLException {
        return new StoredKitchenQuote(
            rs.getObject("kitchen_id", UUID.class),
            rs.getString("kitchen_name"),
            rs.getBigDecimal("pickup_latitude"),
            rs.getBigDecimal("pickup_longitude"),
            rs.getLong("road_distance_meters"),
            rs.getLong("traffic_duration_seconds"),
            rs.getBigDecimal("food_subtotal"),
            rs.getBigDecimal("platform_fee"),
            rs.getBigDecimal("food_tax_added"),
            rs.getBigDecimal("platform_tax_included"),
            rs.getBigDecimal("delivery_tax_included"),
            rs.getBigDecimal("tax_amount"),
            rs.getBigDecimal("base_distance_km"),
            rs.getBigDecimal("base_delivery_fee"),
            rs.getBigDecimal("extra_distance_km"),
            rs.getBigDecimal("extra_per_km"),
            rs.getBigDecimal("extra_distance_fee"),
            rs.getBigDecimal("delivery_fee"),
            rs.getBigDecimal("grand_total")
        );
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
