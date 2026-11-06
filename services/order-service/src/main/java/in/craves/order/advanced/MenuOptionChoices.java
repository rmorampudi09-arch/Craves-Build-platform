package in.craves.order.advanced;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.web.ApiDtos.OrderItemChoice;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/** M24c slice D: the choices frozen in V43 (`menu_option_checkout_line.choices`), shown with the order line they priced. */
public final class MenuOptionChoices {
    /** Joins an `order_item oi` query to its frozen choices; select `chosen_options` with it. */
    public static final String JOIN = " LEFT JOIN order_schema.menu_option_checkout_line mocl ON mocl.order_item_id = oi.id ";
    public static final String COLUMN = "mocl.choices::text AS chosen_options";

    private static final ObjectMapper JSON = new ObjectMapper();

    private MenuOptionChoices() {
    }

    /** null for a line without options, so existing answers keep their exact shape. */
    public static List<OrderItemChoice> parse(String choices) {
        if (choices == null) return null;
        try {
            List<OrderItemChoice> out = new ArrayList<>();
            for (JsonNode choice : JSON.readTree(choices)) {
                out.add(new OrderItemChoice(choice.path("groupName").asText(""), choice.path("choiceName").asText(""),
                    BigDecimal.valueOf(choice.path("priceDeltaPaise").asLong(0), 2)));
            }
            return List.copyOf(out);
        } catch (Exception unreadable) {
            // The row was checked when it was frozen; an unreadable one must not break the order read.
            return null;
        }
    }

    /** "Thali (Spice: Hot, Extra: Raita)" for documents that have only a name column. */
    public static String describe(String itemName, String choices) {
        List<OrderItemChoice> parsed = parse(choices);
        if (parsed == null || parsed.isEmpty()) return itemName;
        return itemName + " (" + parsed.stream().map(c -> c.group() + ": " + c.choice()).collect(Collectors.joining(", ")) + ")";
    }
}
