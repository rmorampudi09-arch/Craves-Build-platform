package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.SchedulerLagWatchdog;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.admin.FleetAdminController;
import in.craves.integration.fleet.admin.FleetOpsController;
import in.craves.integration.fleet.admin.FleetSetupController;
import in.craves.integration.fleet.money.FleetEarnings;
import in.craves.integration.fleet.money.FleetMoneyController;
import in.craves.integration.fleet.money.FleetPayouts;
import in.craves.integration.fleet.rider.FleetLocationController;
import in.craves.integration.fleet.rider.FleetLocationService;
import in.craves.integration.fleet.rider.FleetRiderController;
import in.craves.integration.fleet.rider.FleetSignupController;
import in.craves.integration.fleet.support.FleetSupportController;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.RazorpayXPayoutClient;
import in.craves.integration.payout.bank.BankDataCipher;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.util.ClassUtils;
import org.springframework.web.client.RestClient;

/** With CRAVES_FLEET_ENABLED off, no fleet bean, pool or job exists. */
class FleetConfigurationTest {
    @Configuration(proxyBeanMethods = false)
    @ComponentScan(basePackages = "in.craves.integration.fleet",
        excludeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*Test(\\$.*)?"))
    static class FleetPackage {
    }

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
        .withUserConfiguration(FleetPackage.class)
        .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
        .withBean(ObjectMapper.class, ObjectMapper::new)
        .withBean(RestClient.Builder.class, RestClient::builder)
        .withBean(BankDataCipher.class, () -> mock(BankDataCipher.class))
        .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
        // Rider pay is posted to the existing financial journal.
        .withBean(LedgerPostingService.class, () -> mock(LedgerPostingService.class))
        // Dispatch hands orders on to Borzo and Pidge through the existing delivery beans.
        .withBean(DeliveryProviderRouter.class, () -> mock(DeliveryProviderRouter.class))
        .withBean(DeliveryCommandRepository.class, () -> mock(DeliveryCommandRepository.class))
        .withBean(DeliveryAssignmentRepository.class, () -> mock(DeliveryAssignmentRepository.class))
        .withBean(BorzoPidgeHandoffRepository.class, () -> mock(BorzoPidgeHandoffRepository.class))
        .withBean(DeliveryOutboxRepository.class, () -> mock(DeliveryOutboxRepository.class))
        .withBean(DeliveryStatusUpdateService.class, () -> mock(DeliveryStatusUpdateService.class));

    @Test
    void withEveryFlagOffNoFleetBeanOrJobExists() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(Arrays.stream(context.getBeanDefinitionNames())
                .map(name -> context.getType(name))
                .filter(type -> type != null && type.getPackageName().startsWith("in.craves.integration.fleet")
                    && !type.getName().contains("Test")))
                .isEmpty();
            assertThat(context).doesNotHaveBean(FleetConfiguration.FLEET_SCHEDULER);
        });
    }

    @Test
    void theRiderApiAloneStartsNothing() {
        runner.withPropertyValues("craves.fleet.rider-api-enabled=true").run(context ->
            assertThat(context).doesNotHaveBean(FleetPolicyStore.class).doesNotHaveBean(FleetConfiguration.FLEET_SCHEDULER));
    }

    @Test
    void theFleetFlagStartsTheReadersTestModeAndAWatchedPool() {
        runner.withPropertyValues("craves.fleet.enabled=true").run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(FleetPolicyStore.class).hasSingleBean(FleetTestMode.class)
                .hasSingleBean(FleetAdminController.class).hasSingleBean(FleetApiAdvice.class).hasSingleBean(FleetEarnings.class)
                .hasSingleBean(FleetOpsController.class).hasSingleBean(FleetSetupController.class);
            assertThat(context.getBean(FleetConfiguration.FLEET_SCHEDULER)).isInstanceOf(SchedulerLagWatchdog.MonitoredTaskScheduler.class);
            assertThat(context.getBean(FleetProperties.class).testMode()).as("test mode is on unless switched off").isTrue();
        });
    }

    @Test
    void theRiderApiNeedsBothFlags() {
        runner.withPropertyValues("craves.fleet.enabled=true").run(context ->
            assertThat(context).doesNotHaveBean(FleetRiderController.class).doesNotHaveBean(FleetMoneyController.class)
                .doesNotHaveBean(FleetSupportController.class));
        runner.withPropertyValues("craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true").run(context ->
            assertThat(context).hasNotFailed().hasSingleBean(FleetRiderController.class).hasSingleBean(FleetSignupController.class).hasSingleBean(FleetMoneyController.class)
                .hasSingleBean(FleetSupportController.class));
    }

    @Test
    void locationIngestNeedsItsOwnFlagToo() {
        runner.withPropertyValues("craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true").run(context ->
            assertThat(context).hasNotFailed().doesNotHaveBean(FleetLocationController.class).doesNotHaveBean(FleetLocationService.class));
        runner.withPropertyValues("craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true", "craves.fleet.location-ingest-enabled=true")
            .run(context -> assertThat(context).hasNotFailed().hasSingleBean(FleetLocationController.class));
    }

    @Test
    void theFleetPoolHasOneThreadForEachFleetJob() {
        runner.withPropertyValues("craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true", "craves.fleet.location-ingest-enabled=true")
            .run(context -> {
                List<String> jobs = Arrays.stream(context.getBeanDefinitionNames()).map(context::getType)
                    .filter(type -> type != null && type.getPackageName().startsWith("in.craves.integration.fleet"))
                    .map(ClassUtils::getUserClass).distinct()
                    .flatMap(type -> Arrays.stream(type.getDeclaredMethods())
                        .filter(method -> AnnotatedElementUtils.hasAnnotation(method, Scheduled.class))
                        .map(method -> type.getSimpleName() + "#" + method.getName()))
                    .toList();
                assertThat(jobs).containsExactlyInAnyOrder("RiderJoinsExitsExport#writeYesterday", "FleetSlotService#settleDue",
                    "FleetDispatchJobs#tick", "FleetLocationService#createTrackDays", "FleetEarnings#tick", "FleetPhotoRetention#daily");
                assertThat(context.getBean(FleetConfiguration.FLEET_SCHEDULER, ThreadPoolTaskScheduler.class).getPoolSize())
                    .isEqualTo(jobs.size());
            });
    }

    @Test
    void askingForAutomatedPayoutsStartsNothingThatCouldPayRazorpayX() {
        runner.withPropertyValues("craves.fleet.enabled=true", "craves.fleet.payout-execution-enabled=true").run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(FleetPayouts.class).doesNotHaveBean(RazorpayXPayoutClient.class);
            assertThat(context.getBean(FleetProperties.class).payoutExecutionEnabled()).isTrue();
        });
    }

    @Test
    void fleetSchedulingIsScopedToTheFleetFlag() {
        assertThat(AnnotatedElementUtils.hasAnnotation(FleetConfiguration.class, EnableScheduling.class)).isTrue();
        ConditionalOnProperty condition = AnnotatedElementUtils.findMergedAnnotation(FleetConfiguration.class, ConditionalOnProperty.class);
        assertThat(condition).isNotNull();
        assertThat(condition.name()).containsExactly("craves.fleet.enabled");
        assertThat(condition.havingValue()).isEqualTo("true");
    }

    @Test
    void withTestModeOffEveryRiderAndKitchenIsAllowedWithoutALookup() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        FleetTestMode open = new FleetTestMode(jdbc, FleetDatabase.properties(false));
        assertThat(open.riderAllowed(UUID.randomUUID())).isTrue();
        assertThat(open.kitchenAllowed(UUID.randomUUID())).isTrue();
        verifyNoInteractions(jdbc);
    }
}
