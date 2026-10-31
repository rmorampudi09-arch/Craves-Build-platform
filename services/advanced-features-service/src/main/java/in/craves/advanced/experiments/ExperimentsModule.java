package in.craves.advanced.experiments;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E30 experiments (A/B variants) and consented product analytics. */
@Configuration
public class ExperimentsModule {
    public static final String ID = "experiments";

    @Bean
    FeatureModule experimentsFeature() {
        return new FeatureModule(ID, "adv_experiments", List.of("/api/v1/advanced/experiments"), List.of(), List.of());
    }
}
