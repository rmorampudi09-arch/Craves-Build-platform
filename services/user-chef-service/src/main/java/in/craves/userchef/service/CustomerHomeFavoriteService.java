package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.CursorPage;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteChefResponse;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteEntityType;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteKitchenResponse;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteWatchChannel;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteWatchResponse;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerHomeFavoriteService {
    private static final int DEFAULT_PAGE_SIZE = 50;
    private static final int MAX_PAGE_SIZE = 100;

    private final JdbcTemplate jdbcTemplate;

    public CustomerHomeFavoriteService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public CursorPage<FavoriteChefResponse> listFavoriteChefs(CurrentUser user, Integer requestedLimit, String cursor) {
        requireCustomer(user);
        int limit = pageSize(requestedLimit);
        EntityCursor decoded = decodeEntityCursor(cursor);
        List<FavoriteChefResponse> rows;
        if (decoded == null) {
            rows = jdbcTemplate.query(
                "SELECT chef_identity_id, created_at FROM customer_favorite_chef " +
                    "WHERE identity_id = ? ORDER BY created_at DESC, chef_identity_id ASC LIMIT ?",
                this::mapFavoriteChef,
                user.identityId(),
                limit + 1
            );
        } else {
            rows = jdbcTemplate.query(
                "SELECT chef_identity_id, created_at FROM customer_favorite_chef " +
                    "WHERE identity_id = ? AND (created_at < ? OR (created_at = ? AND chef_identity_id > ?)) " +
                    "ORDER BY created_at DESC, chef_identity_id ASC LIMIT ?",
                this::mapFavoriteChef,
                user.identityId(),
                java.sql.Timestamp.from(decoded.createdAt()),
                java.sql.Timestamp.from(decoded.createdAt()),
                decoded.entityId(),
                limit + 1
            );
        }
        return entityPage(rows, limit, FavoriteChefResponse::createdAt, FavoriteChefResponse::chefIdentityId);
    }

    @Transactional
    public FavoriteChefResponse saveFavoriteChef(CurrentUser user, UUID chefIdentityId) {
        requireCustomer(user);
        requireId("CHEF_ID_REQUIRED", "Chef identity id is required", chefIdentityId);
        if (user.identityId().equals(chefIdentityId)) {
            throw ApiException.badRequest("CANNOT_FAVORITE_SELF", "A customer cannot favorite their own chef identity");
        }
        Boolean approved = jdbcTemplate.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM chef_application WHERE identity_id = ? AND status = 'APPROVED')",
            Boolean.class,
            chefIdentityId
        );
        if (!Boolean.TRUE.equals(approved)) {
            throw ApiException.notFound("APPROVED_CHEF_NOT_FOUND", "Approved home chef was not found");
        }
        jdbcTemplate.update(
            "INSERT INTO customer_favorite_chef (identity_id, chef_identity_id, created_at) " +
                "VALUES (?, ?, now()) ON CONFLICT (identity_id, chef_identity_id) DO NOTHING",
            user.identityId(),
            chefIdentityId
        );
        return findFavoriteChef(user.identityId(), chefIdentityId);
    }

    @Transactional
    public void removeFavoriteChef(CurrentUser user, UUID chefIdentityId) {
        requireCustomer(user);
        requireId("CHEF_ID_REQUIRED", "Chef identity id is required", chefIdentityId);
        jdbcTemplate.update(
            "DELETE FROM customer_favorite_chef WHERE identity_id = ? AND chef_identity_id = ?",
            user.identityId(),
            chefIdentityId
        );
    }

    public CursorPage<FavoriteKitchenResponse> listFavoriteKitchens(CurrentUser user, Integer requestedLimit, String cursor) {
        requireCustomer(user);
        int limit = pageSize(requestedLimit);
        EntityCursor decoded = decodeEntityCursor(cursor);
        List<FavoriteKitchenResponse> rows;
        if (decoded == null) {
            rows = jdbcTemplate.query(
                "SELECT kitchen_id, created_at FROM customer_favorite_kitchen " +
                    "WHERE identity_id = ? ORDER BY created_at DESC, kitchen_id ASC LIMIT ?",
                this::mapFavoriteKitchen,
                user.identityId(),
                limit + 1
            );
        } else {
            rows = jdbcTemplate.query(
                "SELECT kitchen_id, created_at FROM customer_favorite_kitchen " +
                    "WHERE identity_id = ? AND (created_at < ? OR (created_at = ? AND kitchen_id > ?)) " +
                    "ORDER BY created_at DESC, kitchen_id ASC LIMIT ?",
                this::mapFavoriteKitchen,
                user.identityId(),
                java.sql.Timestamp.from(decoded.createdAt()),
                java.sql.Timestamp.from(decoded.createdAt()),
                decoded.entityId(),
                limit + 1
            );
        }
        return entityPage(rows, limit, FavoriteKitchenResponse::createdAt, FavoriteKitchenResponse::kitchenId);
    }

    @Transactional
    public FavoriteKitchenResponse saveFavoriteKitchen(CurrentUser user, UUID kitchenId) {
        requireCustomer(user);
        requireId("KITCHEN_ID_REQUIRED", "Kitchen id is required", kitchenId);
        jdbcTemplate.update(
            "INSERT INTO customer_favorite_kitchen (identity_id, kitchen_id, created_at) " +
                "VALUES (?, ?, now()) ON CONFLICT (identity_id, kitchen_id) DO NOTHING",
            user.identityId(),
            kitchenId
        );
        return findFavoriteKitchen(user.identityId(), kitchenId);
    }

    @Transactional
    public void removeFavoriteKitchen(CurrentUser user, UUID kitchenId) {
        requireCustomer(user);
        requireId("KITCHEN_ID_REQUIRED", "Kitchen id is required", kitchenId);
        jdbcTemplate.update(
            "DELETE FROM customer_favorite_kitchen WHERE identity_id = ? AND kitchen_id = ?",
            user.identityId(),
            kitchenId
        );
    }

    public List<FavoriteWatchResponse> listWatches(
        CurrentUser user,
        FavoriteEntityType entityType,
        Integer requestedLimit
    ) {
        requireCustomer(user);
        if (entityType == null) {
            throw ApiException.badRequest("WATCH_ENTITY_TYPE_REQUIRED", "entityType is required");
        }
        int limit = pageSize(requestedLimit);
        return jdbcTemplate.query(
            "SELECT entity_type, entity_id, channel, enabled, last_notified_at, last_notification_window_key, created_at, updated_at " +
                "FROM customer_favorite_watch WHERE identity_id = ? AND entity_type = ? " +
                "ORDER BY updated_at DESC, entity_id ASC, channel ASC LIMIT ?",
            this::mapWatch,
            user.identityId(),
            entityType.name(),
            limit
        );
    }

    @Transactional
    public FavoriteWatchResponse upsertWatch(
        CurrentUser user,
        FavoriteEntityType entityType,
        UUID entityId,
        FavoriteWatchChannel channel,
        boolean enabled
    ) {
        requireCustomer(user);
        if (entityType == null) {
            throw ApiException.badRequest("WATCH_ENTITY_TYPE_REQUIRED", "Watch entity type is required");
        }
        requireId("WATCH_ENTITY_ID_REQUIRED", "Watch entity id is required", entityId);
        if (channel == null) {
            throw ApiException.badRequest("WATCH_CHANNEL_REQUIRED", "Watch channel is required");
        }
        if (entityType == FavoriteEntityType.CHEF) {
            if (user.identityId().equals(entityId)) {
                throw ApiException.badRequest("CANNOT_WATCH_SELF", "A customer cannot watch their own chef identity");
            }
            Boolean approved = jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM chef_application WHERE identity_id = ? AND status = 'APPROVED')",
                Boolean.class,
                entityId
            );
            if (!Boolean.TRUE.equals(approved)) {
                throw ApiException.notFound("APPROVED_CHEF_NOT_FOUND", "Approved home chef was not found");
            }
        }
        jdbcTemplate.update(
            "INSERT INTO customer_favorite_watch " +
                "(identity_id, entity_type, entity_id, channel, enabled, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, now(), now()) " +
                "ON CONFLICT (identity_id, entity_type, entity_id, channel) DO UPDATE " +
                "SET enabled = EXCLUDED.enabled, updated_at = now()",
            user.identityId(),
            entityType.name(),
            entityId,
            channel.name(),
            enabled
        );
        return findWatch(user.identityId(), entityType, entityId, channel);
    }

    @Transactional
    public void removeWatch(
        CurrentUser user,
        FavoriteEntityType entityType,
        UUID entityId,
        FavoriteWatchChannel channel
    ) {
        requireCustomer(user);
        if (entityType == null || channel == null) {
            throw ApiException.badRequest("WATCH_KEY_REQUIRED", "Watch entity type and channel are required");
        }
        requireId("WATCH_ENTITY_ID_REQUIRED", "Watch entity id is required", entityId);
        jdbcTemplate.update(
            "DELETE FROM customer_favorite_watch WHERE identity_id = ? AND entity_type = ? AND entity_id = ? AND channel = ?",
            user.identityId(),
            entityType.name(),
            entityId,
            channel.name()
        );
    }

    private FavoriteChefResponse findFavoriteChef(UUID identityId, UUID chefIdentityId) {
        List<FavoriteChefResponse> rows = jdbcTemplate.query(
            "SELECT chef_identity_id, created_at FROM customer_favorite_chef WHERE identity_id = ? AND chef_identity_id = ?",
            this::mapFavoriteChef,
            identityId,
            chefIdentityId
        );
        if (rows.isEmpty()) {
            throw new IllegalStateException("Favorite chef relationship was not persisted");
        }
        return rows.getFirst();
    }

    private FavoriteKitchenResponse findFavoriteKitchen(UUID identityId, UUID kitchenId) {
        List<FavoriteKitchenResponse> rows = jdbcTemplate.query(
            "SELECT kitchen_id, created_at FROM customer_favorite_kitchen WHERE identity_id = ? AND kitchen_id = ?",
            this::mapFavoriteKitchen,
            identityId,
            kitchenId
        );
        if (rows.isEmpty()) {
            throw new IllegalStateException("Favorite kitchen relationship was not persisted");
        }
        return rows.getFirst();
    }

    private FavoriteWatchResponse findWatch(
        UUID identityId,
        FavoriteEntityType entityType,
        UUID entityId,
        FavoriteWatchChannel channel
    ) {
        List<FavoriteWatchResponse> rows = jdbcTemplate.query(
            "SELECT entity_type, entity_id, channel, enabled, last_notified_at, last_notification_window_key, created_at, updated_at " +
                "FROM customer_favorite_watch WHERE identity_id = ? AND entity_type = ? AND entity_id = ? AND channel = ?",
            this::mapWatch,
            identityId,
            entityType.name(),
            entityId,
            channel.name()
        );
        if (rows.isEmpty()) {
            throw new IllegalStateException("Favorite watch was not persisted");
        }
        return rows.getFirst();
    }

    private FavoriteChefResponse mapFavoriteChef(ResultSet rs, int rowNum) throws SQLException {
        return new FavoriteChefResponse(
            rs.getObject("chef_identity_id", UUID.class),
            rs.getTimestamp("created_at").toInstant()
        );
    }

    private FavoriteKitchenResponse mapFavoriteKitchen(ResultSet rs, int rowNum) throws SQLException {
        return new FavoriteKitchenResponse(
            rs.getObject("kitchen_id", UUID.class),
            rs.getTimestamp("created_at").toInstant()
        );
    }

    private FavoriteWatchResponse mapWatch(ResultSet rs, int rowNum) throws SQLException {
        java.sql.Timestamp lastNotified = rs.getTimestamp("last_notified_at");
        return new FavoriteWatchResponse(
            FavoriteEntityType.valueOf(rs.getString("entity_type")),
            rs.getObject("entity_id", UUID.class),
            FavoriteWatchChannel.valueOf(rs.getString("channel")),
            rs.getBoolean("enabled"),
            lastNotified == null ? null : lastNotified.toInstant(),
            rs.getString("last_notification_window_key"),
            rs.getTimestamp("created_at").toInstant(),
            rs.getTimestamp("updated_at").toInstant()
        );
    }

    private static int pageSize(Integer requested) {
        if (requested == null) {
            return DEFAULT_PAGE_SIZE;
        }
        if (requested < 1 || requested > MAX_PAGE_SIZE) {
            throw ApiException.badRequest(
                "INVALID_PAGE_SIZE",
                "limit must be between 1 and " + MAX_PAGE_SIZE
            );
        }
        return requested;
    }

    private static void requireId(String code, String message, UUID id) {
        if (id == null) {
            throw ApiException.badRequest(code, message);
        }
    }

    private static void requireCustomer(CurrentUser user) {
        if (user == null || !user.hasRole("CUSTOMER")) {
            throw ApiException.forbidden(
                "CUSTOMER_ROLE_REQUIRED",
                "Home favorites require an active CUSTOMER role"
            );
        }
    }

    private static EntityCursor decodeEntityCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }
        try {
            String decoded = new String(
                Base64.getUrlDecoder().decode(cursor),
                StandardCharsets.UTF_8
            );
            String[] parts = decoded.split("\\|", 2);
            return new EntityCursor(Instant.ofEpochMilli(Long.parseLong(parts[0])), UUID.fromString(parts[1]));
        } catch (RuntimeException exception) {
            throw ApiException.badRequest("INVALID_CURSOR", "Favorite cursor is invalid");
        }
    }

    private static String encodeEntityCursor(Instant createdAt, UUID entityId) {
        String raw = createdAt.toEpochMilli() + "|" + entityId.toString().toLowerCase(Locale.ROOT);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private static <T> CursorPage<T> entityPage(
        List<T> rows,
        int limit,
        java.util.function.Function<T, Instant> createdAt,
        java.util.function.Function<T, UUID> id
    ) {
        if (rows.size() <= limit) {
            return new CursorPage<>(List.copyOf(rows), null);
        }
        List<T> page = new ArrayList<>(rows.subList(0, limit));
        T last = page.getLast();
        return new CursorPage<>(
            List.copyOf(page),
            encodeEntityCursor(createdAt.apply(last), id.apply(last))
        );
    }

    private record EntityCursor(Instant createdAt, UUID entityId) {
    }
}
