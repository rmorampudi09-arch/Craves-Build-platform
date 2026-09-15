package in.craves.auth.referrals;

import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Set;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Verifies the existing first-touch.server.ts wire format; never accepts unsigned ancestry. */
public final class ReferralAttribution {
    private ReferralAttribution(){}
    public static String parent(String token,byte[] key,Instant now,boolean retentionApproved){
        if(token==null)return null;
        if(!retentionApproved || key.length<32 || token.length()>1024)throw new IllegalArgumentException("REFERRAL_ATTRIBUTION_NOT_APPROVED");
        try{
            String[] parts=token.split("\\.",-1);
            if(parts.length!=2 || !parts[0].matches("[A-Za-z0-9_-]+") || !parts[1].matches("[A-Za-z0-9_-]{43}"))throw new IllegalArgumentException();
            Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));
            byte[] supplied=Base64.getUrlDecoder().decode(parts[1]);
            if(!MessageDigest.isEqual(mac.doFinal(parts[0].getBytes(StandardCharsets.UTF_8)),supplied))throw new IllegalArgumentException();
            byte[] decoded=Base64.getUrlDecoder().decode(parts[0]);
            if(!Base64.getUrlEncoder().withoutPadding().encodeToString(decoded).equals(parts[0]))throw new IllegalArgumentException();
            var mapper=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
            var body=mapper.readTree(decoded);
            var fields=new java.util.HashSet<String>();body.fieldNames().forEachRemaining(fields::add);
            if(!fields.equals(Set.of("v","code","capturedAt","expiresAt")) || !body.path("v").isIntegralNumber() || body.path("v").longValue()!=1
                || !body.path("code").isTextual() || !body.path("code").asText().matches("[A-HJ-NP-Z2-9]{16}")
                || !body.path("capturedAt").isIntegralNumber() || !body.path("capturedAt").canConvertToLong()
                || !body.path("expiresAt").isIntegralNumber() || !body.path("expiresAt").canConvertToLong())throw new IllegalArgumentException();
            long captured=body.path("capturedAt").longValue(),expires=body.path("expiresAt").longValue();
            if(captured<0 || captured>now.getEpochSecond() || expires<=now.getEpochSecond() || Math.subtractExact(expires,captured)!=2592000)throw new IllegalArgumentException();
            return body.path("code").textValue();
        }catch(Exception e){throw new IllegalArgumentException("REFERRAL_ATTRIBUTION_INVALID");}
    }
}
