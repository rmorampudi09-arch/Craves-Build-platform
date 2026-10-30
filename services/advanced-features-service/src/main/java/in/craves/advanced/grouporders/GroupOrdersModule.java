package in.craves.advanced.grouporders;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E13 group ordering and shared carts: one kitchen, host pays, host locks and hands the basket to their own cart. */
@Configuration
public class GroupOrdersModule {
    public static final String ID = "group-orders";

    @Bean
    FeatureModule groupOrdersFeature() {
        return new FeatureModule(ID, "adv_group_orders", List.of("/api/v1/group-orders"), List.of(), List.of());
    }
}
