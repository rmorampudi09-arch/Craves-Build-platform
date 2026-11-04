package in.craves.advanced.accountdeletion;

import in.craves.advanced.platform.module.FeatureModule;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Account deletion requests: customers and chefs ask Craves to delete their account in the app; staff work the queue. */
@Configuration
public class AccountDeletionModule {
    public static final String ID = "account-deletion";

    @Bean
    FeatureModule accountDeletionFeature() {
        return new FeatureModule(ID, "adv_account_deletion", List.of("/api/v1/advanced/account-deletion"), List.of(), List.of());
    }
}
