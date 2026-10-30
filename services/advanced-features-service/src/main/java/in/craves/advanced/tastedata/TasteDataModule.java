package in.craves.advanced.tastedata;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** E40 private taste data: one place to see, export and erase what the advanced features hold about you. */
@Configuration
public class TasteDataModule {
    public static final String ID = "taste-data";

    @Bean
    FeatureModule tasteDataFeature() {
        return new FeatureModule(ID, "adv_taste_data", List.of("/api/v1/advanced/my-taste-data"), List.of(), List.of());
    }
}
