package in.craves.catalog.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

/** Public photos never carry camera metadata (EXIF GPS would publish a home chef's address). */
class PhotoMetadataTest {
    private static final byte[] GPS = "Exif\0\0GPSLatitude=17.44".getBytes(StandardCharsets.ISO_8859_1);

    @Test
    void smallJpegKeepsItsPixelsButLosesExif() throws Exception {
        byte[] jpeg = withApp1(image("jpg"), GPS);

        MenuPhotoOptimizer.Photo clean = PhotoMetadata.clean(jpeg, "image/jpeg");

        assertFalse(contains(clean.data(), GPS), "EXIF must be gone");
        assertFalse(hasJpegMarker(clean.data(), 0xE1));
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(clean.data()));
        assertNotNull(decoded);
        assertEquals(40, decoded.getWidth());
    }

    @Test
    void pngLosesExifAndTextChunks() throws Exception {
        byte[] png = withChunks(image("png"), chunk("eXIf", GPS), chunk("tEXt", "Comment\0home".getBytes(StandardCharsets.ISO_8859_1)));

        MenuPhotoOptimizer.Photo clean = PhotoMetadata.clean(png, "image/png");

        assertFalse(contains(clean.data(), "eXIf".getBytes(StandardCharsets.ISO_8859_1)));
        assertFalse(contains(clean.data(), "tEXt".getBytes(StandardCharsets.ISO_8859_1)));
        assertNotNull(ImageIO.read(new ByteArrayInputStream(clean.data())));
    }

    @Test
    void aJpegThatCannotBeWalkedIsRefusedRatherThanPublishedAsIs() {
        byte[] broken = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE1, 0x7F, 0x7F, 1, 2};

        assertThrows(IllegalArgumentException.class, () -> PhotoMetadata.clean(broken, "image/jpeg"));
    }

    // ---- fixtures ----

    private static byte[] image(String format) throws Exception {
        BufferedImage image = new BufferedImage(40, 30, BufferedImage.TYPE_INT_RGB);
        image.setRGB(5, 5, 0xFF0000);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, format, out);
        return out.toByteArray();
    }

    /** Inserts an APP1 segment right after SOI. */
    private static byte[] withApp1(byte[] jpeg, byte[] payload) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2);
        int length = payload.length + 2;
        out.write(0xFF);
        out.write(0xE1);
        out.write(length >> 8);
        out.write(length & 0xFF);
        out.write(payload, 0, payload.length);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    /** Inserts chunks right after IHDR (signature 8 bytes + IHDR 25 bytes). */
    private static byte[] withChunks(byte[] png, byte[]... chunks) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(png, 0, 33);
        for (byte[] c : chunks) out.write(c, 0, c.length);
        out.write(png, 33, png.length - 33);
        return out.toByteArray();
    }

    private static byte[] chunk(String type, byte[] data) {
        byte[] typeBytes = type.getBytes(StandardCharsets.ISO_8859_1);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(data);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(data.length >>> 24);
        out.write(data.length >>> 16);
        out.write(data.length >>> 8);
        out.write(data.length);
        out.write(typeBytes, 0, 4);
        out.write(data, 0, data.length);
        long value = crc.getValue();
        out.write((int) (value >>> 24));
        out.write((int) (value >>> 16));
        out.write((int) (value >>> 8));
        out.write((int) value);
        return out.toByteArray();
    }

    private static boolean contains(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i + needle.length <= haystack.length; i++) {
            for (int j = 0; j < needle.length; j++) if (haystack[i + j] != needle[j]) continue outer;
            return true;
        }
        return false;
    }

    private static boolean hasJpegMarker(byte[] jpeg, int marker) {
        int i = 2;
        while (i + 4 <= jpeg.length && (jpeg[i] & 0xFF) == 0xFF) {
            int m = jpeg[i + 1] & 0xFF;
            if (m == marker) return true;
            if (m == 0xDA) return false;
            i += 2 + (((jpeg[i + 2] & 0xFF) << 8) | (jpeg[i + 3] & 0xFF));
        }
        return false;
    }
}
