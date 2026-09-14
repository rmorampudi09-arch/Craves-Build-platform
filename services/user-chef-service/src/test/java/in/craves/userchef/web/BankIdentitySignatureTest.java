package in.craves.userchef.web;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BankIdentitySignatureTest {
    final String secret="NONSECRET_CI_ONLY_BANK_INTERNAL_SIGNATURE";
    final Instant now=Instant.parse("2026-09-14T12:00:00Z");
    final byte[] body="{\"chefId\":\"00112233-4455-4677-8899-aabbccddeeff\"}".getBytes(StandardCharsets.UTF_8);
    String sign(String time,byte[] bytes,String path)throws Exception {
        var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        mac.update(("POST\n"+path+"\n"+time+"\n").getBytes(StandardCharsets.UTF_8));return HexFormat.of().formatHex(mac.doFinal(bytes));
    }
    @Test void correctFreshIdentityRequestPasses()throws Exception {
        String time=Long.toString(now.getEpochSecond()),signature=sign(time,body,"/internal/v1/chef-bank/identity");
        assertDoesNotThrow(()->InternalBankApplicantController.verify(secret,body,time,signature,now));
    }
    @Test void alteredBodyIsRejected()throws Exception {
        String time=Long.toString(now.getEpochSecond()),signature=sign(time,body,"/internal/v1/chef-bank/identity");
        assertThrows(RuntimeException.class,()->InternalBankApplicantController.verify(secret,"{}".getBytes(StandardCharsets.UTF_8),time,signature,now));
    }
    @Test void signatureCannotBeReusedFromAnotherInternalRoute()throws Exception {
        String time=Long.toString(now.getEpochSecond()),signature=sign(time,body,"/internal/v1/customer-addresses/read");
        assertThrows(RuntimeException.class,()->InternalBankApplicantController.verify(secret,body,time,signature,now));
    }
    @Test void expiredOrFutureSignaturesFail()throws Exception {
        for(long delta:new long[]{-301,31}) {
            String time=Long.toString(now.getEpochSecond()+delta),signature=sign(time,body,"/internal/v1/chef-bank/identity");
            assertThrows(RuntimeException.class,()->InternalBankApplicantController.verify(secret,body,time,signature,now));
        }
    }
    @Test void absentWeakSecretAndOversizedBodiesFailClosed() {
        assertThrows(RuntimeException.class,()->InternalBankApplicantController.verify("",body,"1","0".repeat(64),now));
        assertThrows(RuntimeException.class,()->InternalBankApplicantController.verify(secret,new byte[2049],Long.toString(now.getEpochSecond()),"0".repeat(64),now));
    }
}
