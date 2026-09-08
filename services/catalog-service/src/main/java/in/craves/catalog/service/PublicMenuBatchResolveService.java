package in.craves.catalog.service;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolveMenuItemsRequest;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolvedMenuItemResponse;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class PublicMenuBatchResolveService {
    private final NamedParameterJdbcTemplate jdbc;

    public PublicMenuBatchResolveService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ResolvedMenuItemResponse> resolve(ResolveMenuItemsRequest request) {
        if (request == null || request.menuItemIds() == null || request.menuItemIds().isEmpty()) {
            throw ApiException.badRequest("MENU_ITEM_IDS_REQUIRED", "At least one menu item id is required");
        }
        if (request.menuItemIds().size() > 100) {
            throw ApiException.badRequest("TOO_MANY_MENU_ITEMS", "At most 100 menu items can be resolved at once");
        }
        Set<UUID> ids = new LinkedHashSet<>(request.menuItemIds());
        if (ids.contains(null)) {
            throw ApiException.badRequest("MENU_ITEM_ID_REQUIRED", "Menu item ids cannot contain null values");
        }

        return jdbc.query(
            """
                SELECT mi.id, mi.kitchen_id, mi.item_name, mi.price, mi.currency,
                       mi.unit_package_weight_grams, mi.thermobox_required
                  FROM catalog_schema.menu_item mi
                  JOIN catalog_schema.kitchen_profile kp ON kp.id = mi.kitchen_id
                 WHERE mi.id IN (:ids)
                   AND mi.status = 'ACTIVE'
                   AND mi.is_available = true
                   AND kp.status = 'ACTIVE'
                 ORDER BY mi.id
                """,
            new MapSqlParameterSource("ids", ids),
            (rs, rowNum) -> new ResolvedMenuItemResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("kitchen_id", UUID.class),
                rs.getString("item_name"),
                rs.getBigDecimal("price"),
                rs.getString("currency"),
                integerOrNull(rs, "unit_package_weight_grams"),
                booleanOrNull(rs, "thermobox_required")
            )
        );
    }

    private static Integer integerOrNull(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Boolean booleanOrNull(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        boolean value = rs.getBoolean(column);
        return rs.wasNull() ? null : value;
    }
}
