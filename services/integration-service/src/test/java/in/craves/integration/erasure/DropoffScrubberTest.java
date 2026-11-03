package in.craves.integration.erasure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** The customer's drop-off is replaced in the shapes Craves and its delivery providers store; the pickup and the rider are not. */
class DropoffScrubberTest {
    private final ObjectMapper json = new ObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    private JsonNode parse(String text) throws Exception {
        return json.readTree(text);
    }

    @Test
    void aCravesDropoffLosesNameAddressAndCoordinatesButKeepsTheAreaAndThePickup() throws Exception {
        JsonNode tree = parse("""
            {"orderId":"o-1","deliveryRequest":{"declaredGoodsValue":433.10,
              "pickup":{"address":"Kitchen road 1","contactName":"Chef","contactPhone":"8888888888","latitude":17.4,"longitude":78.4},
              "dropoff":{"address":"12 Real Street, Flat 4","contactName":"Real Person","contactPhone":"9876543210",
                "latitude":17.4412345,"longitude":78.3912345,"note":"Gate code 1234","addressLine1":"12 Real Street",
                "addressLine2":"Flat 4","landmark":"Near Real Temple","area":"Madhapur","city":"Hyderabad","state":"Telangana",
                "postalCode":"500081","country":"India","requiredStart":null}}}""");

        assertTrue(DropoffScrubber.scrub(tree));

        JsonNode drop = tree.at("/deliveryRequest/dropoff");
        for (String key : new String[] {"address", "addressLine1", "addressLine2", "landmark", "note"}) {
            assertEquals(AccountErasureService.ERASED_TEXT, drop.get(key).asText(), key);
        }
        assertEquals(AccountErasureService.ERASED_NAME, drop.get("contactName").asText());
        assertEquals(AccountErasureService.ERASED_PHONE, drop.get("contactPhone").asText());
        assertEquals(AccountErasureService.ERASED_POSTAL_CODE, drop.get("postalCode").asText());
        assertEquals(0, drop.get("latitude").decimalValue().signum());
        assertEquals(0, drop.get("longitude").decimalValue().signum());
        assertEquals("Madhapur", drop.get("area").asText());
        assertEquals("Hyderabad", drop.get("city").asText());
        assertTrue(drop.get("requiredStart").isNull());
        assertEquals("Kitchen road 1", tree.at("/deliveryRequest/pickup/address").asText());
        assertEquals("8888888888", tree.at("/deliveryRequest/pickup/contactPhone").asText());
        assertEquals(0, new java.math.BigDecimal("17.4").compareTo(tree.at("/deliveryRequest/pickup/latitude").decimalValue()));
        assertEquals(0, new java.math.BigDecimal("433.10").compareTo(tree.at("/deliveryRequest/declaredGoodsValue").decimalValue()));
        assertFalse(DropoffScrubber.scrub(tree), "a second pass changes nothing");
    }

    @Test
    void aBorzoOrderKeepsItsPickupPointAndItsCourier() throws Exception {
        JsonNode tree = parse("""
            {"order":{"order_id":1250032,"payment_amount":"150.00","courier":{"name":"Rider Name","phone":"7777777777"},
              "points":[
                {"address":"Kitchen road 1","contact_person":{"name":"Chef","phone":"8888888888"},"latitude":"17.4","longitude":"78.4"},
                {"address":"12 Real Street, Flat 4","contact_person":{"name":"Real Person","phone":"9876543210"},
                 "latitude":"17.4412345","longitude":"78.3912345","note":"Gate code 1234","building_number":"12",
                 "apartment_number":"4","delivery_id":11712,"tracking_url":"https://tracking.example/11712",
                 "delivery":{"status":"parcel_picked_up"}}]}}""");

        assertTrue(DropoffScrubber.scrub(tree));

        JsonNode drop = tree.at("/order/points/1");
        assertEquals(AccountErasureService.ERASED_TEXT, drop.get("address").asText());
        assertEquals(AccountErasureService.ERASED_NAME, drop.at("/contact_person/name").asText());
        assertEquals(AccountErasureService.ERASED_PHONE, drop.at("/contact_person/phone").asText());
        assertEquals("0", drop.get("latitude").asText(), "a text coordinate stays text");
        assertEquals("0", drop.get("longitude").asText());
        assertEquals(AccountErasureService.ERASED_TEXT, drop.get("note").asText());
        assertEquals(AccountErasureService.ERASED_TEXT, drop.get("building_number").asText());
        assertEquals(AccountErasureService.ERASED_TEXT, drop.get("apartment_number").asText());
        assertEquals(11712, drop.get("delivery_id").asInt());
        assertEquals("https://tracking.example/11712", drop.get("tracking_url").asText());
        assertEquals("parcel_picked_up", drop.at("/delivery/status").asText());
        assertEquals("Kitchen road 1", tree.at("/order/points/0/address").asText());
        assertEquals("8888888888", tree.at("/order/points/0/contact_person/phone").asText());
        assertEquals("17.4", tree.at("/order/points/0/latitude").asText());
        assertEquals("Rider Name", tree.at("/order/courier/name").asText(), "the rider's own data stays");
        assertEquals("7777777777", tree.at("/order/courier/phone").asText());
        assertEquals("150.00", tree.at("/order/payment_amount").asText());
        assertFalse(DropoffScrubber.scrub(tree));
    }

    @Test
    void aPidgeDropAndShiprocketBillingFieldsAreReplaced() throws Exception {
        JsonNode tree = parse("""
            {"id":"p-1","drop":[{"ref":"craves-drop","poc_detail":{"name":"Real Person","mobile":"9876543210"},
               "address":{"address_line_1":"12 Real Street","address_line_2":"Flat 4","landmark":"Near Real Temple",
                 "instructions_to_reach":"Gate code 1234","city":"Hyderabad","pincode":"500081","latitude":17.44,"longitude":78.39}}],
             "billing_customer_name":"Real Person","billing_phone":"9876543210","billing_address":"12 Real Street",
             "billing_address_2":"Flat 4","billing_pincode":"500081","billing_city":"Hyderabad","courier":{"name":"Rider"}}""");

        assertTrue(DropoffScrubber.scrub(tree));

        String after = tree.toString();
        for (String personal : new String[] {"Real Person", "9876543210", "12 Real Street", "Flat 4", "Real Temple", "Gate code", "500081", "17.44", "78.39"}) {
            assertFalse(after.contains(personal), personal + " in " + after);
        }
        assertTrue(after.contains("Hyderabad") && after.contains("craves-drop") && after.contains("\"name\":\"Rider\""), after);
        assertFalse(DropoffScrubber.scrub(tree));
    }

    @Test
    void textWithoutADropoffIsLeftAlone() throws Exception {
        JsonNode tree = parse("{\"order\":{\"points\":[{\"address\":\"only the pickup\"}]},\"dropoff\":null,\"drop\":[]}");
        assertFalse(DropoffScrubber.scrub(tree));
        assertFalse(DropoffScrubber.scrub(parse("[1,2,{\"points\":\"x\"}]")));
        assertFalse(DropoffScrubber.scrub(parse("{}")));
    }
}
