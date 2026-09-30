package in.craves.integration.finance;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class CartBillPreviewFinanceServiceTest {
    private final UUID id = UUID.randomUUID();
    private FinancePolicy policy(DeliveryTariff tariff) {
        return new FinancePolicy(LocalDate.of(2026,9,14),true,false,false,48,0,60,"7","5","18","18","18",
            FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"5.00",false,"approved-test",tariff);
    }
    private CartBillPreviewFinanceService.Request request() {
        return new CartBillPreviewFinanceService.Request("251.00","30.00","36","36",
            new BigDecimal("17.45"),new BigDecimal("78.39"),new BigDecimal("17.45"),new BigDecimal("78.39"));
    }
    @Test void usesExactExistingFinanceTaxesAndFlatDelivery() {
        var result=CartBillPreviewFinanceService.calculate(request(),id,2,policy(null),Instant.now());
        assertEquals("18.85",result.taxAmount());
        assertEquals("304.85",result.grandTotal());
        assertEquals("5.00",result.platformFee());
        assertEquals(id,result.policyId());
    }
    @Test void usesApprovedDistanceTariffInsteadOfFlatDelivery() {
        var tariff=new DeliveryTariff("20.00","1","8.00","10",DeliveryTariff.DistanceBasis.STRAIGHT_LINE,DeliveryTariff.Increment.PRO_RATA);
        var result=CartBillPreviewFinanceService.calculate(request(),id,2,policy(tariff),Instant.now());
        assertEquals("20.00",result.deliveryFee());
        assertEquals("293.05",result.grandTotal());
    }
    @Test void failsClosedForUnreviewedJurisdictionOrInactivePolicy() {
        var invalid=new CartBillPreviewFinanceService.Request("251.00","30.00","36","29",null,null,null,null);
        assertThrows(IllegalArgumentException.class,()->CartBillPreviewFinanceService.calculate(invalid,id,2,policy(null),Instant.now()));
        assertThrows(IllegalStateException.class,()->CartBillPreviewFinanceService.calculate(request(),null,2,policy(null),Instant.now()));
        assertThrows(IllegalStateException.class,()->CartBillPreviewFinanceService.calculate(request(),id,2,policy(null),Instant.parse("2026-01-01T00:00:00Z")));
    }
    @Test void missingActivePolicyDoesNotWriteOrFallBackToInventedFees() {
        var jdbc=mock(JdbcTemplate.class);
        var service=new CartBillPreviewFinanceService(jdbc,new ObjectMapper());
        assertThrows(IllegalStateException.class,()->service.preview(request()));
        assertTrue(mockingDetails(jdbc).getInvocations().stream().noneMatch(i->i.getMethod().getName().equals("update")));
    }
}
