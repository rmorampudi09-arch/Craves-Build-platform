package in.craves.advanced.policies;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Handbook 015, 062, 072, 088: staff-set, versioned policies and pure evaluators other services (M24) and the apps can call. */
@Configuration
public class PoliciesModule {
    public static final String ID = "policies";

    @Bean
    FeatureModule policiesFeature() {
        return new FeatureModule(ID, "adv_policies", List.of("/api/v1/advanced/policies"), List.of(), List.of());
    }
}
