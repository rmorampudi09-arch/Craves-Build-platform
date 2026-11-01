package in.craves.advanced.liveactivities;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E39 live order activity: a customer's order shown on the lock screen / Dynamic Island, with state read from Order service. */
@Configuration
public class LiveActivitiesModule {
    public static final String ID = "live-activities";

    @Bean
    FeatureModule liveActivitiesFeature() {
        return new FeatureModule(ID, "adv_live_activities", List.of("/api/v1/advanced/live-activities"), List.of(), List.of());
    }
}
