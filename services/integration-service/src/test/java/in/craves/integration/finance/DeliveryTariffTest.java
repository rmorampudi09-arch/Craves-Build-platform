package in.craves.integration.finance;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class DeliveryTariffTest {
    // Synthetic test prices, not Craves commercial defaults.
    static DeliveryTariff tariff(DeliveryTariff.Increment increment) {
        return new DeliveryTariff("20.00","2","10.00","10",DeliveryTariff.DistanceBasis.STRAIGHT_LINE,increment);
    }
    @Test void explicitBaseIncludedDistanceAndProRata() {
        var t=tariff(DeliveryTariff.Increment.PRO_RATA);
        assertEquals("20.00",t.quote("0","18").beforeTax());
        assertEquals("20.00",t.quote("2","18").beforeTax());
        assertEquals("25.00",t.quote("2.5","18").beforeTax());
        assertEquals("4.50",t.quote("2.5","18").gst());
        assertEquals("29.50",t.quote("2.5","18").total());
    }
    @Test void startedKilometreIsExplicitAndMaximumIsEnforced() {
        var t=tariff(DeliveryTariff.Increment.STARTED_KILOMETRE);
        assertEquals("30.00",t.quote("2.001","0").beforeTax());
        assertEquals("100.00",t.quote("10","0").beforeTax());
        assertThrows(IllegalArgumentException.class,()->t.quote("10.001","0"));
    }
    @Test void exactPaiseRoundingAndNoImplicitPrices() {
        var t=new DeliveryTariff("0.00","0","1.00","10",DeliveryTariff.DistanceBasis.STRAIGHT_LINE,DeliveryTariff.Increment.PRO_RATA);
        assertEquals("0.01",t.quote("0.005","0").beforeTax());
        assertThrows(IllegalArgumentException.class,()->new DeliveryTariff("1.001","0","1.00","10",t.distanceBasis(),t.increment()));
        assertThrows(IllegalArgumentException.class,()->new DeliveryTariff("1.00","11","1.00","10",t.distanceBasis(),t.increment()));
        assertThrows(NullPointerException.class,()->new DeliveryTariff("1.00","0","1.00","10",null,t.increment()));
        for(String invalid:new String[]{"-1","NaN","1e2","1.0001",""})assertThrows(IllegalArgumentException.class,()->t.quote(invalid,"0"));
    }
    @Test void geometryUsesVerifiedCoordinatesAndNeverPretendsToBeRoadDistance() {
        var t=tariff(DeliveryTariff.Increment.PRO_RATA);var zero=BigDecimal.ZERO;
        assertEquals("0.000",t.between(zero,zero,zero,zero,"18").distanceKm());
        assertEquals("1.112",t.between(zero,zero,zero,new BigDecimal("0.01"),"18").distanceKm());
        assertThrows(IllegalArgumentException.class,()->t.between(null,zero,zero,zero,"18"));
        assertThrows(IllegalArgumentException.class,()->t.between(new BigDecimal("91"),zero,zero,zero,"18"));
        var road=new DeliveryTariff("20.00","2","10.00","10",DeliveryTariff.DistanceBasis.ROAD_ROUTE,t.increment());
        assertThrows(IllegalStateException.class,()->road.between(zero,zero,zero,zero,"18"));
    }
}
