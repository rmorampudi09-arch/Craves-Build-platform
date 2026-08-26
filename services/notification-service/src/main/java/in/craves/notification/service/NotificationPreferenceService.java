package in.craves.notification.service;

import in.craves.notification.api.NotificationPreferenceResponse;
import in.craves.notification.api.NotificationPreferenceUpsertRequest;
import in.craves.notification.domain.NotificationChannel;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotificationPreferenceService {
    private static final Set<String> SUPPORTED_TOPICS = Set.of(
        "ORDER_UPDATES",
        "OFFERS",
        "CHEF_ANNOUNCEMENTS",
        "REMINDERS",
        "REFERRALS",
        "REWARDS"
    );

    private final JdbcTemplate jdbcTemplate;

    public NotificationPreferenceService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<NotificationPreferenceResponse> list(UUID userId) {
        return jdbcTemplate.query(
            """
                SELECT user_id, topic, channel, enabled, updated_at
                FROM notification_schema.notification_preference
                WHERE user_id = ?
                ORDER BY topic ASC, channel ASC
                """,
            this::mapPreference,
            userId
        );
    }

    @Transactional
    public NotificationPreferenceResponse upsert(UUID userId, NotificationPreferenceUpsertRequest request) {
        String topic = normalizeTopic(request.topic());
        jdbcTemplate.update(
            """
                INSERT INTO notification_schema.notification_preference (user_id, topic, channel, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, now(), now())
                ON CONFLICT (user_id, topic, channel)
                DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
                """,
            userId,
            topic,
            request.channel().name(),
            request.enabled()
        );
        return jdbcTemplate.query(
            """
                SELECT user_id, topic, channel, enabled, updated_at
                FROM notification_schema.notification_preference
                WHERE user_id = ? AND topic = ? AND channel = ?
                """,
            this::mapPreference,
            userId,
            topic,
            request.channel().name()
        ).stream().findFirst().orElseThrow(() -> new IllegalStateException("Preference was not persisted"));
    }

    public boolean isEnabled(UUID userId, String topic, NotificationChannel channel) {
        String normalizedTopic = normalizeTopic(topic);
        Boolean enabled = jdbcTemplate.query(
            """
                SELECT enabled
                FROM notification_schema.notification_preference
                WHERE user_id = ? AND topic = ? AND channel = ?
                """,
            rs -> rs.next() ? rs.getBoolean("enabled") : null,
            userId,
            normalizedTopic,
            channel.name()
        );
        return enabled == null || enabled;
    }

    private NotificationPreferenceResponse mapPreference(ResultSet rs, int rowNum) throws SQLException {
        return new NotificationPreferenceResponse(
            rs.getObject("user_id", UUID.class),
            rs.getString("topic"),
            NotificationChannel.valueOf(rs.getString("channel")),
            rs.getBoolean("enabled"),
            rs.getObject("updated_at", OffsetDateTime.class)
        );
    }

    private static String normalizeTopic(String topic) {
        if (topic == null || topic.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Notification preference topic is required");
        }
        String normalized = topic.trim().toUpperCase(Locale.ROOT);
        if (!SUPPORTED_TOPICS.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Notification preference topic is not supported");
        }
        return normalized;
    }
}
