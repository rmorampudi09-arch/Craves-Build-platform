package in.craves.advanced.chefinsights;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E21 chef business analytics, computed on request from the chef's own orders in Order service; nothing is stored. */
@Configuration
public class ChefInsightsModule {
    public static final String ID = "chef-insights";

    @Bean
    FeatureModule chefInsightsFeature() {
        return new FeatureModule(ID, "adv_chef_insights", List.of("/api/v1/advanced/chef-insights"), List.of(), List.of());
    }
}
