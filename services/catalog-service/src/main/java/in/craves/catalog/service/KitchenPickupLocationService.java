package in.craves.catalog.service;

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
}
