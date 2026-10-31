package in.craves.advanced.kitchencapacity;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E05 small batches with portion holds and E20 the chef's live extra preparation time. */
@Configuration
public class KitchenCapacityModule {
    public static final String ID = "kitchen-capacity";

    @Bean
    FeatureModule kitchenCapacityFeature() {
        return new FeatureModule(ID, "adv_kitchen_capacity", List.of("/api/v1/advanced/kitchen-capacity"),
                List.of("/api/v1/advanced/kitchen-capacity/menu-items/*/batches", "/api/v1/advanced/kitchen-capacity/kitchens/*/load"),
                List.of());
    }
}
