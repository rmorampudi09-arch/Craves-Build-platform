package in.craves.referral.security;

import in.craves.referral.ReferralProblem;
import in.craves.referral.infra.Json;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Shared canonicalization for the service boundary and the additive producer client. */
public final class SourceSignatures {
    private SourceSignatures() { }
    public static String sign(byte[] key,String source,String keyId,String timestamp,String method,String path,byte[] body) {
        try {
            Mac mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key,"HmacSHA256"));
            String canonical=source+"\n"+keyId+"\n"+timestamp+"\n"+method+"\n"+path+"\n"+Json.sha256(body);
            return HexFormat.of().formatHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch(Exception ex) { throw new IllegalStateException("Cannot calculate source signature",ex); }
    }
    public static void verify(byte[] key,String source,String keyId,String timestamp,String method,String path,byte[] body,String signature,Clock clock) {
        ReferralProblem.require(timestamp!=null && timestamp.matches("[0-9]{10,11}") && signature!=null && signature.matches("[0-9a-f]{64}"),401,"INVALID_SOURCE_SIGNATURE");
        long signedAt=Long.parseLong(timestamp);
        ReferralProblem.require(Math.abs(clock.instant().getEpochSecond()-signedAt)<=300,401,"EXPIRED_SOURCE_SIGNATURE");
        byte[] supplied=HexFormat.of().parseHex(signature);
        byte[] expected=HexFormat.of().parseHex(sign(key,source,keyId,timestamp,method,path,body));
        ReferralProblem.require(MessageDigest.isEqual(supplied,expected),401,"INVALID_SOURCE_SIGNATURE");
    }
}
