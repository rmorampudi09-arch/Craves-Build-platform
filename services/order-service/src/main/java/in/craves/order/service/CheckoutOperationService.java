package in.craves.order.service;

import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.CheckoutOperationDtos.Request;
import in.craves.order.web.CheckoutOperationDtos.Response;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CheckoutOperationService {
    private final JdbcTemplate jdbc;
    private final OrderService orders;
    public CheckoutOperationService(JdbcTemplate jdbc, OrderService orders) { this.jdbc = jdbc; this.orders = orders; }

    @Transactional
    public Response execute(CravesPrincipal principal, UUID operationId, Request request) {
        requireCustomer(principal);
        String fingerprint = CheckoutOperationFingerprint.of(request);
        jdbc.update("INSERT INTO order_schema.checkout_operation (customer_identity_id, operation_id, request_hash) "
            + "VALUES (?, ?, ?) ON CONFLICT (customer_identity_id, operation_id) DO NOTHING",
            principal.identityId(), operationId, fingerprint);
        Operation operation = jdbc.queryForObject("SELECT request_hash, checkout_id FROM order_schema.checkout_operation "
            + "WHERE customer_identity_id = ? AND operation_id = ? FOR UPDATE",
            (rs, row) -> new Operation(rs.getString(1), rs.getObject(2, UUID.class)), principal.identityId(), operationId);
        if (operation == null || !fingerprint.equals(operation.fingerprint())) {
            throw OrderApiException.conflict("CHECKOUT_OPERATION_CONFLICT", "This checkout attempt has different details. Review your cart.");
        }
        if (operation.checkoutId() != null) return new Response(operationId, "SUCCEEDED", operation.checkoutId());
        orders.requireUnchangedCart(principal, request.expectedCart());
        // Reuse proxied checkout: existing pricing, launch policy, active owned address and immutable snapshots.
        var checkout = orders.checkout(principal, new CheckoutRequest(request.deliveryAddressId(), request.note()));
        jdbc.update("UPDATE order_schema.checkout_operation SET checkout_id = ?, completed_at = now() "
            + "WHERE customer_identity_id = ? AND operation_id = ?", checkout.id(), principal.identityId(), operationId);
        return new Response(operationId, "SUCCEEDED", checkout.id());
    }

    @Transactional(readOnly = true)
    public Response get(CravesPrincipal principal, UUID operationId) {
        requireCustomer(principal);
        return jdbc.query("SELECT checkout_id FROM order_schema.checkout_operation "
            + "WHERE customer_identity_id = ? AND operation_id = ? AND checkout_id IS NOT NULL",
            (rs, row) -> new Response(operationId, "SUCCEEDED", rs.getObject(1, UUID.class)), principal.identityId(), operationId)
            .stream().findFirst().orElseThrow(() -> OrderApiException.notFound("CHECKOUT_OPERATION_NOT_FOUND", "Checkout attempt is not available yet."));
    }

    private static void requireCustomer(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CUSTOMER")) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, "Customer access is required");
    }
    private record Operation(String fingerprint, UUID checkoutId) {}
}
