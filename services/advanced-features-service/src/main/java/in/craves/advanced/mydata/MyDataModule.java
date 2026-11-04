package in.craves.advanced.mydata;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** "Download my data": one export of what Craves keeps about the caller across services. Stores nothing. */
@Configuration
public class MyDataModule {
    public static final String ID = "my-data";

    @Bean
    FeatureModule myDataFeature() {
        return new FeatureModule(ID, "adv_my_data", List.of("/api/v1/advanced/my-data"), List.of(), List.of());
    }
}
