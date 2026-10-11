package in.craves.catalog.service;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

/**
 * Shrinks oversized dish photos (phone originals of several MB) to a size a menu card needs.
 * Anything it cannot read or cannot make smaller is returned unchanged, so an upload never fails here.
 */
final class MenuPhotoOptimizer {
    static final int MAX_EDGE = 1600;
    static final int REENCODE_ABOVE_BYTES = 400 * 1024;
    private static final float JPEG_QUALITY = 0.82f;

    record Photo(byte[] data, String contentType) {}

    private MenuPhotoOptimizer() {}

    static Photo optimize(byte[] data, String contentType) {
        Photo original = new Photo(data, contentType);
        boolean jpeg = "image/jpeg".equals(contentType);
        boolean png = "image/png".equals(contentType);
        // WebP has no decoder in the JDK and is normally already compressed.
        if (!jpeg && !png) return original;
        try {
            int orientation = jpeg ? exifOrientation(data) : 1;
            // Mirrored orientations are rare (front cameras); keep those photos as they are.
            if (orientation != 1 && orientation != 3 && orientation != 6 && orientation != 8) return original;
            BufferedImage image = read(data);
            if (image == null) return original;
            boolean opaque = !image.getColorModel().hasAlpha() || fullyOpaque(image);
            boolean toJpeg = jpeg || opaque;
            BufferedImage scaled = scale(image, toJpeg);
            BufferedImage upright = rotate(scaled, orientation);
            byte[] out = toJpeg ? writeJpeg(upright) : writePng(upright);
            return out.length < data.length ? new Photo(out, toJpeg ? "image/jpeg" : "image/png") : original;
        } catch (IOException | RuntimeException | LinkageError ex) {
            return original;
        }
    }

    /** Decodes only photos worth re-encoding, at reduced resolution when they are far above the target. */
    private static BufferedImage read(byte[] data) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) return null;
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int longEdge = Math.max(reader.getWidth(0), reader.getHeight(0));
                if (longEdge <= MAX_EDGE && data.length <= REENCODE_ABOVE_BYTES) return null;
                ImageReadParam param = reader.getDefaultReadParam();
                int step = Math.max(1, longEdge / MAX_EDGE); // bounds memory for 20+ MP originals
                param.setSourceSubsampling(step, step, 0, 0);
                return reader.read(0, param);
            } finally {
                reader.dispose();
            }
        }
    }

    private static BufferedImage scale(BufferedImage source, boolean toJpeg) {
        int w = source.getWidth(), h = source.getHeight();
        double ratio = Math.min(1.0, (double) MAX_EDGE / Math.max(w, h));
        int tw = Math.max(1, (int) Math.round(w * ratio)), th = Math.max(1, (int) Math.round(h * ratio));
        BufferedImage target = new BufferedImage(tw, th, toJpeg ? BufferedImage.TYPE_INT_RGB : BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = target.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            if (toJpeg) {
                g.setColor(java.awt.Color.WHITE);
                g.fillRect(0, 0, tw, th);
            }
            g.drawImage(source, 0, 0, tw, th, null);
        } finally {
            g.dispose();
        }
        return target;
    }

    /** Re-encoding drops EXIF, so the pixels are turned upright the way browsers would have shown them. */
    private static BufferedImage rotate(BufferedImage image, int orientation) {
        if (orientation == 1) return image;
        int w = image.getWidth(), h = image.getHeight();
        boolean quarter = orientation == 6 || orientation == 8;
        BufferedImage target = new BufferedImage(quarter ? h : w, quarter ? w : h, image.getType());
        AffineTransform t = switch (orientation) {
            case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);
            case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);
            default -> new AffineTransform(0, -1, 1, 0, 0, w);
        };
        Graphics2D g = target.createGraphics();
        try {
            g.drawImage(image, t, null);
        } finally {
            g.dispose();
        }
        return target;
    }

    /** getRGB, not the alpha raster: paletted PNGs keep transparency in the palette and have no alpha raster. */
    private static boolean fullyOpaque(BufferedImage image) {
        int w = image.getWidth();
        int[] row = new int[w];
        for (int y = 0; y < image.getHeight(); y++) {
            image.getRGB(0, y, w, 1, row, 0, w);
            for (int argb : row) if (argb >>> 24 != 0xFF) return false;
        }
        return true;
    }

    private static byte[] writeJpeg(BufferedImage image) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }

    private static byte[] writePng(BufferedImage image) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if (!ImageIO.write(image, "png", bytes)) throw new IOException("No PNG writer");
        return bytes.toByteArray();
    }

    /** EXIF orientation (1-8) from a JPEG's APP1 segment; 1 when absent or unreadable. */
    static int exifOrientation(byte[] jpeg) {
        int i = 2;
        while (i + 4 <= jpeg.length && (jpeg[i] & 0xFF) == 0xFF) {
            int marker = jpeg[i + 1] & 0xFF;
            int length = ((jpeg[i + 2] & 0xFF) << 8) | (jpeg[i + 3] & 0xFF);
            if (marker == 0xDA || length < 2) break; // image data starts: no more metadata
            int start = i + 4;
            if (marker == 0xE1 && start + 14 <= jpeg.length && start + length - 2 <= jpeg.length
                && jpeg[start] == 'E' && jpeg[start + 1] == 'x' && jpeg[start + 2] == 'i' && jpeg[start + 3] == 'f') {
                return tiffOrientation(jpeg, start + 6, start + length - 2);
            }
            i += 2 + length;
        }
        return 1;
    }

    private static int tiffOrientation(byte[] b, int tiff, int end) {
        boolean little = b[tiff] == 'I';
        int ifd = tiff + read(b, tiff + 4, 4, little);
        if (ifd < tiff || ifd + 2 > end) return 1;
        int entries = read(b, ifd, 2, little);
        for (int n = 0; n < entries; n++) {
            int entry = ifd + 2 + n * 12;
            if (entry + 12 > end) return 1;
            if (read(b, entry, 2, little) == 0x0112) {
                int value = read(b, entry + 8, 2, little);
                return value >= 1 && value <= 8 ? value : 1;
            }
        }
        return 1;
    }

    private static int read(byte[] b, int at, int size, boolean little) {
        int value = 0;
        for (int k = 0; k < size; k++) {
            int shift = little ? 8 * k : 8 * (size - 1 - k);
            value |= (b[at + k] & 0xFF) << shift;
        }
        return value;
    }
}
