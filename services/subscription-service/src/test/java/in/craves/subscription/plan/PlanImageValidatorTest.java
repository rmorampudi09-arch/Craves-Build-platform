package in.craves.subscription.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.subscription.exception.ApiException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class PlanImageValidatorTest {
    private static final int TWO_MIB = 2_097_152;

    @Test
    void acceptsDecodableJpegAndPngAndDetectsTheTypeFromTheBytes() {
        assertThat(PlanImageValidator.contentType(image("jpg", 64, 48))).isEqualTo("image/jpeg");
        assertThat(PlanImageValidator.contentType(image("png", 64, 48))).isEqualTo("image/png");
    }

    @Test
    void rejectsWebpEvenWithAValidHeaderBecauseImageIoCannotDecodeIt() {
        byte[] webp = new byte[64];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, webp, 0, 4);
        System.arraycopy("WEBP".getBytes(StandardCharsets.US_ASCII), 0, webp, 8, 4);

        assertUnsupported(webp);
    }

    @Test
    void rejectsGifAndOtherUnsupportedFormats() {
        assertUnsupported(image("gif", 16, 16));
        assertUnsupported("<svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes(StandardCharsets.US_ASCII));
        assertUnsupported(new byte[] {(byte) 0xFF, (byte) 0xD8});
    }

    @Test
    void rejectsAValidJpegOrPngHeaderWithAGarbageOrTruncatedBody() {
        byte[] jpegHeader = padded(512, 0xFF, 0xD8, 0xFF, 0xE0);
        byte[] pngHeader = padded(512, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
        byte[] shortPngHeader = padded(512, 0x89, 0x50, 0x4E, 0x47);
        byte[] jpeg = image("jpg", 64, 64);
        byte[] png = image("png", 64, 64);

        assertUnsupported(jpegHeader);
        assertUnsupported(pngHeader);
        assertUnsupported(shortPngHeader);
        assertUnsupported(Arrays.copyOf(jpeg, jpeg.length / 2));
        assertUnsupported(Arrays.copyOf(png, png.length / 2));
    }

    @Test
    void rejectsEmptyAndMissingFilesAsASizeProblem() {
        assertSizeInvalid(new byte[0]);
        assertSizeInvalid(null);
    }

    @Test
    void acceptsExactlyTwoMebibytesAndRejectsOneByteMore() {
        byte[] jpeg = image("jpg", 64, 64);

        assertThat(PlanImageValidator.contentType(Arrays.copyOf(jpeg, TWO_MIB))).isEqualTo("image/jpeg");
        assertSizeInvalid(Arrays.copyOf(jpeg, TWO_MIB + 1));
        assertSizeInvalid(Arrays.copyOf(jpeg, 5_242_880));
    }

    @Test
    void enforcesTheDimensionLimitsBeforeDecodingThePixels() {
        assertThat(PlanImageValidator.contentType(image("png", 4096, 1))).isEqualTo("image/png");
        assertThat(PlanImageValidator.contentType(image("png", 2000, 2000))).isEqualTo("image/png");

        assertSizeInvalid(image("png", 4097, 1));
        assertSizeInvalid(image("png", 1, 4097));
        assertSizeInvalid(image("jpg", 4097, 1));
        // 3000 x 3000 = 9 megapixels, over the 8 megapixel cap although each side is within 4096.
        assertSizeInvalid(image("png", 3000, 3000));
    }

    private static void assertUnsupported(byte[] bytes) {
        assertThatThrownBy(() -> PlanImageValidator.contentType(bytes))
            .isInstanceOfSatisfying(ApiException.class, error -> {
                assertThat(error.getCode()).isEqualTo("PLAN_IMAGE_TYPE_UNSUPPORTED");
                assertThat(error.getStatus()).isEqualTo(400);
            });
    }

    private static void assertSizeInvalid(byte[] bytes) {
        assertThatThrownBy(() -> PlanImageValidator.contentType(bytes))
            .isInstanceOfSatisfying(ApiException.class, error -> {
                assertThat(error.getCode()).isEqualTo("PLAN_IMAGE_SIZE_INVALID");
                assertThat(error.getStatus()).isEqualTo(400);
            });
    }

    /** A real, decodable image (blank grey, so large dimensions stay tiny on the wire). */
    static byte[] image(String format, int width, int height) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
            if (!ImageIO.write(image, format, out)) {
                throw new IllegalStateException("No ImageIO writer for " + format);
            }
            return out.toByteArray();
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    private static byte[] padded(int length, int... header) {
        byte[] bytes = new byte[length];
        for (int i = 0; i < header.length; i++) {
            bytes[i] = (byte) header[i];
        }
        return bytes;
    }
}
