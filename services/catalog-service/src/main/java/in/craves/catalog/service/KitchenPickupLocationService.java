package in.craves.catalog.service;

import in.craves.catalog.web.ApiDtos.PickupLocationResolveRequest;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class KitchenPickupLocationService {
    private final JdbcTemplate jdbcTemplate;

    public KitchenPickupLocationService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public UUID currentPickupLocationId(UUID kitchenId) {
        return jdbcTemplate.query(
            "SELECT current_pickup_location_id FROM catalog_schema.kitchen_profile WHERE id = ?",
            (rs, rowNum) -> rs.getObject("current_pickup_location_id", UUID.class),
            kitchenId
        ).stream().findFirst().orElseThrow(() ->
            new IllegalStateException("Kitchen pickup location pointer is missing")
        );
    }

    /**
     * Resolve an immutable Order pickup snapshot to the exact Catalog location version that
     * produced it. This lets an order created on V1 keep V1 even if the chef is currently on V2.
     * The kitchen-id fallback preserves the pre-versioning contract for legacy historical orders
     * whose old address predates the version table.
     */
    public UUID resolveSnapshot(UUID kitchenId, PickupLocationResolveRequest request) {
        if (request == null) {
            return kitchenId;
        }
        String sql = """
            SELECT id
            FROM catalog_schema.kitchen_pickup_location
            WHERE kitchen_id = ?
              AND lower(btrim(coalesce(kitchen_name, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(contact_phone, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(contact_email, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(address_line1, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(address_line2, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(landmark, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(area_name, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(city, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(state, ''))) = lower(btrim(coalesce(?, '')))
              AND lower(btrim(coalesce(postal_code, ''))) = lower(btrim(coalesce(?, '')))
              AND latitude IS NOT DISTINCT FROM ?
              AND longitude IS NOT DISTINCT FROM ?
            ORDER BY version_number DESC
            LIMIT 1
            """;
        return jdbcTemplate.query(
            sql,
            (rs, rowNum) -> rs.getObject("id", UUID.class),
            kitchenId,
            request.kitchenName(),
            request.contactPhone(),
            request.contactEmail(),
            request.addressLine1(),
            request.addressLine2(),
            request.landmark(),
            request.areaName(),
            request.city(),
            request.state(),
            request.postalCode(),
            request.latitude(),
            request.longitude()
        ).stream().findFirst().orElse(kitchenId);
    }
}
