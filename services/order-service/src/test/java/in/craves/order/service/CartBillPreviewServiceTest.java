package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.exception.OrderApiException;
import in.craves.order.finance.FinanceSourceClient;
import in.craves.order.security.CravesPrincipal;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class CartBillPreviewServiceTest {
    private final UUID cart=UUID.randomUUID(),line=UUID.randomUUID();
    private final Instant at=Instant.parse("2026-09-30T00:00:00Z");
    private CartBillPreviewService.ExpectedCart expected(int quantity) {
        return new CartBillPreviewService.ExpectedCart(cart,List.of(new CartBillPreviewService.Line(line,quantity,at)));
    }
    private List<CartBillPreviewService.StoredLine> actual() {
        return List.of(new CartBillPreviewService.StoredLine(line,UUID.randomUUID(),UUID.randomUUID(),2,new BigDecimal("125.50"),at));
    }
    @Test void acceptsOnlyTheExactCartRevision() {
        assertDoesNotThrow(()->CartBillPreviewService.requireSnapshot(expected(2),actual()));
        assertThrows(OrderApiException.class,()->CartBillPreviewService.requireSnapshot(expected(3),actual()));
        assertThrows(OrderApiException.class,()->CartBillPreviewService.requireSnapshot(expected(2),List.of()));
    }
    @Test void rejectsDuplicateLinesAndChangedTimestamps() {
        var duplicate=new CartBillPreviewService.ExpectedCart(cart,List.of(expected(2).items().getFirst(),expected(2).items().getFirst()));
        var lines=List.of(actual().getFirst(),actual().getFirst());
        assertThrows(OrderApiException.class,()->CartBillPreviewService.requireSnapshot(duplicate,lines));
        var changed=new CartBillPreviewService.ExpectedCart(cart,List.of(new CartBillPreviewService.Line(line,2,at.plusSeconds(1))));
        assertThrows(OrderApiException.class,()->CartBillPreviewService.requireSnapshot(changed,actual()));
    }
    @Test void rejectsAnotherCustomersCartBeforeCatalogFinanceOrAnyWrites() {
        var jdbc=mock(JdbcTemplate.class);
        var catalog=mock(CatalogClient.class);
        var addresses=mock(CustomerAddressClient.class);
        var orders=mock(OrderService.class);
        var finance=mock(FinanceSourceClient.class);
        var service=new CartBillPreviewService(jdbc,catalog,addresses,orders,finance,new ObjectMapper());
        var customer=new CravesPrincipal(UUID.randomUUID(),null,Set.of("CUSTOMER"));
        assertThrows(OrderApiException.class,()->service.preview(customer,new CartBillPreviewService.Request(UUID.randomUUID(),expected(2))));
        verifyNoInteractions(catalog,addresses,orders,finance);
        assertTrue(mockingDetails(jdbc).getInvocations().stream().noneMatch(i->i.getMethod().getName().equals("update")));
    }
    @Test void requiresCustomerRoleBeforeAnyDatabaseRead() {
        var jdbc=mock(JdbcTemplate.class);
        var service=new CartBillPreviewService(jdbc,mock(CatalogClient.class),mock(CustomerAddressClient.class),mock(OrderService.class),mock(FinanceSourceClient.class),new ObjectMapper());
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.preview(new CravesPrincipal(UUID.randomUUID(),null,Set.of("CHEF")),new CartBillPreviewService.Request(UUID.randomUUID(),expected(2))));
        verifyNoInteractions(jdbc);
    }
    @Test void returnsFinanceAmountsWithoutCreatingCheckoutOrClearingCart() {
        var jdbc=mock(JdbcTemplate.class);
        var catalog=mock(CatalogClient.class);
        var addresses=mock(CustomerAddressClient.class);
        var orders=mock(OrderService.class);
        var finance=mock(FinanceSourceClient.class);
        var json=new ObjectMapper();
        var customer=new CravesPrincipal(UUID.randomUUID(),null,Set.of("CUSTOMER"));
        var addressId=UUID.randomUUID();
        var stored=actual();
        when(jdbc.queryForObject(anyString(),eq(Boolean.class),eq(cart),eq(customer.identityId()))).thenReturn(true);
        when(jdbc.query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<CartBillPreviewService.StoredLine>>any(),eq(cart))).thenReturn(stored);
        var item=mock(CatalogClient.CatalogMenuItem.class);
        when(item.id()).thenReturn(stored.getFirst().menuItemId());
        when(item.kitchenId()).thenReturn(stored.getFirst().kitchenId());
        when(item.currency()).thenReturn("INR");when(item.price()).thenReturn(new BigDecimal("125.50"));
        when(catalog.getActiveMenuItem(item.id())).thenReturn(item);
        var kitchen=mock(CatalogClient.CatalogKitchen.class);when(kitchen.state()).thenReturn("Telangana");
        when(catalog.getKitchen(item.kitchenId())).thenReturn(kitchen);
        var address=mock(CustomerAddressClient.CustomerAddress.class);when(address.state()).thenReturn("TS");
        when(addresses.getActiveOwnedAddress(customer.identityId(),addressId)).thenReturn(address);
        var policy=mock(in.craves.order.web.ApiDtos.ChargePolicyResponse.class);
        when(policy.deliveryFeeFlat()).thenReturn(new BigDecimal("30.00"));when(orders.currentChargePolicy()).thenReturn(policy);
        var amounts=json.createObjectNode().put("policyId",UUID.randomUUID().toString()).put("policyRevision",2).put("currency","INR")
            .put("foodSubtotal","251.00").put("platformFee","5.00").put("deliveryFee","30.00").put("taxAmount","18.85").put("grandTotal","304.85");
        when(finance.cartPreview(any())).thenReturn(amounts);
        var service=new CartBillPreviewService(jdbc,catalog,addresses,orders,finance,json);
        var result=service.preview(customer,new CartBillPreviewService.Request(addressId,expected(2)));
        assertEquals("304.85",result.grandTotal());assertEquals(expected(2),result.expectedCart());
        assertEquals(addressId,result.deliveryAddressId());
        assertTrue(mockingDetails(jdbc).getInvocations().stream().noneMatch(i->i.getMethod().getName().equals("update")));
        verify(orders,never()).checkout(any(),any());verify(orders,never()).clearCart(any());
    }
}
