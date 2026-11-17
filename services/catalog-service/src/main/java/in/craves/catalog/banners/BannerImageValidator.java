package in.craves.catalog.banners;

import in.craves.catalog.exception.ApiException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import javax.imageio.ImageIO;
import org.springframework.web.multipart.MultipartFile;

public final class BannerImageValidator {
    public static final int MAX_BYTES = 2 * 1024 * 1024;
    /**
     * Each platform's banner shape, width over height, and the size suggested for it. Both are 2:1 today (owner,
     * 17 Nov 2026: the website's banner and the app's carousel); each keeps its own so either can change alone.
     */
    static final Map<String, Double> SHAPE = Map.of("WEB", 2.0, "APP", 2.0);
    static final Map<String, String> SUGGESTED = Map.of("WEB", "1500 × 750", "APP", "1080 × 540");
    private static final double SHAPE_TOLERANCE = 0.10;
    private BannerImageValidator() {}

    public static byte[] validate(MultipartFile file, String platform) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("BANNER_IMAGE_REQUIRED", "Choose a banner image.");
        if (file.getSize() > MAX_BYTES) throw ApiException.badRequest("BANNER_IMAGE_TOO_LARGE", "Banner images must be at most 2 MB.");
        if (file.getContentType() == null || !Set.of("image/jpeg", "image/png").contains(file.getContentType()))
            throw ApiException.badRequest("BANNER_IMAGE_TYPE", "Use a JPEG or PNG image.");
        try {
            byte[] bytes = file.getBytes();
            if (bytes.length > MAX_BYTES) throw ApiException.badRequest("BANNER_IMAGE_TOO_LARGE", "Banner images must be at most 2 MB.");
            try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(input);
                if (!readers.hasNext()) throw new IOException("Invalid image");
                var reader = readers.next();
                try {
                    reader.setInput(input, true, true);
                    String format = reader.getFormatName();
                    boolean matches = "image/png".equals(file.getContentType()) ? "png".equalsIgnoreCase(format)
                        : Set.of("jpeg", "jpg").contains(format.toLowerCase(java.util.Locale.ROOT));
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (!matches || width < 1 || height < 1 || width > 4096 || height > 4096 || (long) width * height > 8_000_000)
                        throw new IOException("Unsupported image dimensions or format");
                    double wanted = SHAPE.get(platform);
                    if (Math.abs((double) width / height - wanted) / wanted > SHAPE_TOLERANCE)
                        throw ApiException.badRequest("BANNER_IMAGE_SHAPE", "Use a picture twice as wide as it is tall, for example " + SUGGESTED.get(platform) + " pixels.");
                    if (reader.read(0) == null) throw new IOException("Invalid image");
                } finally { reader.dispose(); }
            }
            return bytes;
        } catch (IOException error) {
            throw ApiException.badRequest("BANNER_IMAGE_INVALID", "Choose a valid JPEG or PNG, up to 4096 pixels and 8 megapixels.");
        }
    }
}
