package in.craves.auth.referrals;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ReferralAttributionTest {
    private final byte[] key="disposable-attribution-test-only-key-32bytes".getBytes(StandardCharsets.UTF_8);
    private final Instant now=Instant.ofEpochSecond(1789500000);
    private String sign(String json)throws Exception {String p=Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));var m=Mac.getInstance("HmacSHA256");m.init(new SecretKeySpec(key,"HmacSHA256"));return p+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(m.doFinal(p.getBytes(StandardCharsets.UTF_8)));}
    private String body(long captured,long expires){return "{\"v\":1,\"code\":\"ABCDEFGHJKLMNPQR\",\"capturedAt\":"+captured+",\"expiresAt\":"+expires+"}";}
    @Test void acceptsTheExistingTypescriptWireFormat()throws Exception {assertEquals("ABCDEFGHJKLMNPQR",ReferralAttribution.parent(sign(body(now.getEpochSecond()-1,now.getEpochSecond()-1+2592000)),key,now,true));}
    @Test void absenceHasNoParent(){assertNull(ReferralAttribution.parent(null,key,now,false));}
    @Test void validSignatureDoesNotReplaceRetentionApproval()throws Exception {String t=sign(body(now.getEpochSecond(),now.getEpochSecond()+2592000));assertThrows(IllegalArgumentException.class,()->ReferralAttribution.parent(t,key,now,false));}
    @Test void rejectsTamperingExpiryFutureAndWrongWindow()throws Exception {
        String valid=sign(body(now.getEpochSecond(),now.getEpochSecond()+2592000));
        assertThrows(IllegalArgumentException.class,()->ReferralAttribution.parent(valid.substring(0,valid.length()-2)+"AA",key,now,true));
        for(String b:java.util.List.of(body(now.getEpochSecond()-2592000,now.getEpochSecond()),body(now.getEpochSecond()+1,now.getEpochSecond()+2592001),body(now.getEpochSecond(),now.getEpochSecond()+60))){String t=sign(b);assertThrows(IllegalArgumentException.class,()->ReferralAttribution.parent(t,key,now,true));}
    }
    @Test void rejectsDuplicateFieldsTrailingJsonAndFractionalTime()throws Exception {
        String good=body(now.getEpochSecond(),now.getEpochSecond()+2592000);
        for(String b:java.util.List.of(good.replace("\"v\":1","\"v\":1,\"v\":1"),good+"{}",good.replace("1789500000","1789500000.5"))){String t=sign(b);assertThrows(IllegalArgumentException.class,()->ReferralAttribution.parent(t,key,now,true));}
    }
}
