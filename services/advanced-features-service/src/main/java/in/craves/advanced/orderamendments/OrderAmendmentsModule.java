package in.craves.advanced.orderamendments;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E17 order amendments and substitutions: changes to a placed order that the customer and the kitchen's chef agree to. */
@Configuration
public class OrderAmendmentsModule {
    public static final String ID = "order-amendments";

    @Bean
    FeatureModule orderAmendmentsFeature() {
        return new FeatureModule(ID, "adv_order_amendments", List.of("/api/v1/advanced/order-amendments"), List.of(), List.of());
    }
}
