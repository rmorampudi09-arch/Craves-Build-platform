package in.craves.subscription.plan;

import in.craves.subscription.exception.ApiException;

/** Chef plan photo rules. The type comes from the file's own magic bytes; the client's Content-Type is never consulted. */
public final class PlanImageValidator {
    /** Matches the size_bytes CHECK on subscription_plan_image. */
    public static final int MAX_BYTES = 5_242_880;

    private PlanImageValidator() {
    }

    /** Returns image/jpeg, image/png or image/webp, or throws 400 PLAN_IMAGE_SIZE_INVALID / PLAN_IMAGE_TYPE_UNSUPPORTED. */
    public static String contentType(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw ApiException.badRequest("PLAN_IMAGE_SIZE_INVALID", "Plan photo must be between 1 byte and 5 MB");
        }
        if (startsWith(bytes, 0, 0xFF, 0xD8, 0xFF)) {
            return "image/jpeg";
        }
        if (startsWith(bytes, 0, 0x89, 0x50, 0x4E, 0x47)) {
            return "image/png";
        }
        if (bytes.length >= 12 && startsWith(bytes, 0, 'R', 'I', 'F', 'F') && startsWith(bytes, 8, 'W', 'E', 'B', 'P')) {
            return "image/webp";
        }
        throw ApiException.badRequest("PLAN_IMAGE_TYPE_UNSUPPORTED", "Plan photo must be a JPEG, PNG or WebP image");
    }

    private static boolean startsWith(byte[] bytes, int offset, int... expected) {
        if (bytes.length < offset + expected.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if ((bytes[offset + i] & 0xFF) != expected[i]) {
                return false;
            }
        }
        return true;
    }
}
