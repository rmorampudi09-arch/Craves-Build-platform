package in.craves.advanced.foodfacts;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E19 ingredient, allergen and nutrition transparency with provenance and staff verification. */
@Configuration
public class FoodFactsModule {
    public static final String ID = "food-facts";

    @Bean
    FeatureModule foodFactsFeature() {
        return new FeatureModule(ID, "adv_food_facts", List.of("/api/v1/food-facts"),
                List.of("/api/v1/food-facts/menu-items/*", "/api/v1/food-facts/free-from", "/api/v1/food-facts/vocabulary"),
                List.of("/api/v1/food-facts/menu-items/lookup"));
    }
}
