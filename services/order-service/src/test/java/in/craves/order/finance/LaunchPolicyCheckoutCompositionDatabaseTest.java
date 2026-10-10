package in.craves.order.finance;

import in.craves.order.exception.OrderApiException;
import in.craves.order.launchpolicy.LaunchPolicyModels.LaunchPolicyResponse;
import in.craves.order.launchpolicy.LaunchPolicyService;
import in.craves.order.service.CatalogClient.CatalogMenuItem;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.env.MapPropertySource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Re-run the existing finance/referral/operation contract with launch validation enabled as well. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class LaunchPolicyCheckoutCompositionDatabaseTest extends CheckoutOperationDatabaseTest {
    @Override void registerAdditionalOwners() {
        super.registerAdditionalOwners();
        var policy = mock(LaunchPolicyService.class);
        when(policy.requireActive()).thenReturn(new LaunchPolicyResponse(UUID.randomUUID(), "Disposable fixture policy",
            new BigDecimal("200.00"), 5000, 0, 60, "INR", true, UUID.randomUUID(), Instant.now(), Instant.now()));
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("launch-test",
            Map.of("craves.launch-policy.enforcement-enabled", "true")));
        context.registerBean("launchPolicyService", LaunchPolicyService.class, () -> policy);
        context.scan("in.craves.order.launchpolicy");
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void repricedBelowMinimumNeverCallsFinanceOrReferralAndLeavesNoCheckoutEffects(boolean operation) {
        var request = request(); var before = jdbc.queryForList("SELECT * FROM order_schema.cart_item ORDER BY id");
        when(catalog.getActiveMenuItem(menu)).thenReturn(new CatalogMenuItem(menu, kitchen, "Fixture meal", "Fixture meal",
            "MEAL", "VEG", new BigDecimal("150.00"), "INR", 1, 20, "MILD", 500, false, true, "ACTIVE"));
        var error = assertThrows(OrderApiException.class, () -> {
            if (operation) operations().execute(actor, UUID.randomUUID(), request); else checkout();
        });
        assertEquals("MINIMUM_ORDER_NOT_MET", error.code());
        assertEquals(before, jdbc.queryForList("SELECT * FROM order_schema.cart_item ORDER BY id"));
        for (String table : java.util.List.of("checkout", "customer_order", "order_item", "checkout_operation",
            "finance_source_outbox", "referral_source_outbox", "order_financial_snapshot", "referral_order_binding",
            "notification_outbox", "domain_event_outbox")) assertEquals(0, count(table), table);
        verifyNoInteractions(finance, referral, notifications);
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void repricedEligibleCheckoutRetainsExactFinanceReferralAndOperationBindings(boolean operation) {
        jdbc.update("UPDATE order_schema.cart_item SET unit_price_snapshot=150.00");
        UUID id = operation ? operations().execute(actor, UUID.randomUUID(), request()).checkoutId() : checkout().id();
        var value = orders.getCheckout(actor, id);
        assertEquals(new BigDecimal("369.00"), value.foodSubtotal());
        assertEquals(new BigDecimal("433.47"), value.grandTotal());
        assertEquals(1, count("checkout")); assertEquals(1, count("order_financial_snapshot"));
        assertEquals(1, count("finance_source_outbox")); assertEquals(1, count("referral_order_binding"));
        assertEquals(1, count("referral_source_outbox")); assertEquals(operation ? 1 : 0, count("checkout_operation"));
        assertEquals(0, count("cart_item")); verify(finance, times(1)).quote(any());
        verify(notifications, times(1)).recordOrderCreated(argThat(c -> c.foodSubtotal().compareTo(new BigDecimal("369.00")) == 0));
    }
}
