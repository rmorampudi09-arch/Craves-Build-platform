package in.craves.integration.erasure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Replaces the customer's drop-off (contact name and phone, address lines, landmark, note, postcode, coordinates) in the
 * shapes Craves and its delivery providers keep: Craves' own {@code dropoff} stop, a Borzo order's {@code points} (point 0
 * is the kitchen and stays, the courier is the rider's), a Pidge {@code drop} list and Shiprocket's flat {@code billing_*}
 * fields. The kitchen's pickup, the rider, amounts, ids, statuses and the coarse area, city and state are never touched.
 * Placeholders keep a text value text and a number a number, so a second pass changes nothing.
 */
final class DropoffScrubber {
    private static final Set<String> STOP_TEXT = Set.of("address", "addressLine1", "addressLine2", "landmark", "note");
    private static final Set<String> BORZO_TEXT = Set.of("address", "building_number", "entrance_number", "intercom_code", "floor_number",
        "apartment_number", "note", "invisible_mile_navigation_instructions");
    private static final Set<String> PIDGE_ADDRESS_TEXT = Set.of("address_line_1", "address_line_2", "landmark", "instructions_to_reach");
    private static final Map<String, String> SHIPROCKET = Map.of(
        "billing_customer_name", AccountErasureService.ERASED_NAME, "shipping_customer_name", AccountErasureService.ERASED_NAME,
        "billing_phone", AccountErasureService.ERASED_PHONE, "shipping_phone", AccountErasureService.ERASED_PHONE,
        "billing_address", AccountErasureService.ERASED_TEXT, "billing_address_2", AccountErasureService.ERASED_TEXT,
        "shipping_address", AccountErasureService.ERASED_TEXT, "shipping_address_2", AccountErasureService.ERASED_TEXT,
        "billing_pincode", AccountErasureService.ERASED_POSTAL_CODE, "shipping_pincode", AccountErasureService.ERASED_POSTAL_CODE);

    private DropoffScrubber() {
    }

    /** Changes the tree in place; true when something was replaced. */
    static boolean scrub(JsonNode root) {
        boolean changed = false;
        if (root.isArray()) {
            for (JsonNode element : root) {
                changed |= scrub(element);
            }
        } else if (root.isObject()) {
            ObjectNode object = (ObjectNode) root;
            List<String> names = new ArrayList<>();
            object.fieldNames().forEachRemaining(names::add);
            for (String name : names) {
                JsonNode value = object.get(name);
                if ("dropoff".equals(name) && value.isObject()) {
                    changed |= stop((ObjectNode) value);
                } else if ("points".equals(name) && value.isArray()) {
                    for (int i = 1; i < value.size(); i++) {
                        changed |= value.get(i).isObject() && borzoPoint((ObjectNode) value.get(i));
                    }
                } else if ("drop".equals(name) && value.isArray()) {
                    for (JsonNode drop : value) {
                        changed |= drop.isObject() && pidgeDrop((ObjectNode) drop);
                    }
                } else if (SHIPROCKET.containsKey(name)) {
                    changed |= text(object, name, SHIPROCKET.get(name));
                    if (object.has("billing_customer_name")) {
                        changed |= zero(object, "latitude") | zero(object, "longitude");
                    }
                }
                changed |= scrub(value);
            }
        }
        return changed;
    }

    private static boolean stop(ObjectNode stop) {
        boolean changed = false;
        for (String key : STOP_TEXT) {
            changed |= text(stop, key, AccountErasureService.ERASED_TEXT);
        }
        changed |= text(stop, "contactName", AccountErasureService.ERASED_NAME);
        changed |= text(stop, "contactPhone", AccountErasureService.ERASED_PHONE);
        changed |= text(stop, "postalCode", AccountErasureService.ERASED_POSTAL_CODE);
        return changed | zero(stop, "latitude") | zero(stop, "longitude");
    }

    private static boolean borzoPoint(ObjectNode point) {
        boolean changed = false;
        for (String key : BORZO_TEXT) {
            changed |= text(point, key, AccountErasureService.ERASED_TEXT);
        }
        changed |= zero(point, "latitude") | zero(point, "longitude");
        if (point.get("contact_person") instanceof ObjectNode contact) {
            changed |= text(contact, "name", AccountErasureService.ERASED_NAME) | text(contact, "phone", AccountErasureService.ERASED_PHONE);
        }
        return changed;
    }

    private static boolean pidgeDrop(ObjectNode drop) {
        boolean changed = false;
        if (drop.get("poc_detail") instanceof ObjectNode contact) {
            changed |= text(contact, "name", AccountErasureService.ERASED_NAME) | text(contact, "mobile", AccountErasureService.ERASED_PHONE);
        }
        if (drop.get("address") instanceof ObjectNode address) {
            for (String key : PIDGE_ADDRESS_TEXT) {
                changed |= text(address, key, AccountErasureService.ERASED_TEXT);
            }
            changed |= text(address, "pincode", AccountErasureService.ERASED_POSTAL_CODE) | zero(address, "latitude") | zero(address, "longitude");
        }
        return changed;
    }

    private static boolean text(ObjectNode object, String key, String placeholder) {
        JsonNode value = object.get(key);
        if (value == null || !(value.isTextual() || value.isNumber()) || (value.isTextual() && value.asText().equals(placeholder))) {
            return false;
        }
        object.put(key, placeholder);
        return true;
    }

    /** A number becomes 0 and a text coordinate "0": the same type, still a valid point. */
    private static boolean zero(ObjectNode object, String key) {
        JsonNode value = object.get(key);
        if (value == null) {
            return false;
        }
        if (value.isNumber() && value.decimalValue().signum() != 0) {
            object.put(key, 0);
            return true;
        }
        if (value.isTextual() && !value.asText().equals("0")) {
            object.put(key, "0");
            return true;
        }
        return false;
    }
}
