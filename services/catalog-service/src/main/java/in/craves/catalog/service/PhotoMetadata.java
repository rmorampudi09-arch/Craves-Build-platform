package in.craves.catalog.service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Makes a photo safe to publish: shrinks it ({@link MenuPhotoOptimizer}) and then removes camera metadata without
 * touching the pixels. Photos of a home kitchen are taken at the chef's home, so EXIF GPS would publish the address.
 * Re-encoded photos have no metadata already; the photos the optimizer returns unchanged (small, mirrored, unreadable)
 * are cleaned here. A JPEG or PNG whose structure cannot be walked is refused rather than published as it is.
 */
final class PhotoMetadata {
    // APP1 = EXIF/XMP, APP13 = IPTC/Photoshop, COM = free text.
    private static final Set<Integer> JPEG_DROP = Set.of(0xE1, 0xED, 0xFE);
    private static final Set<String> PNG_DROP = Set.of("eXIf", "tEXt", "iTXt", "zTXt");

    private PhotoMetadata() {}

    static MenuPhotoOptimizer.Photo clean(byte[] data, String contentType) {
        MenuPhotoOptimizer.Photo photo = MenuPhotoOptimizer.optimize(data, contentType);
        return switch (photo.contentType()) {
            case "image/jpeg" -> new MenuPhotoOptimizer.Photo(stripJpeg(photo.data()), photo.contentType());
            case "image/png" -> new MenuPhotoOptimizer.Photo(stripPng(photo.data()), photo.contentType());
            // shortcut: WebP has no JDK decoder and passes unchanged; strip its EXIF/XMP chunks if chefs upload WebP camera photos.
            default -> photo;
        };
    }

    static byte[] stripJpeg(byte[] d) {
        if (d.length < 4 || u(d, 0) != 0xFF || u(d, 1) != 0xD8) throw unreadable();
        ByteArrayOutputStream out = new ByteArrayOutputStream(d.length);
        out.write(d, 0, 2);
        int i = 2;
        while (i + 1 < d.length) {
            if (u(d, i) != 0xFF) throw unreadable();
            int marker = u(d, i + 1);
            if (marker == 0xFF) { // fill byte
                i++;
                continue;
            }
            if (marker == 0xDA || marker == 0xD9) { // start of scan (entropy-coded data follows) or end of image
                out.write(d, i, d.length - i);
                return out.toByteArray();
            }
            if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { // standalone markers
                out.write(d, i, 2);
                i += 2;
                continue;
            }
            if (i + 4 > d.length) throw unreadable();
            int length = (u(d, i + 2) << 8) | u(d, i + 3);
            if (length < 2 || i + 2 + length > d.length) throw unreadable();
            if (!JPEG_DROP.contains(marker)) out.write(d, i, 2 + length);
            i += 2 + length;
        }
        throw unreadable();
    }

    static byte[] stripPng(byte[] d) {
        if (d.length < 8 || u(d, 0) != 0x89 || u(d, 1) != 'P' || u(d, 2) != 'N' || u(d, 3) != 'G') throw unreadable();
        ByteArrayOutputStream out = new ByteArrayOutputStream(d.length);
        out.write(d, 0, 8);
        int i = 8;
        while (i + 12 <= d.length) {
            long length = ((long) u(d, i) << 24) | (u(d, i + 1) << 16) | (u(d, i + 2) << 8) | u(d, i + 3);
            if (length > d.length - i - 12L) throw unreadable();
            String type = new String(d, i + 4, 4, StandardCharsets.ISO_8859_1);
            int total = 12 + (int) length;
            if (!PNG_DROP.contains(type)) out.write(d, i, total);
            i += total;
            if (type.equals("IEND")) return out.toByteArray();
        }
        throw unreadable();
    }

    private static int u(byte[] d, int i) {
        return d[i] & 0xFF;
    }

    private static IllegalArgumentException unreadable() {
        return new IllegalArgumentException("Photo could not be read to remove its camera details");
    }
}
