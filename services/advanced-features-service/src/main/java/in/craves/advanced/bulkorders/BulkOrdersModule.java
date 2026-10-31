package in.craves.advanced.bulkorders;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E14 party and bulk orders: request, chef quote with the staff-set deposit share, acceptance. */
@Configuration
public class BulkOrdersModule {
    public static final String ID = "bulk-orders";

    @Bean
    FeatureModule bulkOrdersFeature() {
        return new FeatureModule(ID, "adv_bulk_orders", List.of("/api/v1/advanced/bulk-orders"),
                List.of("/api/v1/advanced/bulk-orders/policy"), List.of());
    }
}
