package in.craves.advanced.semanticsearch;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E09 semantic search: everyday phrases turned into Catalog searches through staff-curated concepts; no AI provider yet. */
@Configuration
public class SemanticSearchModule {
    public static final String ID = "semantic-search";

    @Bean
    FeatureModule semanticSearchFeature() {
        return new FeatureModule(ID, "adv_semantic_search", List.of("/api/v1/advanced/semantic-search"),
                List.of("/api/v1/advanced/semantic-search/plan", "/api/v1/advanced/semantic-search/dishes"), List.of());
    }
}
