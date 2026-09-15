package in.craves.referral.api;

import in.craves.referral.ReferralProblem;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public record PageCursor(Instant at,UUID id) {
    public String encode() {
        return Base64.getUrlEncoder().withoutPadding().encodeToString((at+"|"+id).getBytes(StandardCharsets.US_ASCII));
    }
    public static PageCursor parse(String value) {
        if(value==null || value.isBlank()) return null;
        try {
            if(value.length()>180 || !value.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException();
            String[] parts=new String(Base64.getUrlDecoder().decode(value),StandardCharsets.US_ASCII).split("\\|",-1);
            if(parts.length!=2) throw new IllegalArgumentException();
            return new PageCursor(Instant.parse(parts[0]),UUID.fromString(parts[1]));
        } catch(RuntimeException ex) { throw new ReferralProblem(422,"INVALID_PAGE_CURSOR"); }
    }
}
