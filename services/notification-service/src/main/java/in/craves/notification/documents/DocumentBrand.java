package in.craves.notification.documents;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** The existing approved Craves logo, packaged locally; no remote image requests. */
public final class DocumentBrand {
    public static final String SHA256 = "afb6751bb1291f5cba13f3223140cc42229cb00696e025f617766527d6c7fd07";
    private DocumentBrand() {}
    public static byte[] logo() throws IOException {
        StringBuilder encoded = new StringBuilder();
        for (String part : new String[]{"00", "01", "02", "03", "04a", "04b"}) {
            try (var input = DocumentBrand.class.getResourceAsStream("/documents/craves-logo-20260805.base64." + part)) {
                if (input == null) throw new IOException("Approved document branding missing");
                byte[] text = input.readNBytes(8193);
                if (text.length > 8192) throw new IOException("Invalid branding resource size");
                encoded.append(new String(text, StandardCharsets.US_ASCII).trim());
            }
        }
        byte[] png;
        try { png = Base64.getDecoder().decode(encoded.toString()); }
        catch (IllegalArgumentException ex) { throw new IOException("Invalid branding encoding", ex); }
        if (!SHA256.equals(DocumentModels.sha256(png))) throw new IOException("Approved branding checksum mismatch");
        return png;
    }
}
