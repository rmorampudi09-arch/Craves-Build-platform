package in.craves.advanced.partneroffers;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E36 post-order partner offers: staff-curated offers from partner brands, unlocked by a paid order. */
@Configuration
public class PartnerOffersModule {
    public static final String ID = "partner-offers";

    @Bean
    FeatureModule partnerOffersFeature() {
        return new FeatureModule(ID, "adv_partner_offers", List.of("/api/v1/advanced/partner-offers"), List.of(), List.of());
    }
}
