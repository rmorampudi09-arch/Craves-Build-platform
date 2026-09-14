package in.craves.auth.email;

import static org.junit.jupiter.api.Assertions.*;
import in.craves.auth.exception.AuthException;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EmailVerificationCryptoTest {
    static final String KEY="synthetic-auth-only-hmac-key-32-bytes";
    @Test void secureCodesAlwaysHaveSixDecimalDigitsIncludingLeadingZeroes() {
        for(int i=0;i<500;i++) assertTrue(EmailVerificationCrypto.newCode().matches("[0-9]{6}"));
    }
    @Test void macIsBoundToOwnerAddressChallengeAndCodeWithIndependentDomainSeparation() {
        UUID owner=UUID.randomUUID(),challenge=UUID.randomUUID();
        String mac=EmailVerificationCrypto.codeMac(KEY,owner,"chef@example.test",challenge,"041239");
        assertEquals(64,mac.length());
        assertTrue(EmailVerificationCrypto.matches(mac,EmailVerificationCrypto.codeMac(KEY,owner,"chef@example.test",challenge,"041239")));
        assertFalse(EmailVerificationCrypto.matches(mac,EmailVerificationCrypto.codeMac(KEY,UUID.randomUUID(),"chef@example.test",challenge,"041239")));
        assertFalse(EmailVerificationCrypto.matches(mac,EmailVerificationCrypto.codeMac(KEY,owner,"other@example.test",challenge,"041239")));
        assertFalse(EmailVerificationCrypto.matches(mac,EmailVerificationCrypto.codeMac(KEY,owner,"chef@example.test",UUID.randomUUID(),"041239")));
        assertFalse(EmailVerificationCrypto.matches(mac,EmailVerificationCrypto.codeMac(KEY,owner,"chef@example.test",challenge,"041238")));
        assertFalse(EmailVerificationCrypto.matches(mac,EmailVerificationCrypto.recipientKey(KEY,"chef@example.test")));
        assertFalse(EmailVerificationCrypto.matches(null,mac));
    }
    @Test void normalizationRetainsLocalPartAndNormalizesDomain() {
        assertEquals("Chef.Name+test@example.test",EmailVerificationCrypto.normalizeEmail("Chef.Name+test@EXAMPLE.TEST"));
        assertEquals("C***@example.test",EmailVerificationCrypto.mask("Chef.Name@example.test"));
    }
    @Test void rejectsHeaderInjectionMalformedAmbiguousAndOversizeAddresses() {
        for(String value:new String[]{"", "@example.test","chef@", "chef@example", "chef@example.test\r\nBcc:x@evil.test",
            " chef@example.test", "chef@example.test ", "chef<>@example.test", "chef,other@example.test", "a..b@example.test",
            ".chef@example.test", "chef.@example.test", "chef@-example.test", "chef@example-.test", "chef@exam..test",
            "x".repeat(65)+"@example.test", "x@"+"a".repeat(64)+".test"})
            assertThrows(AuthException.class,()->EmailVerificationCrypto.normalizeEmail(value));
    }
    @Test void rejectsInsecureOriginsAndInsufficientOrReusedKeys() {
        assertThrows(IllegalStateException.class,()->new EmailVerificationSettings(true,"short",KEY,"https://notification.example.test",false,"","",false));
        assertThrows(IllegalStateException.class,()->new EmailVerificationSettings(true,KEY,KEY,"https://notification.example.test",false,"","",false));
        for(String origin:new String[]{"http://notification.example.test","https://user@notification.example.test","https://notification.example.test/path","https://notification.example.test?q=x","https://notification.example.test#x",""})
            assertThrows(IllegalStateException.class,()->EmailVerificationSettings.origin(origin,false));
        assertEquals("http://127.0.0.1:1234",EmailVerificationSettings.origin("http://127.0.0.1:1234/",true).toString());
        assertThrows(IllegalStateException.class,()->EmailVerificationSettings.origin("http://192.168.1.1",true));
    }
}
