package in.craves.integration.fleet;

import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Test mode (CRAVES_FLEET_TEST_MODE, on by default): dispatch may touch only allow-listed riders and kitchens.
 * Dispatch asks both questions before it offers a trip.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetTestMode {
    private final JdbcTemplate jdbc;
    private final boolean on;

    public FleetTestMode(JdbcTemplate jdbc, FleetProperties properties) {
        this.jdbc = jdbc;
        this.on = properties.testMode();
    }

    public boolean riderAllowed(UUID riderId) {
        return !on || listed("SELECT EXISTS (SELECT 1 FROM fleet_schema.test_mode_rider WHERE rider_id = ?)", riderId);
    }

    public boolean kitchenAllowed(UUID chefId) {
        return !on || listed("SELECT EXISTS (SELECT 1 FROM fleet_schema.test_mode_kitchen WHERE chef_id = ?)", chefId);
    }

    private boolean listed(String sql, UUID id) {
        return id != null && Boolean.TRUE.equals(jdbc.queryForObject(sql, Boolean.class, id));
    }
}
