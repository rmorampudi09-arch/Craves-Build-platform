package in.craves.advanced.menuoptions;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E16 menu modifiers (option groups with chef-set prices) and meal-period menus (each kitchen's meal hours). */
@Configuration
public class MenuOptionsModule {
    public static final String ID = "menu-options";

    @Bean
    FeatureModule menuOptionsFeature() {
        return new FeatureModule(ID, "adv_menu_options", List.of("/api/v1/advanced/menu-options"),
                List.of("/api/v1/advanced/menu-options/menu-items/*", "/api/v1/advanced/menu-options/kitchens/*/meal-periods"),
                List.of("/api/v1/advanced/menu-options/menu-items/lookup"));
    }
}
