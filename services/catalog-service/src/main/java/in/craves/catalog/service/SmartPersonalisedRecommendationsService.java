package in.craves.catalog.service;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.web.SmartPersonalisedRecommendationsDtos.RecommendationItem;
import in.craves.catalog.web.SmartPersonalisedRecommendationsDtos.ResolveRecommendationsRequest;
import in.craves.catalog.web.SmartPersonalisedRecommendationsDtos.ResolveRecommendationsResponse;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SmartPersonalisedRecommendationsService {
    static final int MAX_SEEDS = 20;

    private final NamedParameterJdbcTemplate jdbc;

    public SmartPersonalisedRecommendationsService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ResolveRecommendationsResponse resolve(ResolveRecommendationsRequest request) {
        List<UUID> orderedIds = normalize(request);
        List<RecommendationItem> rows = jdbc.query(
            """
                SELECT mi.id,
                       mi.kitchen_id,
                       kp.kitchen_name,
                       kp.display_name AS kitchen_display_name,
                       kp.area_name,
                       kp.city,
                       mi.item_name,
                       mi.description,
                       mi.category,
                       mi.food_type,
                       mi.price,
                       mi.currency,
                       mi.preparation_time_minutes,
                       (
                           SELECT mii.public_url
                           FROM catalog_schema.menu_item_image mii
                           WHERE mii.menu_item_id = mi.id
                             AND mii.public_url IS NOT NULL
                           ORDER BY mii.is_primary DESC, mii.sort_order ASC, mii.created_at ASC
                           LIMIT 1
                       ) AS primary_image_url
                FROM catalog_schema.menu_item mi
                JOIN catalog_schema.kitchen_profile kp ON kp.id = mi.kitchen_id
                WHERE mi.id IN (:ids)
                  AND mi.status = 'ACTIVE'
                  AND mi.is_available = true
                  AND mi.unit_package_weight_grams IS NOT NULL
                  AND mi.thermobox_required IS NOT NULL
                  AND kp.status = 'ACTIVE'
                """,
            new MapSqlParameterSource("ids", orderedIds),
            this::mapItem
        );

        Map<UUID, RecommendationItem> byId = new HashMap<>();
        rows.forEach(item -> byId.put(item.menuItemId(), item));
        List<RecommendationItem> ordered = new ArrayList<>(rows.size());
        for (UUID id : orderedIds) {
            RecommendationItem item = byId.get(id);
            if (item != null) ordered.add(item);
        }
        return new ResolveRecommendationsResponse(List.copyOf(ordered));
    }

    private static List<UUID> normalize(ResolveRecommendationsRequest request) {
        if (request == null || request.seedMenuItemIds() == null || request.seedMenuItemIds().isEmpty()) {
            throw ApiException.badRequest("RECOMMENDATION_SEEDS_REQUIRED", "At least one saved menu item is required.");
        }
        if (request.seedMenuItemIds().size() > MAX_SEEDS) {
            throw ApiException.badRequest("TOO_MANY_RECOMMENDATION_SEEDS", "At most " + MAX_SEEDS + " saved menu items can be resolved at once.");
        }
        LinkedHashSet<UUID> ids = new LinkedHashSet<>();
        for (UUID id : request.seedMenuItemIds()) {
            if (id == null) throw ApiException.badRequest("INVALID_RECOMMENDATION_SEED", "Saved menu item ids cannot contain null values.");
            ids.add(id);
        }
        return List.copyOf(ids);
    }

    private RecommendationItem mapItem(ResultSet rs, int rowNum) throws SQLException {
        return new RecommendationItem(
            rs.getObject("id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getString("kitchen_name"),
            rs.getString("kitchen_display_name"),
            rs.getString("area_name"),
            rs.getString("city"),
            rs.getString("item_name"),
            rs.getString("description"),
            rs.getString("category"),
            rs.getString("food_type"),
            rs.getBigDecimal("price"),
            rs.getString("currency"),
            integerOrNull(rs, "preparation_time_minutes"),
            rs.getString("primary_image_url"),
            "SAVED_BY_YOU"
        );
    }

    private static Integer integerOrNull(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }
}
