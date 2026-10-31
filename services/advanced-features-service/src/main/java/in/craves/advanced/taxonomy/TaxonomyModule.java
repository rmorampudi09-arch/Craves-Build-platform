package in.craves.advanced.taxonomy;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E10 regional cuisine and dietary taxonomy: a staff-maintained vocabulary, chef labels per dish, public browse. */
@Configuration
public class TaxonomyModule {
    public static final String ID = "taxonomy";

    @Bean
    FeatureModule taxonomyFeature() {
        return new FeatureModule(ID, "adv_taxonomy", List.of("/api/v1/advanced/taxonomy"),
                List.of("/api/v1/advanced/taxonomy/vocabulary", "/api/v1/advanced/taxonomy/resolve", "/api/v1/advanced/taxonomy/menu-items",
                        "/api/v1/advanced/taxonomy/menu-items/*"),
                List.of("/api/v1/advanced/taxonomy/menu-items/lookup"));
    }
}
