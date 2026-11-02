package in.craves.advanced.aisearch;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * E08 conversational AI search: a chat turned into a semantic-search (M19) plan by an AI provider the owner chooses.
 * Signed-in only (each turn costs a provider call); nothing is stored; 503 AI_SEARCH_NOT_CONFIGURED until a provider is set.
 */
@Configuration
public class AiSearchModule {
    public static final String ID = "ai-search";

    @Bean
    FeatureModule aiSearchFeature() {
        return new FeatureModule(ID, "adv_ai_search", List.of("/api/v1/advanced/ai-search"), List.of(), List.of());
    }
}
