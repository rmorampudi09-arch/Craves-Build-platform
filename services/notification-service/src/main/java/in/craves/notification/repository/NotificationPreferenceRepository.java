package in.craves.notification.repository;

import in.craves.notification.api.NotificationPreferenceCategory;
import in.craves.notification.api.NotificationPreferenceResponse;
import in.craves.notification.api.UpdateNotificationPreferenceRequest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationPreferenceRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public NotificationPreferenceRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void ensureDefaults(UUID identityId) {
        for (NotificationPreferenceCategory category : NotificationPreferenceCategory.values()) {
            MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("id", UUID.randomUUID())
                .addValue("identityId", identityId)
                .addValue("category", category.name());
            jdbc.update("""
                INSERT INTO notification_schema.notification_preference (
                    id,
                    recipient_identity_id,
                    category_key,
                    in_app_enabled,
                    push_enabled,
                    email_enabled,
                    sms_enabled,
                    created_at,
                    updated_at
                )
                VALUES (:id, :identityId, :category, true, true, true, false, now(), now())
                ON CONFLICT (recipient_identity_id, category_key) DO NOTHING
                """, parameters);
        }
    }

    public List<NotificationPreferenceResponse> findByIdentity(UUID identityId) {
        return jdbc.query("""
            SELECT id, recipient_identity_id, user_role, category_key, in_app_enabled, push_enabled, email_enabled, sms_enabled, updated_at
            FROM notification_schema.notification_preference
            WHERE recipient_identity_id = :identityId
            ORDER BY category_key ASC
            """, Map.of("identityId", identityId), this::mapPreference);
    }

    public void updatePreference(UUID identityId, UpdateNotificationPreferenceRequest update) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("identityId", identityId)
            .addValue("category", update.category().name())
            .addValue("inAppEnabled", update.inAppEnabled())
            .addValue("pushEnabled", update.pushEnabled())
            .addValue("emailEnabled", update.emailEnabled())
            .addValue("smsEnabled", update.smsEnabled());
        jdbc.update("""
            UPDATE notification_schema.notification_preference
            SET in_app_enabled = :inAppEnabled,
                push_enabled = :pushEnabled,
                email_enabled = :emailEnabled,
                sms_enabled = :smsEnabled,
                updated_at = now()
            WHERE recipient_identity_id = :identityId
              AND category_key = :category
            """, parameters);
    }

    private NotificationPreferenceResponse mapPreference(ResultSet rs, int rowNum) throws SQLException {
        return new NotificationPreferenceResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("recipient_identity_id", UUID.class),
            rs.getString("user_role"),
            NotificationPreferenceCategory.valueOf(rs.getString("category_key")),
            rs.getBoolean("in_app_enabled"),
            rs.getBoolean("push_enabled"),
            rs.getBoolean("email_enabled"),
            rs.getBoolean("sms_enabled"),
            rs.getObject("updated_at", OffsetDateTime.class)
        );
    }
}
