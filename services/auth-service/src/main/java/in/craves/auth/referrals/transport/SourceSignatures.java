package in.craves.auth.referrals.transport;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
public final class SourceSignatures {
    private SourceSignatures(){}
    public static String sign(byte[] key,String source,String keyId,String timestamp,String method,String path,byte[] body){
        try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));
            String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
            return HexFormat.of().formatHex(mac.doFinal((source+"\n"+keyId+"\n"+timestamp+"\n"+method+"\n"+path+"\n"+hash).getBytes(StandardCharsets.UTF_8)));
        }catch(Exception e){throw new IllegalStateException("Cannot sign referral request",e);}
    }
}
