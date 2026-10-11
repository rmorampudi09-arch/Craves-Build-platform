package in.craves.catalog.service;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Random;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MenuPhotoOptimizerTest {
    @Test void phoneSizedJpegIsShrunkToTheMaximumEdge() throws IOException {
        byte[] original = encode(noise(4000, 3000, false), "jpeg");
        var photo = MenuPhotoOptimizer.optimize(original, "image/jpeg");
        BufferedImage out = decode(photo.data());
        assertEquals("image/jpeg", photo.contentType());
        assertEquals(1600, out.getWidth());
        assertEquals(1200, out.getHeight());
        assertTrue(photo.data().length < original.length);
    }

    @Test void opaquePngPhotoBecomesAJpeg() throws IOException {
        byte[] original = encode(noise(1200, 900, false), "png");
        assertTrue(original.length > MenuPhotoOptimizer.REENCODE_ABOVE_BYTES);
        var photo = MenuPhotoOptimizer.optimize(original, "image/png");
        assertEquals("image/jpeg", photo.contentType());
        assertEquals(1200, decode(photo.data()).getWidth());
        assertTrue(photo.data().length < original.length);
    }

    @Test void transparentPngKeepsItsTransparency() throws IOException {
        byte[] original = encode(noise(2000, 1500, true), "png");
        var photo = MenuPhotoOptimizer.optimize(original, "image/png");
        assertEquals("image/png", photo.contentType());
        BufferedImage out = decode(photo.data());
        assertEquals(1600, out.getWidth());
        assertTrue(out.getColorModel().hasAlpha());
    }

    @Test void rotatedPhonePhotoIsTurnedUpright() throws IOException {
        BufferedImage source = noise(3200, 2400, false);
        for (int y = 0; y < 400; y++) for (int x = 0; x < 400; x++) source.setRGB(x, y, 0xFF0000); // stored top-left
        byte[] original = withExifOrientation(encode(source, "jpeg"), 6);
        assertEquals(6, MenuPhotoOptimizer.exifOrientation(original));
        BufferedImage out = decode(MenuPhotoOptimizer.optimize(original, "image/jpeg").data());
        assertEquals(1200, out.getWidth());
        assertEquals(1600, out.getHeight());
        assertTrue(red(out.getRGB(out.getWidth() - 40, 40)));  // orientation 6 shows the stored top-left at the top-right
        assertFalse(red(out.getRGB(40, 40)));
    }

    private static boolean red(int rgb) {
        return ((rgb >> 16) & 0xFF) > 200 && ((rgb >> 8) & 0xFF) < 60 && (rgb & 0xFF) < 60;
    }

    @Test void smallPhotosWebpAndUnreadableDataAreLeftAlone() throws IOException {
        byte[] small = encode(noise(400, 300, false), "jpeg");
        assertSame(small, MenuPhotoOptimizer.optimize(small, "image/jpeg").data());
        byte[] webp = new byte[600_000];
        assertSame(webp, MenuPhotoOptimizer.optimize(webp, "image/webp").data());
        byte[] broken = new byte[600_000];
        var photo = MenuPhotoOptimizer.optimize(broken, "image/jpeg");
        assertSame(broken, photo.data());
        assertEquals("image/jpeg", photo.contentType());
    }

    private static BufferedImage noise(int w, int h, boolean transparentCorner) {
        BufferedImage image = new BufferedImage(w, h, transparentCorner ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Random random = new Random(7);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int alpha = transparentCorner && x < 50 && y < 50 ? 0 : 0xFF;
                image.setRGB(x, y, (alpha << 24) | (random.nextInt() & 0xFFFFFF));
            }
        }
        return image;
    }

    private static byte[] encode(BufferedImage image, String format) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        assertTrue(ImageIO.write(image, format, bytes));
        return bytes.toByteArray();
    }

    private static BufferedImage decode(byte[] data) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(data));
    }

    /** Inserts a minimal big-endian EXIF APP1 segment carrying only the orientation tag. */
    private static byte[] withExifOrientation(byte[] jpeg, int orientation) {
        byte[] tiff = {
            'M', 'M', 0, 42, 0, 0, 0, 8,              // header, IFD0 at offset 8
            0, 1,                                     // one entry
            0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, (byte) orientation, 0, 0,
            0, 0, 0, 0                                // no next IFD
        };
        int length = 2 + 6 + tiff.length;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2);                        // SOI
        out.write(0xFF); out.write(0xE1); out.write(length >> 8); out.write(length & 0xFF);
        out.writeBytes(new byte[] {'E', 'x', 'i', 'f', 0, 0});
        out.writeBytes(tiff);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }
}
