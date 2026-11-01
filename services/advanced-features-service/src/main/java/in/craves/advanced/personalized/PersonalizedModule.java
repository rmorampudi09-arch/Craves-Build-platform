package in.craves.advanced.personalized;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E07 personalized ranking: reorders dishes the app already shows, from the person's own saves and orders, only with consent. */
@Configuration
public class PersonalizedModule {
    public static final String ID = "personalized";

    @Bean
    FeatureModule personalizedFeature() {
        return new FeatureModule(ID, "adv_personalized", List.of("/api/v1/advanced/personalized"), List.of(), List.of());
    }
}
