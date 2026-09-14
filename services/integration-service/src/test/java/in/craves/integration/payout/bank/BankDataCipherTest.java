package in.craves.integration.payout.bank;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static in.craves.integration.payout.bank.BankOnboardingModels.*;
import static org.junit.jupiter.api.Assertions.*;

class BankDataCipherTest {
    final UUID chef=UUID.randomUUID(),id=UUID.randomUUID();
    final Details details=new Details(chef,UUID.randomUUID(),"Test Chef","chef@example.invalid","9000000001","001234567890","HDFC0000053");
    BankDataCipher cipher() {return new BankDataCipher(new ObjectMapper(),"k1","{\"k1\":\""+Base64.getEncoder().encodeToString(new byte[32])+"\"}");}
    @Test void encryptedRoundtripPreservesLeadingZerosAndUsesUniqueNonces() {
        var c=cipher();String one=c.encrypt(id,chef,details),two=c.encrypt(id,chef,details);
        assertNotEquals(one,two);assertEquals(details,c.decrypt(id,chef,one));assertFalse(one.contains(details.accountNumber()));
    }
    @Test void swappedChefOrRequestFailsAuthentication() {
        var c=cipher();String value=c.encrypt(id,chef,details);
        assertThrows(IllegalStateException.class,()->c.decrypt(UUID.randomUUID(),chef,value));
        assertThrows(IllegalStateException.class,()->c.decrypt(id,UUID.randomUUID(),value));
    }
    @Test void tamperingAndMissingKeyFailClosed() {
        var c=cipher();String value=c.encrypt(id,chef,details);byte[] bytes=Base64.getDecoder().decode(value.split("\\.",2)[1]);bytes[15]^=1;
        assertThrows(IllegalStateException.class,()->c.decrypt(id,chef,"k1."+Base64.getEncoder().encodeToString(bytes)));
        assertFalse(new BankDataCipher(new ObjectMapper(),"","{}").ready());
        assertThrows(IllegalStateException.class,()->new BankDataCipher(new ObjectMapper(),"wrong","{}").decrypt(id,chef,value));
    }
    @Test void rotationRetainsReadAccessToOldVersion() {
        var c=cipher();String old=c.encrypt(id,chef,details);byte[] newer=new byte[32];newer[0]=1;
        var rotated=new BankDataCipher(new ObjectMapper(),"k2","{\"k1\":\""+Base64.getEncoder().encodeToString(new byte[32])+"\",\"k2\":\""+Base64.getEncoder().encodeToString(newer)+"\"}");
        assertEquals(details,rotated.decrypt(id,chef,old));assertTrue(rotated.encrypt(id,chef,details).startsWith("k2."));
    }
    @Test void sensitiveRecordsDoNotLogTheirValues() {
        var request=new Submission(UUID.randomUUID(),null,"Test Chef","001234567890","001234567890","HDFC0000053",true,CONSENT_VERSION);
        assertEquals("BankSubmission[redacted]",request.toString());assertEquals("BankDetails[redacted]",details.toString());
    }
    @Test void identityConsentConfirmationAndIfscAreRequired() {
        var identity=new Identity(chef,details.applicationId(),details.name(),details.email(),"+919000000001","PENDING",java.time.Instant.now());
        var valid=new Submission(UUID.randomUUID(),null,details.name(),details.accountNumber(),details.accountNumber(),"hdfc0000053",true,CONSENT_VERSION);
        assertEquals("001234567890",BankOnboardingModels.details(valid,identity).accountNumber());
        assertThrows(IllegalArgumentException.class,()->BankOnboardingModels.details(new Submission(UUID.randomUUID(),null,"Different Chef",details.accountNumber(),details.accountNumber(),details.ifsc(),true,CONSENT_VERSION),identity));
        assertThrows(IllegalArgumentException.class,()->BankOnboardingModels.details(new Submission(UUID.randomUUID(),null,details.name(),details.accountNumber(),"123",details.ifsc(),true,CONSENT_VERSION),identity));
        assertThrows(IllegalArgumentException.class,()->BankOnboardingModels.details(new Submission(UUID.randomUUID(),null,details.name(),details.accountNumber(),details.accountNumber(),details.ifsc(),false,CONSENT_VERSION),identity));
    }
}
