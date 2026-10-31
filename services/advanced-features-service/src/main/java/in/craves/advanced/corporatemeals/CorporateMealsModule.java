package in.craves.advanced.corporatemeals;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E15 corporate and team meals: companies, their members and the meal share they pay on terms staff enter. */
@Configuration
public class CorporateMealsModule {
    public static final String ID = "corporate-meals";

    @Bean
    FeatureModule corporateMealsFeature() {
        return new FeatureModule(ID, "adv_corporate_meals", List.of("/api/v1/advanced/corporate-meals"), List.of(), List.of());
    }
}
