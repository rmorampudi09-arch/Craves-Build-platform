package in.craves.advanced.demandforecast;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.support.IntegrationTestBase;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DemandForecastIT extends IntegrationTestBase {
    static final String DISHES = "/api/v1/advanced/demand-forecast/dishes";

    @Test
    void aChefGetsTheirKitchensSameWeekdayAverage() throws Exception {
        UUID kitchen = UUID.randomUUID();
        MenuItem dal = CATALOG.add(kitchen, "Dal", 15000);
        String chef = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
        LocalDate today = CLOCK.instant().atZone(ZoneId.of("Asia/Kolkata")).toLocalDate();
        for (int weeks = 1; weeks <= 2; weeks++) {
            Order placed = ORDERS.place(UUID.randomUUID(), kitchen, "DELIVERED", dal, 4 * weeks);
            var at = CLOCK.instant().minus(Duration.ofDays(7L * weeks));
            ORDERS.orders.put(placed.id(), new Order(placed.id(), placed.customerId(), kitchen, "DELIVERED", placed.lines(), null, at, at));
        }
        ORDERS.place(UUID.randomUUID(), UUID.randomUUID(), "DELIVERED", dal, 99); // another kitchen
        mvc.perform(get(DISHES).param("date", today.toString()).header("Authorization", chef)).andExpect(status().isOk())
                .andExpect(jsonPath("$.basedOnWeeks").value(2)).andExpect(jsonPath("$.dishes[0].averagePortions").value(6.0))
                .andExpect(jsonPath("$.dishes[0].low").value(4)).andExpect(jsonPath("$.dishes[0].high").value(8))
                .andExpect(jsonPath("$.complete").value(true));
        mvc.perform(get(DISHES).param("date", today.plusDays(14).toString()).header("Authorization", chef)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_DATE"));
        mvc.perform(get(DISHES).param("date", today.minusDays(1).toString()).header("Authorization", chef)).andExpect(status().isBadRequest());
        mvc.perform(get(DISHES).param("date", today.toString()).header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER")))
                .andExpect(status().isForbidden());
        ORDERS.down = true;
        mvc.perform(get(DISHES).param("date", today.toString()).header("Authorization", chef)).andExpect(status().isServiceUnavailable());
    }
}
