package in.craves.order.review;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class ReviewMigrationContractTest {
    @Test
    void migrationContainsOwnershipModerationAndScaleGuards() throws Exception {
        ClassPathResource resource = new ClassPathResource(
            "db/migration/V22__order_reviews_and_trust_foundation.sql"
        );
        assertThat(resource.exists()).isTrue();
        String sql = resource.getContentAsString(StandardCharsets.UTF_8);

        assertThat(sql).contains("uk_order_review_customer_order");
        assertThat(sql).contains("PENDING_MODERATION");
        assertThat(sql).contains("WHERE status = 'PUBLISHED'");
        assertThat(sql).contains("order_review_revision");
        assertThat(sql).contains("order_review_moderation_audit");
        assertThat(sql).contains("order_review_helpful_vote");
        assertThat(sql).contains("order_review_report");
        assertThat(sql).contains("idx_order_review_public_kitchen_cursor");
        assertThat(sql).contains("delivery_rating");
        assertThat(sql).doesNotContain("INSERT INTO order_schema.review_tag_definition");
    }
}
