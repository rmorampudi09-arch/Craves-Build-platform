package in.craves.advanced.foodlists;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E04 private and shareable food lists (+ E40 private taste data). */
@Configuration
public class FoodListsModule {
    public static final String ID = "food-lists";

    @Bean
    FeatureModule foodListsFeature() {
        return new FeatureModule(ID, "adv_food_lists",
                List.of("/api/v1/food-lists", "/api/v1/shared-food-lists"),
                List.of("/api/v1/shared-food-lists/*"),
                List.of());
    }
}
