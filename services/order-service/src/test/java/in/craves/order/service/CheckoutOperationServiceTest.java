package in.craves.order.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.*;
import in.craves.order.web.CheckoutOperationDtos.*;
import java.sql.ResultSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class CheckoutOperationServiceTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final OrderService orders = mock(OrderService.class);
    final CheckoutOperationService service = new CheckoutOperationService(jdbc, orders);
    final UUID customer = UUID.randomUUID(), operationId = UUID.randomUUID(), checkoutId = UUID.randomUUID();
    final CravesPrincipal principal = new CravesPrincipal(customer, null, Set.of("CUSTOMER"));
    final Request request = new Request(UUID.randomUUID(), null, new CartSnapshotRequest(UUID.randomUUID(), List.of()));

    @SuppressWarnings({"rawtypes", "unchecked"})
    void result(String hash, UUID checkout) throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString(1)).thenReturn(hash);
        when(rs.getObject(2, UUID.class)).thenReturn(checkout);
        when(jdbc.queryForObject(contains("FOR UPDATE"), any(RowMapper.class), eq(customer), eq(operationId)))
            .thenAnswer(call -> ((RowMapper) call.getArgument(1)).mapRow(rs, 0));
    }
    @Test void matchingReplayReturnsOriginalOrderWithoutTouchingNewCart() throws Exception {
        result(CheckoutOperationFingerprint.of(request), checkoutId);
        assertThat(service.execute(principal, operationId, request)).isEqualTo(new Response(operationId, "SUCCEEDED", checkoutId));
        verifyNoInteractions(orders);
    }
    @Test void changedOperationPayloadRejectsBeforeAnyCartMutation() throws Exception {
        result("different", checkoutId);
        assertThatThrownBy(() -> service.execute(principal, operationId, request)).isInstanceOf(OrderApiException.class);
        verifyNoInteractions(orders);
    }
    @Test void newOperationMustValidateSnapshotBeforeCallingExistingCheckout() throws Exception {
        result(CheckoutOperationFingerprint.of(request), null);
        var checkout = mock(CheckoutResponse.class);
        when(checkout.id()).thenReturn(checkoutId);
        when(orders.checkout(eq(principal), any(CheckoutRequest.class))).thenReturn(checkout);
        assertThat(service.execute(principal, operationId, request).checkoutId()).isEqualTo(checkoutId);
        var order = inOrder(orders, jdbc);
        order.verify(orders).requireUnchangedCart(principal, request.expectedCart());
        order.verify(orders).checkout(principal, new CheckoutRequest(request.deliveryAddressId(), null));
        order.verify(jdbc).update(startsWith("UPDATE order_schema.checkout_operation"), eq(checkoutId), eq(customer), eq(operationId));
    }
    @Test void changedCartCannotCreateCheckoutOrCompleteOperation() throws Exception {
        result(CheckoutOperationFingerprint.of(request), null);
        when(orders.requireUnchangedCart(principal, request.expectedCart())).thenThrow(OrderApiException.conflict("CART_CHANGED", "changed"));
        assertThatThrownBy(() -> service.execute(principal, operationId, request)).isInstanceOf(OrderApiException.class);
        verify(orders, never()).checkout(any(), any());
        verify(jdbc, never()).update(startsWith("UPDATE order_schema.checkout_operation"), any(), any(), any());
    }
    @Test void nonCustomerCannotWriteOrReadOperation() {
        assertThatThrownBy(() -> service.execute(new CravesPrincipal(customer, null, Set.of("CHEF")), operationId, request))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> service.get(null, operationId)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verifyNoInteractions(jdbc, orders);
    }
}
