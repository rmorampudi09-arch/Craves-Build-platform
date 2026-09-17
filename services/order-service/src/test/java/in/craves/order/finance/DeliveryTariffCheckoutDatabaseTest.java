package in.craves.order.finance;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.env.MapPropertySource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class DeliveryTariffCheckoutDatabaseTest {
    FinancialCheckoutDatabaseTest f;
    @BeforeEach void setup(){
        f=new FinancialCheckoutDatabaseTest(){@Override void registerAdditionalOwners(){
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("distance-test",Map.of("CRAVES_DELIVERY_TARIFF_SOURCE_READY","true")));
        }};f.setup();
    }
    @AfterEach void close(){if(f!=null)f.close();}
    @Test void checkoutAndNotificationFreezeTheAuthoritativeTariffAmount(){
        doAnswer(invocation->{
            var request=(com.fasterxml.jackson.databind.JsonNode)invocation.getArgument(0);
            var coordinates=request.path("orders").get(0).path("deliveryCoordinates");
            assertEquals(0,new BigDecimal("17.40").compareTo(new BigDecimal(coordinates.path("pickupLatitude").asText())));
            assertEquals(0,new BigDecimal("78.41").compareTo(new BigDecimal(coordinates.path("dropoffLongitude").asText())));
            var result=f.quote(request);var snapshot=(ObjectNode)result.path("snapshots").get(0);
            snapshot.putObject("policy").putObject("deliveryTariff").put("baseCharge","20.00");
            snapshot.putObject("deliveryQuote").put("beforeTax","20.00");
            snapshot.put("delivery","20.00").put("customerTax","22.05").put("customerTotal","411.05");
            snapshot.remove("hash");snapshot.put("hash",f.hash(snapshot));result.put("total","411.05");return result;
        }).when(f.finance).quote(any());
        var result=f.checkout();assertEquals(new BigDecimal("20.00"),result.deliveryFee());assertEquals(new BigDecimal("411.05"),result.grandTotal());
        assertEquals(new BigDecimal("20.00"),result.orders().getFirst().deliveryFee());
        verify(f.notifications).recordOrderCreated(argThat(checkout->checkout.grandTotal().compareTo(new BigDecimal("411.05"))==0));
        assertEquals(1,f.count("order_financial_snapshot"));assertEquals(0,f.count("cart_item"));
    }
    @Test void missingTariffBreakdownCannotSilentlyChangeDelivery(){
        doAnswer(invocation->{var result=f.quote(invocation.getArgument(0));var snapshot=(ObjectNode)result.path("snapshots").get(0);
            snapshot.putObject("policy").putObject("deliveryTariff").put("baseCharge","20.00");
            snapshot.remove("hash");snapshot.put("hash",f.hash(snapshot));return result;}).when(f.finance).quote(any());
        assertThrows(RuntimeException.class,f::checkout);assertEquals(0,f.count("checkout"));assertEquals(1,f.count("cart_item"));verifyNoInteractions(f.notifications);
    }
}
