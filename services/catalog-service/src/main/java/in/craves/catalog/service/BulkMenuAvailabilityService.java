package in.craves.catalog.service;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.AvailabilityChange;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.AvailabilityResult;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.BulkAvailabilityRequest;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.BulkAvailabilityResponse;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class BulkMenuAvailabilityService {
    private final NamedParameterJdbcTemplate jdbc;

    public BulkMenuAvailabilityService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public BulkAvailabilityResponse update(CravesPrincipal principal, BulkAvailabilityRequest request) {
        requireChef(principal);
        if (request == null || request.changes() == null || request.changes().isEmpty()) {
            throw ApiException.badRequest("AVAILABILITY_CHANGES_REQUIRED", "At least one availability change is required");
        }
        if (request.changes().size() > 100) {
            throw ApiException.badRequest("TOO_MANY_AVAILABILITY_CHANGES", "At most 100 menu items can be changed at once");
        }

        Set<UUID> uniqueIds = new HashSet<>();
        for (AvailabilityChange change : request.changes()) {
            if (change == null || change.menuItemId() == null) {
                throw ApiException.badRequest("MENU_ITEM_ID_REQUIRED", "Every availability change requires menuItemId");
            }
            if (!uniqueIds.add(change.menuItemId())) {
                throw ApiException.badRequest("DUPLICATE_MENU_ITEM", "The same menu item cannot appear twice in one availability request");
            }
        }

        UUID kitchenId = requireKitchenId(principal.identityId());
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("kitchenId", kitchenId)
            .addValue("ids", uniqueIds);
        Map<UUID, MenuAvailabilityState> currentById = new LinkedHashMap<>();
        jdbc.query(
            """
                SELECT id, is_available, unit_package_weight_grams, thermobox_required
                  FROM catalog_schema.menu_item
                 WHERE kitchen_id = :kitchenId
                   AND id IN (:ids)
                 FOR UPDATE
                """,
            params,
            rs -> {
                UUID id = rs.getObject("id", UUID.class);
                Integer weight = (Integer) rs.getObject("unit_package_weight_grams");
                Boolean thermobox = (Boolean) rs.getObject("thermobox_required");
                currentById.put(id, new MenuAvailabilityState(rs.getBoolean("is_available"), weight, thermobox));
            }
        );
        if (currentById.size() != uniqueIds.size()) {
            throw ApiException.notFound("MENU_ITEM_NOT_FOUND", "One or more menu items were not found for this kitchen");
        }

        for (AvailabilityChange change : request.changes()) {
            MenuAvailabilityState current = currentById.get(change.menuItemId());
            if (change.available() && (current.packageWeightGrams() == null || current.packageWeightGrams() <= 0 || current.thermoboxRequired() == null)) {
                throw ApiException.badRequest(
                    "DELIVERY_METADATA_REQUIRED",
                    "Package weight and thermobox requirement must be set before making a menu item available"
                );
            }
        }

        List<AvailabilityResult> results = new ArrayList<>(request.changes().size());
        int changedCount = 0;
        for (AvailabilityChange change : request.changes()) {
            MenuAvailabilityState current = currentById.get(change.menuItemId());
            boolean changed = current.available() != change.available();
            if (changed) {
                jdbc.update(
                    "UPDATE catalog_schema.menu_item SET is_available = :available, updated_at = now() WHERE id = :id AND kitchen_id = :kitchenId",
                    new MapSqlParameterSource()
                        .addValue("available", change.available())
                        .addValue("id", change.menuItemId())
                        .addValue("kitchenId", kitchenId)
                );
                jdbc.update(
                    """
                        INSERT INTO catalog_schema.menu_item_availability_audit(
                            id, menu_item_id, chef_identity_id, old_available, new_available, reason, created_at
                        )
                        VALUES (:id, :menuItemId, :chefIdentityId, :oldAvailable, :newAvailable, :reason, now())
                        """,
                    new MapSqlParameterSource()
                        .addValue("id", UUID.randomUUID())
                        .addValue("menuItemId", change.menuItemId())
                        .addValue("chefIdentityId", principal.identityId())
                        .addValue("oldAvailable", current.available())
                        .addValue("newAvailable", change.available())
                        .addValue("reason", trimToNull(change.reason()))
                );
                changedCount++;
            }
            results.add(new AvailabilityResult(change.menuItemId(), change.available(), changed));
        }

        return new BulkAvailabilityResponse(request.changes().size(), changedCount, List.copyOf(results));
    }

    private UUID requireKitchenId(UUID identityId) {
        List<UUID> rows = jdbc.query(
            "SELECT id FROM catalog_schema.kitchen_profile WHERE identity_id = :identityId",
            new MapSqlParameterSource("identityId", identityId),
            (rs, rowNum) -> rs.getObject("id", UUID.class)
        );
        if (rows.isEmpty()) {
            throw ApiException.badRequest("KITCHEN_PROFILE_REQUIRED", "Create kitchen profile before managing menu items");
        }
        return rows.getFirst();
    }

    private static void requireChef(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CHEF")) {
            throw ApiException.forbidden("CHEF_ROLE_REQUIRED", "Chef role is required");
        }
    }

    private static String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private record MenuAvailabilityState(boolean available, Integer packageWeightGrams, Boolean thermoboxRequired) {
    }
}
