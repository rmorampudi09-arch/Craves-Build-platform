package in.craves.order.advanced;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.web.ApiDtos.OrderItemChoice;
import in.craves.order.web.ApiDtos.OrderItemResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MenuOptionChoicesTest {
    static final String FROZEN = "[{\"groupName\":\"Spice\",\"choiceName\":\"Hot\",\"priceDeltaPaise\":0},"
        + "{\"groupName\":\"Extras\",\"choiceName\":\"Raita\",\"priceDeltaPaise\":4550}]";

    @Test
    void parsesFrozenChoicesInRupees() {
        assertEquals(List.of(new OrderItemChoice("Spice", "Hot", new BigDecimal("0.00")), new OrderItemChoice("Extras", "Raita", new BigDecimal("45.50"))),
            MenuOptionChoices.parse(FROZEN));
    }

    @Test
    void linesWithoutOptionsKeepTheirExactShape() throws Exception {
        assertNull(MenuOptionChoices.parse(null));
        assertNull(MenuOptionChoices.parse("not json"));
        var plain = new OrderItemResponse(UUID.randomUUID(), UUID.randomUUID(), "Thali", "MAIN", "VEG", BigDecimal.TEN, 1, BigDecimal.TEN);
        assertEquals(false, new ObjectMapper().findAndRegisterModules().writeValueAsString(plain).contains("chosenOptions"));
    }

    @Test
    void describesForNameOnlyDocuments() {
        assertEquals("Thali (Spice: Hot, Extras: Raita)", MenuOptionChoices.describe("Thali", FROZEN));
        assertEquals("Thali", MenuOptionChoices.describe("Thali", null));
        assertEquals("Thali", MenuOptionChoices.describe("Thali", "[]"));
    }
}
