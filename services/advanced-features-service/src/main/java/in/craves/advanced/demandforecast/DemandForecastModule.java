package in.craves.advanced.demandforecast;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E22 demand forecasting for chefs, worked out on request from the kitchen's own recent orders; nothing is stored. */
@Configuration
public class DemandForecastModule {
    public static final String ID = "demand-forecast";

    @Bean
    FeatureModule demandForecastFeature() {
        return new FeatureModule(ID, "adv_demand_forecast", List.of("/api/v1/advanced/demand-forecast"), List.of(), List.of());
    }
}
