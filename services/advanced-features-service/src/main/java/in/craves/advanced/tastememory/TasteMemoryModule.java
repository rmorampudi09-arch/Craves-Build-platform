package in.craves.advanced.tastememory;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E03 remembered spice, oil and portion choices: the person's own, exported and erased with my-taste-data. */
@Configuration
public class TasteMemoryModule {
    public static final String ID = "taste-memory";

    @Bean
    FeatureModule tasteMemoryFeature() {
        return new FeatureModule(ID, "adv_taste_memory", List.of("/api/v1/advanced/taste-memory"), List.of(), List.of());
    }
}
