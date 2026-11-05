package in.craves.auth.deletion;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.config.WorkerSchedulingConfiguration;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import java.time.Clock;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.autoconfigure.task.TaskSchedulingAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** Boots the deletion beans against the real application.yml, so the documented environment names are what binds. */
class AccountDeletionStartupTest {
    private static final String[] ON = {
        "CRAVES_ACCOUNT_DELETION_ENABLED=true",
        "CRAVES_ACCOUNT_DELETION_WORKER_ENABLED=true",
        "CRAVES_ACCOUNT_DELETION_SUBSCRIPTION_BASE_URL=https://subscription.example.azurecontainerapps.io",
        "CRAVES_ACCOUNT_DELETION_ORDER_BASE_URL=https://order.example.azurecontainerapps.io",
        "CRAVES_ACCOUNT_DELETION_INTEGRATION_BASE_URL=https://integration.example.azurecontainerapps.io",
        "CRAVES_ACCOUNT_DELETION_ADVANCED_BASE_URL=https://advanced.example.azurecontainerapps.io",
        "CRAVES_ACCOUNT_DELETION_NOTIFICATION_BASE_URL=https://notification.example.azurecontainerapps.io",
        "CRAVES_ACCOUNT_DELETION_CATALOG_BASE_URL=https://catalog.example.azurecontainerapps.io",
        "CRAVES_ACCOUNT_DELETION_USER_CHEF_BASE_URL=https://user-chef.example.azurecontainerapps.io",
        "CRAVES_ACCOUNT_DELETION_REFERRAL_BASE_URL=https://referral.example.azurecontainerapps.io",
        "CRAVES_ACCOUNT_DELETION_SUBSCRIPTION_CREDENTIAL=test-credential",
        "CRAVES_ACCOUNT_DELETION_ORDER_CREDENTIAL=test-credential",
        "CRAVES_ACCOUNT_DELETION_INTEGRATION_CREDENTIAL=test-credential",
        "CRAVES_ACCOUNT_DELETION_ADVANCED_CREDENTIAL=test-credential",
        "CRAVES_ACCOUNT_DELETION_NOTIFICATION_CREDENTIAL=test-credential",
        "CRAVES_ACCOUNT_DELETION_CATALOG_CREDENTIAL=test-credential",
        "CRAVES_ACCOUNT_DELETION_USER_CHEF_CREDENTIAL=test-credential",
        "CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    };

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withConfiguration(AutoConfigurations.of(ConfigurationPropertiesAutoConfiguration.class, TaskSchedulingAutoConfiguration.class))
        .withUserConfiguration(AccountDeletionProperties.class, AccountErasureClient.class, AccountDeletionService.class,
            AccountDeletionEngine.class, AccountDeletionWorker.class, DeletionNotices.class,
            DeletionNoticeExecutorConfiguration.class, AccountDeletionRepository.class, AccountLock.class,
            AuthAccountEraser.class, WorkerSchedulingConfiguration.class, AccountDeletionController.class, AdminAccountDeletionController.class)
        .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
        .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
        .withBean(FirebaseApp.class, () -> FirebaseApp.initializeApp(FirebaseOptions.builder() // AuthAccountEraser reads the app's options, so a mock won't do
            .setCredentials(GoogleCredentials.create(new AccessToken("test", null))).setProjectId("test").build(),
            UUID.randomUUID().toString()))
        .withBean(Clock.class, Clock::systemUTC)
        .withBean(ObjectMapper.class, ObjectMapper::new)
        .withBean(AuthIdentityRepository.class, () -> mock(AuthIdentityRepository.class))
        .withBean(AuthIdentityRoleRepository.class, () -> mock(AuthIdentityRoleRepository.class))
        .withBean(JwtProperties.class, () -> mock(JwtProperties.class));

    @Test void startsWithBothSwitchesOnAndEverySettingByItsEnvironmentName() {
        runner.withPropertyValues(ON).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(AccountDeletionWorker.class);
            AccountDeletionProperties p = context.getBean(AccountDeletionProperties.class);
            assertThat(p.isEnabled()).isTrue();
            assertThat(p.getServices().keySet()).containsAll(AccountErasureClient.ERASE_ORDER);
        });
    }

    @Test void refusesToStartWhenOneBaseUrlIsMissing() {
        runner.withPropertyValues(ON).withPropertyValues("CRAVES_ACCOUNT_DELETION_CATALOG_BASE_URL=").run(context ->
            assertThat(context).hasFailed().getFailure().rootCause()
                .hasMessageContaining("base URL for catalog must be https"));
    }

    @Test void refusesToStartWhenTheReferralKeyIsShort() {
        runner.withPropertyValues(ON).withPropertyValues("CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64=AAAA").run(context ->
            assertThat(context).hasFailed().getFailure().rootCause().hasMessageContaining("at least 32 bytes"));
    }

    @Test void startsWithEverythingOffAndNoWorker() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(AccountDeletionWorker.class);
        });
    }
}
