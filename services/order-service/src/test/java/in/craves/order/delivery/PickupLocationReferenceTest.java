package in.craves.order.delivery;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class PickupLocationReferenceTest {
    private static final UUID KITCHEN_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    @Test
    void normalizesFormattingButKeepsSamePhysicalPickupIdentity() {
        UUID first = PickupLocationReference.fromSnapshot(
            KITCHEN_ID,
            "+91 98765 43210",
            "  12   Lake View Road ",
            "Flat 3A",
            "Near Park",
            "Madhapur",
            "Hyderabad",
            "Telangana",
            "500081"
        );
        UUID second = PickupLocationReference.fromSnapshot(
            KITCHEN_ID,
            "+91 98765 43210",
            "12 Lake View Road",
            "flat 3a",
            "near park",
            "madhapur",
            "hyderabad",
            "telangana",
            "500081"
        );
        assertEquals(first, second);
    }

    @Test
    void addressChangeCreatesDifferentProviderPickupReference() {
        UUID oldAddress = PickupLocationReference.fromSnapshot(
            KITCHEN_ID, "9876543210", "12 Lake View Road", null, null,
            "Madhapur", "Hyderabad", "Telangana", "500081"
        );
        UUID newAddress = PickupLocationReference.fromSnapshot(
            KITCHEN_ID, "9876543210", "44 Lake View Road", null, null,
            "Madhapur", "Hyderabad", "Telangana", "500081"
        );
        assertNotEquals(oldAddress, newAddress);
    }

    @Test
    void differentKitchensNeverSharePickupReferenceEvenAtSameAddress() {
        UUID first = PickupLocationReference.fromSnapshot(
            KITCHEN_ID, "9876543210", "12 Lake View Road", null, null,
            "Madhapur", "Hyderabad", "Telangana", "500081"
        );
        UUID second = PickupLocationReference.fromSnapshot(
            UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
            "9876543210", "12 Lake View Road", null, null,
            "Madhapur", "Hyderabad", "Telangana", "500081"
        );
        assertNotEquals(first, second);
    }
}
