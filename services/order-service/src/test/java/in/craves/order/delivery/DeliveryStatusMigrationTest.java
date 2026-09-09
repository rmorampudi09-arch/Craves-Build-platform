package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
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
}
