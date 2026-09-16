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
