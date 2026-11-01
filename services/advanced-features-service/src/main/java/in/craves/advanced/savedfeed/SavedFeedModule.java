package in.craves.advanced.savedfeed;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E01/E02/E06 Saved feed: favorites with today's state, recovery for unavailable ones, and the caller's own familiarity. */
@Configuration
public class SavedFeedModule {
    public static final String ID = "saved-feed";

    @Bean
    FeatureModule savedFeedFeature() {
        return new FeatureModule(ID, "adv_saved_feed", List.of("/api/v1/advanced/saved-feed"), List.of(), List.of());
    }
}
