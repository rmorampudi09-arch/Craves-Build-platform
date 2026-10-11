package in.craves.subscription.plan;

import in.craves.subscription.exception.ApiException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;

/**
 * Chef plan photo rules, mirroring catalog-service's BannerImageValidator: JPEG or PNG only, at most 2 MiB, and the bytes must
 * decode with ImageIO inside the dimension limits. The type comes from the file's own magic bytes; the client's Content-Type is
 * never consulted. WebP is not accepted because the JDK's ImageIO has no WebP reader, so a WebP payload could not be decode-checked.
 * Code mapping: empty, too large or out-of-limits dimensions give PLAN_IMAGE_SIZE_INVALID; any other type, or a body that does
 * not decode as the type its header claims, gives PLAN_IMAGE_TYPE_UNSUPPORTED.
 */
public final class PlanImageValidator {
    /** The anonymous image route reads the whole row per request, so this is deliberately tighter than the DB CHECK (5 MiB). */
    public static final int MAX_BYTES = 2_097_152;
    public static final int MAX_DIMENSION = 4096;
    /** The decode check never builds a raster larger than this, so a 4096 x 4096 photo costs about as much heap as 4 MP. */
    static final long MAX_DECODED_PIXELS = 4_000_000L;

    private PlanImageValidator() {
    }

    /** Returns image/jpeg or image/png, or throws 400 PLAN_IMAGE_SIZE_INVALID / PLAN_IMAGE_TYPE_UNSUPPORTED. */
    public static String contentType(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw sizeInvalid();
        }
        if (startsWith(bytes, 0xFF, 0xD8, 0xFF)) {
            requireDecodable(bytes, "jpeg");
            return "image/jpeg";
        }
        if (startsWith(bytes, 0x89, 0x50, 0x4E, 0x47)) {
            requireDecodable(bytes, "png");
            return "image/png";
        }
        throw typeUnsupported();
    }

    private static void requireDecodable(byte[] bytes, String format) {
        try (ImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw typeUnsupported();
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                if (!format.equalsIgnoreCase(reader.getFormatName())) {
                    throw typeUnsupported();
                }
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    throw sizeInvalid();
                }
                // Phone photos (12 MP and up) are accepted; subsampling still reads every byte but keeps the raster small.
                ImageReadParam param = reader.getDefaultReadParam();
                int step = (int) Math.ceil(Math.sqrt((double) width * height / MAX_DECODED_PIXELS));
                if (step > 1) {
                    param.setSourceSubsampling(step, step, 0, 0);
                }
                if (reader.read(0, param) == null) {
                    throw typeUnsupported();
                }
            } finally {
                reader.dispose();
            }
        } catch (ApiException error) {
            throw error;
        } catch (IOException | RuntimeException error) {
            // ImageIO readers signal corrupt data with IOException but also with unchecked exceptions on some malformed files.
            throw typeUnsupported();
        }
    }

    private static ApiException sizeInvalid() {
        return ApiException.badRequest("PLAN_IMAGE_SIZE_INVALID", "Plan photo must be 2 MB or smaller and at most 4096 pixels on a side");
    }

    private static ApiException typeUnsupported() {
        return ApiException.badRequest("PLAN_IMAGE_TYPE_UNSUPPORTED", "Plan photo must be a valid JPEG or PNG image");
    }

    private static boolean startsWith(byte[] bytes, int... expected) {
        if (bytes.length < expected.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if ((bytes[i] & 0xFF) != expected[i]) {
                return false;
            }
        }
        return true;
    }
}
