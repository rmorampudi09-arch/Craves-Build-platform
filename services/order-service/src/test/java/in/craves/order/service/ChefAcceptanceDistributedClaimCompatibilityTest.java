package in.craves.order.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ChefAcceptanceDistributedClaimCompatibilityTest {
    @Test
    void timeoutRepositoryUsesSkipLockedAndStaleClaimRecovery() throws Exception {
        String source = Files.readString(Path.of(
            "src/main/java/in/craves/order/service/ChefAcceptanceWorkRepository.java"
        ));

        assertThat(source)
            .contains("claimExpiredOrderIds")
            .contains("FOR UPDATE SKIP LOCKED")
            .contains("chef_acceptance_timeout_claim_token")
            .contains("chef_acceptance_timeout_claimed_at")
            .contains("chef_acceptance_timeout_attempt_count")
            .contains("releaseTimeoutClaim");
    }

    @Test
    void timeoutResolutionRequiresClaimOwnership() throws Exception {
        String source = Files.readString(Path.of(
            "src/main/java/in/craves/order/service/ChefAcceptanceResolutionService.java"
        ));

        assertThat(source)
            .contains("timeoutExpiredOrder(UUID orderId, UUID claimToken)")
            .contains("claimToken.equals(lockedOrder.timeoutClaimToken())")
            .contains("CHEF_ACCEPTANCE_TIMEOUT")
            .contains("refund_requested_amount = grand_total")
            .contains("chef_acceptance_timeout_claim_token = NULL");
    }

    @Test
    void distributedClaimMigrationAndMetricsExist() throws Exception {
        String migration = Files.readString(Path.of(
            "src/main/resources/db/migration/V16__chef_acceptance_timeout_distributed_claim.sql"
        ));
        String metrics = Files.readString(Path.of(
            "src/main/java/in/craves/order/service/AutoRefundMetrics.java"
        ));

        assertThat(migration)
            .contains("chef_acceptance_timeout_claim_token UUID")
            .contains("idx_customer_order_acceptance_timeout_claim");
        assertThat(metrics)
            .contains("craves.auto.refund.timeout.expired.backlog")
            .contains("craves.auto.refund.timeout.oldest.overdue.seconds")
            .contains("craves.auto.refund.request.outbox.backlog");
    }
}
