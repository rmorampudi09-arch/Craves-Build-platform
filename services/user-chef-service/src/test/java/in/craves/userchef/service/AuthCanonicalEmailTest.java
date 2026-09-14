package in.craves.userchef.service;

import static org.junit.jupiter.api.Assertions.*;
import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.exception.ApiException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class AuthCanonicalEmailTest {
    private final UUID identity=UUID.randomUUID();
    @Test void onlyActiveVerifiedMatchingOwnerAndCanonicalAddressAreAccepted() {
        var valid=new AuthInternalClient.InternalIdentityEmail(identity,"verified@example.test",true,"ACTIVE",2,Instant.now());
        assertEquals("verified@example.test",AuthInternalClient.canonicalEmail(identity,"VERIFIED@example.test",valid));
        assertEquals("InternalIdentityEmail[REDACTED]",valid.toString());
        for(var invalid:new AuthInternalClient.InternalIdentityEmail[]{
            new AuthInternalClient.InternalIdentityEmail(UUID.randomUUID(),"verified@example.test",true,"ACTIVE",2,Instant.now()),
            new AuthInternalClient.InternalIdentityEmail(identity,"verified@example.test",false,"ACTIVE",2,Instant.now()),
            new AuthInternalClient.InternalIdentityEmail(identity,"verified@example.test",true,"SUSPENDED",2,Instant.now()),
            new AuthInternalClient.InternalIdentityEmail(identity,"different@example.test",true,"ACTIVE",2,Instant.now()),
            new AuthInternalClient.InternalIdentityEmail(identity,"bad-address",true,"ACTIVE",2,Instant.now()),null}) {
            assertEquals("EMAIL_VERIFICATION_REQUIRED",assertThrows(ApiException.class,()->AuthInternalClient.canonicalEmail(identity,"verified@example.test",invalid)).getCode());
        }
    }
    @Test void noEmailAndMissingAuthorityFailClosedWithoutNetwork() {
        var client=new AuthInternalClient(new AuthInternalClientProperties(),RestClient.builder());
        assertEquals("EMAIL_VERIFICATION_REQUIRED",assertThrows(ApiException.class,()->client.requireVerifiedEmail(identity,null)).getCode());
        assertEquals("EMAIL_VERIFICATION_REQUIRED",assertThrows(ApiException.class,()->client.requireVerifiedEmail(identity," ")).getCode());
        assertEquals("EMAIL_AUTHORITY_UNAVAILABLE",assertThrows(ApiException.class,()->client.requireVerifiedEmail(identity,"verified@example.test")).getCode());
    }
    @Test void unsafeOriginsNeverReceiveAnInternalCredential() {
        for(String origin:new String[]{"http://auth.example.test","https://name:password@auth.example.test","https://auth.example.test/path","https://auth.example.test?key=value","https://auth.example.test#fragment"}) {
            var properties=new AuthInternalClientProperties();properties.setAuthServiceBaseUrl(origin);properties.setServiceSecret("unit-test-only-secret");
            assertEquals("EMAIL_AUTHORITY_UNAVAILABLE",assertThrows(ApiException.class,()->new AuthInternalClient(properties,RestClient.builder()).requireVerifiedEmail(identity,"verified@example.test")).getCode());
        }
    }
}
