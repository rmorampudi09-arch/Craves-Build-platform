package in.craves.advanced.chefinsights;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ChefInsightsIT extends IntegrationTestBase {
    static final String SUMMARY = "/api/v1/advanced/chef-insights/summary";
    UUID kitchen;
    String chef;
    MenuItem dal;
    String today;

    @BeforeEach
    void setUp() {
        kitchen = UUID.randomUUID();
        dal = CATALOG.add(kitchen, "Dal", 15000);
        chef = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
        today = CLOCK.instant().atZone(ZoneId.of("Asia/Kolkata")).toLocalDate().toString();
    }

    @Test
    void aChefSeesOnlyTheirOwnKitchenAcrossPages() throws Exception {
        UUID asha = UUID.randomUUID();
        for (int i = 0; i < 5; i++) ORDERS.place(asha, kitchen, "DELIVERED", dal, 1);
        ORDERS.place(UUID.randomUUID(), kitchen, "CHEF_REJECTED", dal, 1);
        ORDERS.place(UUID.randomUUID(), UUID.randomUUID(), "DELIVERED", dal, 50); // another kitchen
        Order old = ORDERS.place(asha, kitchen, "DELIVERED", dal, 7);
        ORDERS.orders.put(old.id(), new Order(old.id(), asha, kitchen, "DELIVERED", old.lines(), old.grandTotalPaise(),
                CLOCK.instant().minus(Duration.ofDays(40)), CLOCK.instant().minus(Duration.ofDays(40))));
        ORDERS.pageSize = 2;
        mvc.perform(get(SUMMARY).param("from", today).param("to", today).header("Authorization", chef)).andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(true)).andExpect(jsonPath("$.totals.orders").value(6))
                .andExpect(jsonPath("$.totals.delivered").value(5)).andExpect(jsonPath("$.totals.deliveredFoodPaise").value(75000))
                .andExpect(jsonPath("$.totals.repeatCustomers").value(1)).andExpect(jsonPath("$.topDishes[0].deliveredQuantity").value(5))
                .andExpect(jsonPath("$.ordersByHour.length()").value(24));
    }

    @Test
    void rangesRolesAndOutagesAreRefusedClearly() throws Exception {
        String tomorrow = LocalDate.parse(today).plusDays(1).toString();
        mvc.perform(get(SUMMARY).param("from", today).param("to", tomorrow).header("Authorization", chef)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RANGE"));
        mvc.perform(get(SUMMARY).param("from", LocalDate.parse(today).minusDays(92).toString()).param("to", today).header("Authorization", chef))
                .andExpect(status().isBadRequest());
        mvc.perform(get(SUMMARY).param("from", today).param("to", today).header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER")))
                .andExpect(status().isForbidden());
        mvc.perform(get(SUMMARY).param("from", today).param("to", today).header("Authorization", bearer(UUID.randomUUID(), "CHEF")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totals.orders").value(0)).andExpect(jsonPath("$.complete").value(true));
        ORDERS.down = true;
        mvc.perform(get(SUMMARY).param("from", today).param("to", today).header("Authorization", chef)).andExpect(status().isServiceUnavailable());
    }
}
