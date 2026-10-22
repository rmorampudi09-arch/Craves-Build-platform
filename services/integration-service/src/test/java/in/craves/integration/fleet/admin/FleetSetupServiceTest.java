package in.craves.integration.fleet.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.DispatchPolicyInput;
import in.craves.integration.fleet.admin.FleetAdminModels.PilotNote;
import in.craves.integration.fleet.admin.FleetAdminModels.RateCardDraft;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** Input checks that answer 400 before anything is read or written. */
class FleetSetupServiceTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final FleetAdminService admin = mock(FleetAdminService.class);
    final FleetSetupService setup = new FleetSetupService(jdbc, new com.fasterxml.jackson.databind.ObjectMapper(),
        mock(FleetPolicyStore.class), admin, FleetDatabase.properties(true));
    final Admin ops = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");

    @Test
    void storedColumnsHaveTheirApiNames() {
        assertThat(FleetPolicyStore.RATE_CARD_FIELDS.stream().map(FleetSetupService::camel)).containsExactly("basePaise", "baseDropM",
            "dropPerKmPaise", "pickupFreeM", "pickupPerKmPaise", "waitFreeMinutes", "waitPerMinutePaise", "slotGuaranteePerHourPaise",
            "cancellationFeePaise", "returnPerKmPaise", "unreachableWaitMinutes");
        assertThat(FleetPolicyStore.DISPATCH_POLICY_FIELDS.stream().map(FleetSetupService::camel)).containsExactly("offerSeconds",
            "fleetStageSeconds", "radiusM", "pickupDetourPercent", "perOrderOverheadPaise", "costGuardPremiumPaise", "pidgeStageSeconds");
    }

    @Test
    void aDraftNeedsEveryValueAStartAndAnEnglishSummary() {
        invalid(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), draft(null, Instant.now(), Map.of("en", List.of("New pay.")), null)));
        invalid(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), draft(-1L, Instant.now(), Map.of("en", List.of("New pay.")), null)));
        invalid(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), draft(4000L, null, Map.of("en", List.of("New pay.")), null)));
        invalid(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), draft(4000L, Instant.now(), Map.of("te", List.of("కొత్త")), null)));
        invalid(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), draft(4000L, Instant.now(), Map.of("en", List.of(" ")), null)));
        invalid(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), draft(4000L, Instant.now(), Map.of("en", List.of("New pay.")),
            "http://craves.in/terms")));
        invalid(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), new DispatchPolicyInput("on", 40, 60, 5000, 130, 500L, 1000L, 600, null)));
        invalid(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), new DispatchPolicyInput("off", 40, null, 5000, 130, 500L, 1000L, 600, null)));
        verifyNoInteractions(jdbc, admin);
    }

    @Test
    void summariesNotesAndLinksAreTrimmed() {
        assertThat(FleetSetupService.summary(Map.of("hi", List.of("नया"), "en", List.of(" New pay. "))))
            .containsExactly(Map.entry("en", List.of("New pay.")), Map.entry("hi", List.of("नया")));
        assertThat(FleetSetupService.note(new PilotNote("  "))).isNull();
        assertThat(FleetSetupService.note(null)).isNull();
        assertThat(FleetSetupService.fullTextUrl(" https://craves.in/riders/terms ")).isEqualTo("https://craves.in/riders/terms");
        invalid(() -> FleetSetupService.summary(Map.of("en", List.of("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"))));
    }

    private static RateCardDraft draft(Long basePaise, Instant effectiveFrom, Map<String, List<String>> summary, String url) {
        return new RateCardDraft(basePaise, 2000, 900L, 1000, 900L, 8, 150L, 8000L, 2000L, 900L, 10, effectiveFrom, summary, url, null);
    }

    private static void invalid(Runnable work) {
        assertThatThrownBy(work::run).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("VALIDATION_FAILED"));
    }
}
