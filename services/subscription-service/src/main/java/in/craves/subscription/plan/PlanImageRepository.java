package in.craves.subscription.plan;

import in.craves.subscription.config.JdbcTimes;
import in.craves.subscription.exception.ApiException;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

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

    /**
     * Inserts or replaces the plan's photo. updated_at is set to now() on every call because the public URL's ?v= is derived from it.
     * The plan row is touched first, guarded on owner and DRAFT/REJECTED, so a concurrent submit cannot slip a photo change into review.
     */
    @Transactional
    public void upsert(UUID planId, UUID chefIdentityId, String contentType, byte[] bytes) {
        int touched = jdbcTemplate.update(
            "UPDATE subscription_schema.subscription_plan SET updated_at = now() " +
                "WHERE id = ? AND chef_identity_id = ? AND status IN ('DRAFT','REJECTED')",
            planId, chefIdentityId
        );
        if (touched != 1) {
            throw ApiException.conflict("PLAN_EDIT_CONFLICT", "Meal plan changed while its photo was being uploaded");
        }
        jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_plan_image " +
                "(plan_id, content_type, image_bytes, size_bytes, updated_by_identity_id, updated_at) VALUES (?, ?, ?, ?, ?, now()) " +
                "ON CONFLICT (plan_id) DO UPDATE SET content_type = EXCLUDED.content_type, image_bytes = EXCLUDED.image_bytes, " +
                "size_bytes = EXCLUDED.size_bytes, updated_by_identity_id = EXCLUDED.updated_by_identity_id, updated_at = now()",
            planId, contentType, bytes, bytes.length, chefIdentityId
        );
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
