package in.craves.order.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.exception.OrderApiException;
import in.craves.order.finance.FinanceSourceClient;
import in.craves.order.security.CravesPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CartBillPreviewService {
    public record Line(@NotNull UUID id, @Min(1) @Max(100) int quantity, @NotNull Instant updatedAt) {}
    public record ExpectedCart(@NotNull UUID cartId, @NotNull @Size(min=1,max=100) List<@Valid Line> items) {}
    public record Request(@NotNull UUID deliveryAddressId, @NotNull @Valid ExpectedCart expectedCart) {}
    public record Response(ExpectedCart expectedCart, UUID deliveryAddressId, UUID policyId, long policyRevision,
        String currency, String foodSubtotal, String platformFee, String deliveryFee, String taxAmount,
        String grandTotal, Instant pricedAt, Instant expiresAt) {}
    record StoredLine(UUID id, UUID menuItemId, UUID kitchenId, int quantity, BigDecimal unitPrice, Instant updatedAt) {}
    private final JdbcTemplate jdbc;
    private final CatalogClient catalog;
    private final CustomerAddressClient addresses;
    private final OrderService orders;
    private final FinanceSourceClient finance;
    private final ObjectMapper json;

    public CartBillPreviewService(JdbcTemplate jdbc, CatalogClient catalog, CustomerAddressClient addresses,
        OrderService orders, FinanceSourceClient finance, ObjectMapper json) {
        this.jdbc=jdbc; this.catalog=catalog; this.addresses=addresses; this.orders=orders; this.finance=finance; this.json=json;
    }

    @Transactional(readOnly=true)
    public Response preview(CravesPrincipal principal, Request request) {
        if (principal == null || principal.identityId() == null || !principal.hasRole("CUSTOMER"))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN);
        Boolean owned = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM order_schema.cart WHERE id=? AND customer_identity_id=?)",
            Boolean.class, request.expectedCart().cartId(), principal.identityId());
        if (!Boolean.TRUE.equals(owned)) throw OrderApiException.notFound("CART_NOT_FOUND", "Cart was not found.");
        List<StoredLine> lines = jdbc.query("""
            SELECT id,menu_item_id,kitchen_id,quantity,unit_price_snapshot,updated_at
            FROM order_schema.cart_item WHERE cart_id=? ORDER BY created_at ASC LIMIT 201
            """, (rs,n) -> new StoredLine(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),
                rs.getInt(4),rs.getBigDecimal(5),rs.getTimestamp(6).toInstant()), request.expectedCart().cartId());
        requireSnapshot(request.expectedCart(), lines);
        BigDecimal subtotal = BigDecimal.ZERO;
        UUID kitchenId = null;
        for (StoredLine line : lines) {
            var item = catalog.getActiveMenuItem(line.menuItemId());
            if (!line.menuItemId().equals(item.id()) || !line.kitchenId().equals(item.kitchenId())
                || !"INR".equals(item.currency()) || line.unitPrice().compareTo(item.price()) != 0)
                throw OrderApiException.conflict("CART_PRICE_CHANGED", "A dish changed. Refresh your cart.");
            if (kitchenId != null && !kitchenId.equals(item.kitchenId()))
                throw OrderApiException.conflict("CART_KITCHEN_CONFLICT", "Choose dishes from one kitchen at a time.");
            kitchenId = item.kitchenId();
            subtotal = subtotal.add(item.price().multiply(BigDecimal.valueOf(line.quantity())));
        }
        var kitchen = catalog.getKitchen(kitchenId);
        var address = addresses.getActiveOwnedAddress(principal.identityId(), request.deliveryAddressId());
        var payload = json.createObjectNode().put("foodSubtotal", money(subtotal))
            .put("deliveryBeforeTax", money(orders.currentChargePolicy().deliveryFeeFlat()))
            .put("pickupStateCode", state(kitchen.state())).put("dropoffStateCode", state(address.state()));
        payload.set("pickupLatitude", json.valueToTree(kitchen.latitude()));
        payload.set("pickupLongitude", json.valueToTree(kitchen.longitude()));
        payload.set("dropoffLatitude", json.valueToTree(address.latitude()));
        payload.set("dropoffLongitude", json.valueToTree(address.longitude()));
        JsonNode result;
        try { result = finance.cartPreview(payload); }
        catch (RuntimeException ex) { throw OrderApiException.serviceUnavailable("BILL_PREVIEW_UNAVAILABLE", "Bill calculation is unavailable. Please retry."); }
        BigDecimal food = amount(result,"foodSubtotal"), platform = amount(result,"platformFee"),
            delivery = amount(result,"deliveryFee"), tax = amount(result,"taxAmount"), total = amount(result,"grandTotal");
        if (!"INR".equals(result.path("currency").asText()) || subtotal.compareTo(food)!=0
            || food.add(platform).add(delivery).add(tax).compareTo(total)!=0
            || !result.path("policyRevision").isIntegralNumber() || !result.path("policyRevision").canConvertToLong()
            || result.path("policyRevision").asLong()<1
            || !result.path("policyId").isTextual() || !result.path("policyId").asText().matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"))
            throw OrderApiException.serviceUnavailable("BILL_PREVIEW_INVALID", "Bill totals could not be verified.");
        Instant pricedAt = Instant.now();
        return new Response(request.expectedCart(), request.deliveryAddressId(), UUID.fromString(result.path("policyId").asText()),
            result.path("policyRevision").asLong(),"INR",money(food),money(platform),money(delivery),money(tax),money(total),pricedAt,pricedAt.plusSeconds(120));
    }

    static void requireSnapshot(ExpectedCart expected, List<StoredLine> actual) {
        if (expected == null || expected.items() == null || expected.items().isEmpty() || expected.items().size()>100
            || actual.size()!=expected.items().size()) throw changed();
        var byId = new HashMap<UUID,Line>();
        for (Line line : expected.items()) {
            if (line == null || line.id()==null || line.updatedAt()==null || line.quantity()<1 || line.quantity()>100
                || byId.put(line.id(),line)!=null) throw changed();
        }
        for (StoredLine line : actual) {
            Line requested = byId.get(line.id());
            if (requested==null || requested.quantity()!=line.quantity() || !requested.updatedAt().equals(line.updatedAt())) throw changed();
        }
    }
    private static OrderApiException changed() { return OrderApiException.conflict("CART_SNAPSHOT_CHANGED", "Cart changed. Refresh before reviewing the bill."); }
    private static String state(String value) {
        if (value!=null && java.util.Set.of("36","TELANGANA","TS","TG").contains(value.trim().toUpperCase(Locale.ROOT))) return "36";
        throw OrderApiException.conflict("BILL_JURISDICTION_UNAVAILABLE", "Bill calculation is unavailable for this address.");
    }
    private static String money(BigDecimal value) { return value.setScale(2,RoundingMode.UNNECESSARY).toPlainString(); }
    private static BigDecimal amount(JsonNode node, String field) {
        String value=node.path(field).asText();
        if (!node.path(field).isTextual() || !value.matches("[0-9]{1,14}\\.[0-9]{2}"))
            throw OrderApiException.serviceUnavailable("BILL_PREVIEW_INVALID", "Bill totals could not be verified.");
        return new BigDecimal(value);
    }
}
