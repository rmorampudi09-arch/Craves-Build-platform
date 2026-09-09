package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class DeliveryStatusMigrationTest {
    @Test
    void migrationContainsInboxProjectionHistoryAndTerminalResults() throws Exception {
        String sql;
        try (var input = new ClassPathResource(
            "db/migration/V9__delivery_status_consumer.sql"
        ).getInputStream()) {
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertThat(sql)
            .contains("delivery_status_inbox")
            .contains("order_delivery_status_history")
            .contains("delivery_status_observed_at")
            .contains("TERMINAL_PROTECTED")
            .contains("STALE")
            .contains("NO_CHANGE")
            .contains("DELIVERED")
            .contains("RETURNED")
            .doesNotContain("UPDATE order_schema.customer_order\nSET delivery_status");
    }

    @Test
    void productionAppliedV20IsRestoredByteForByteForFlywayValidation() throws Exception {
        ClassPathResource appliedV20 = new ClassPathResource(
            "db/migration/V20__chef_acceptance_timeout_distributed_claim.sql"
        );
        assertThat(appliedV20.exists()).isTrue();
        assertThat(flywayChecksum(appliedV20)).isEqualTo(182093619L);

        String sql;
        try (var input = appliedV20.getInputStream()) {
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertThat(sql)
            .contains("chef_acceptance_timeout_claim_token")
            .contains("chef_acceptance_timeout_claimed_at")
            .contains("chef_acceptance_timeout_attempt_count")
            .contains("chef_acceptance_timeout_last_error")
            .contains("idx_customer_order_acceptance_timeout_claim");
    }

    @Test
    void commercialStatusBackfillUsesV21AndDoesNotReuseProductionV20() throws Exception {
        ClassPathResource conflictingV20 = new ClassPathResource(
            "db/migration/V20__delivery_commercial_status_projection.sql"
        );
        assertThat(conflictingV20.exists()).isFalse();

        ClassPathResource v21 = new ClassPathResource(
            "db/migration/V21__delivery_commercial_status_projection.sql"
        );
        assertThat(v21.exists()).isTrue();

        String sql;
        try (var input = v21.getInputStream()) {
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertThat(sql)
            .contains(":v21:out-for-delivery")
            .contains(":v21:delivered")
            .contains("delivery_status IN ('PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF')")
            .contains("delivery_status = 'DELIVERED'")
            .contains("SET status = 'OUT_FOR_DELIVERY'")
            .contains("SET status = 'DELIVERED'");
    }

    private long flywayChecksum(ClassPathResource resource) throws Exception {
        CRC32 crc32 = new CRC32();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
            resource.getInputStream(),
            StandardCharsets.UTF_8
        ))) {
            String line;
            while ((line = reader.readLine()) != null) {
                crc32.update(line.getBytes(StandardCharsets.UTF_8));
            }
        }
        return crc32.getValue();
    }
}
