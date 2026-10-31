package in.craves.advanced.trust;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E29 trust: reports for moderation, order disputes, and staff risk flags with per-person and per-kitchen counts. */
@Configuration
public class TrustModule {
    public static final String ID = "trust";

    @Bean
    FeatureModule trustFeature() {
        return new FeatureModule(ID, "adv_trust", List.of("/api/v1/advanced/trust"), List.of("/api/v1/advanced/trust/disputes/policy"), List.of());
    }
}
