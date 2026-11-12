package in.craves.order.service;

import in.craves.order.web.CheckoutOperationDtos.Request;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;

final class CheckoutOperationFingerprint {
    private CheckoutOperationFingerprint() {}
    static String of(Request request) {
        StringBuilder canonical = new StringBuilder("checkout-operation-v1;");
        append(canonical, request.deliveryAddressId().toString());
        append(canonical, request.note());
        append(canonical, request.expectedCart().cartId().toString());
        request.expectedCart().items().stream().sorted(Comparator.comparing(item -> item.id().toString())).forEach(item -> {
            append(canonical, item.id().toString());
            append(canonical, Integer.toString(item.quantity()));
            append(canonical, item.updatedAt().toString());
        });
        // Only a request with a promotion hashes it, so earlier attempts keep their fingerprint.
        if (request.promotion() != null && !request.promotion().isNull()) append(canonical, "promotion=" + request.promotion());
        // Same rule for options: hashed in canonical (sorted) form, so the same picks in another order are the same attempt.
        if (request.menuOptions() != null && !request.menuOptions().isNull()) append(canonical, "menuOptions=" + in.craves.order.advanced.MenuOptionCheckout.canonical(request.menuOptions()));
        // Same rule for a company charge: hashed only when sent, in its parsed form (defaults filled in, unknown fields refused).
        if (request.companyCharge() != null && !request.companyCharge().isNull()) append(canonical, "companyCharge=" + in.craves.order.advanced.CompanyShareCheckout.parse(request.companyCharge()));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("Required hash unavailable", impossible);
        }
    }
    private static void append(StringBuilder builder, String value) {
        if (value == null) builder.append("-1:");
        else builder.append(value.length()).append(':').append(value);
    }
}
