package in.craves.subscription.plan;

import in.craves.subscription.config.JdbcTimes;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PlanImageRepository {
    public record PlanImage(String contentType, byte[] bytes) {
    }

    private final JdbcTemplate jdbcTemplate;

    public PlanImageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** The only place that spells the public image URL; v changes on every upload so the one-day cache is never stale. */
    public static String imagePath(UUID planId, Instant updatedAt) {
        return updatedAt == null ? null : "/api/v1/subscriptions/plans/" + planId + "/image?v=" + updatedAt.getEpochSecond();
    }

    public Optional<PlanImage> findImage(UUID planId) {
        return jdbcTemplate.query(
            "SELECT content_type, image_bytes FROM subscription_schema.subscription_plan_image WHERE plan_id = ?",
            (rs, rowNum) -> new PlanImage(rs.getString("content_type"), rs.getBytes("image_bytes")),
            planId
        ).stream().findFirst();
    }

    public Optional<Instant> findUpdatedAt(UUID planId) {
        return jdbcTemplate.query(
            "SELECT updated_at FROM subscription_schema.subscription_plan_image WHERE plan_id = ?",
            (rs, rowNum) -> JdbcTimes.instant(rs, "updated_at"),
            planId
        ).stream().findFirst();
    }

    /** Relative image URL, or null when the plan has no image. */
    public String findImagePath(UUID planId) {
        return imagePath(planId, findUpdatedAt(planId).orElse(null));
    }
}
