package in.craves.subscription.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.subscription.exception.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

class PlanImageValidatorTest {
    private static final int FIVE_MIB = 5_242_880;

    @Test
    void detectsJpegPngAndWebpFromTheirMagicBytes() {
        assertThat(PlanImageValidator.contentType(padded(64, 0xFF, 0xD8, 0xFF, 0xE0))).isEqualTo("image/jpeg");
        assertThat(PlanImageValidator.contentType(padded(64, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))).isEqualTo("image/png");
        assertThat(PlanImageValidator.contentType(webp(64))).isEqualTo("image/webp");
    }

    @Test
    void rejectsGifAndOtherUnsupportedFormats() {
        assertUnsupported("GIF89a-and-some-pixels".getBytes(StandardCharsets.US_ASCII));
        assertUnsupported("<svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes(StandardCharsets.US_ASCII));
    }

    @Test
    void rejectsRiffContainersThatAreNotWebpAndTruncatedWebpHeaders() {
        byte[] wave = webp(64);
        System.arraycopy("WAVE".getBytes(StandardCharsets.US_ASCII), 0, wave, 8, 4);
        assertUnsupported(wave);
        assertUnsupported(Arrays.copyOf(webp(64), 11));
        assertUnsupported(new byte[] {(byte) 0xFF, (byte) 0xD8});
    }

    @Test
    void rejectsEmptyAndMissingFilesAsASizeProblem() {
        assertSizeInvalid(new byte[0]);
        assertSizeInvalid(null);
    }

    @Test
    void acceptsExactlyFiveMebibytesAndRejectsOneByteMore() {
        assertThat(PlanImageValidator.contentType(padded(FIVE_MIB, 0xFF, 0xD8, 0xFF))).isEqualTo("image/jpeg");
        assertSizeInvalid(padded(FIVE_MIB + 1, 0xFF, 0xD8, 0xFF));
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

    private static byte[] padded(int length, int... header) {
        byte[] bytes = new byte[length];
        for (int i = 0; i < header.length; i++) {
            bytes[i] = (byte) header[i];
        }
        return bytes;
    }

    private static byte[] webp(int length) {
        byte[] bytes = new byte[length];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, bytes, 0, 4);
        System.arraycopy("WEBP".getBytes(StandardCharsets.US_ASCII), 0, bytes, 8, 4);
        return bytes;
    }
}
