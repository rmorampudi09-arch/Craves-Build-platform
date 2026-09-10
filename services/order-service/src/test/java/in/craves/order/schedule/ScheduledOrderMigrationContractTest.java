package in.craves.order.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class ScheduledOrderMigrationContractTest {
    @Test
    void migrationIsFailClosedAndAddsRequiredEvidence() throws Exception {
        ClassPathResource resource = new ClassPathResource(
            "db/migration/V23__scheduled_order_foundation.sql"
        );
        assertThat(resource.exists()).isTrue();
        String sql = resource.getContentAsString(StandardCharsets.UTF_8);

        assertThat(sql).contains("scheduled_order_policy");
        assertThat(sql).contains("scheduled_order_policy_audit");
        assertThat(sql).contains("scheduled_order_request");
        assertThat(sql).contains("scheduled_order_kitchen_response");
        assertThat(sql).contains("uk_scheduled_order_request_idempotency");
        assertThat(sql).contains("uk_scheduled_order_request_active_checkout");
        assertThat(sql).contains("PAYMENT_BEFORE_CHEF_CONFIRMATION");
        assertThat(sql).contains("PAYMENT_AFTER_ALL_CHEFS_CONFIRM");
        assertThat(sql).contains("chef_identity_id UUID NOT NULL");
        assertThat(sql).contains("requested_fulfilment_at");
        assertThat(sql).contains("idx_scheduled_response_chef_queue");
        assertThat(sql).doesNotContain("INSERT INTO order_schema.scheduled_order_policy");
        assertThat(sql).doesNotContain("DELETE FROM order_schema.customer_order");
        assertThat(sql).doesNotContain("DROP TABLE");
    }
}
