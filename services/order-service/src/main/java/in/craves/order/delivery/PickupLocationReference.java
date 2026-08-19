package in.craves.order.delivery;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

/**
 * Generates the same stable pickup UUID as Catalog migration V4.
 *
 * The identifier deliberately excludes mutable display/email fields and coordinates. It represents
 * the physical/contact pickup identity captured in the immutable Order snapshot. A chef address or
 * pickup-phone change therefore creates a new provider pickup reference without rewriting older
 * orders.
 */
public final class PickupLocationReference {
    private PickupLocationReference() {
    }

    public static UUID fromSnapshot(
        UUID kitchenId,
        String contactPhone,
        String addressLine1,
        String addressLine2,
        String landmark,
        String areaName,
        String city,
        String state,
        String postalCode
    ) {
        if (kitchenId == null) {
            throw new IllegalArgumentException("kitchenId is required for pickup reference");
        }
        String canonical = String.join(
            "|",
            kitchenId.toString(),
            normalize(contactPhone),
            normalize(addressLine1),
            normalize(addressLine2),
            normalize(landmark),
            normalize(areaName),
            normalize(city),
            normalize(state),
            normalize(postalCode)
        );
        try {
            byte[] digest = MessageDigest.getInstance("MD5")
                .digest(canonical.getBytes(StandardCharsets.UTF_8));
            String hex = HexFormat.of().formatHex(digest);
            return UUID.fromString(
                hex.substring(0, 8) + "-" +
                    hex.substring(8, 12) + "-" +
                    hex.substring(12, 16) + "-" +
                    hex.substring(16, 20) + "-" +
                    hex.substring(20, 32)
            );
        } catch (Exception ex) {
            throw new IllegalStateException("Could not derive delivery pickup reference", ex);
        }
    }

    static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }
}
