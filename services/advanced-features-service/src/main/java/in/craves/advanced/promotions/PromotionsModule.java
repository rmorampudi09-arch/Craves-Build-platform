package in.craves.advanced.promotions;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E23 promotions and coupons: staff-configured offers, cart quotes, and redemptions reserved and confirmed at checkout. */
@Configuration
public class PromotionsModule {
    public static final String ID = "promotions";

    @Bean
    FeatureModule promotionsFeature() {
        return new FeatureModule(ID, "adv_promotions", List.of("/api/v1/advanced/promotions"),
                List.of("/api/v1/advanced/promotions/offers"), List.of());
    }
}
