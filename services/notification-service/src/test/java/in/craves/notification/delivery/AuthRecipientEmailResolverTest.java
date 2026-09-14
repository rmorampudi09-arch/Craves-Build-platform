package in.craves.notification.delivery;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.documents.DocumentHttp;
import java.net.URI;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AuthRecipientEmailResolverTest {
    private final UUID identity=UUID.randomUUID();
    @Test void callerAddressCannotOverrideVerifiedCanonicalAuthAddress() {
        var http=mock(DocumentHttp.class);reply(http,response(identity,"ACTIVE",true,"verified@example.test"),200);
        assertEquals("verified@example.test",resolver(http).resolve(item(identity,"attacker@example.test")));
        verify(http).get(URI.create("https://auth.example.test/internal/v1/identities/"+identity+"/email"),"X-Craves-Internal-Secret","unit-test-only-secret",8192);
    }
    @Test void unverifiedInactiveMissingAndWrongOwnerIdentityAreRejectedDespiteAddressOverride() {
        for(String response:new String[]{response(identity,"ACTIVE",false,"unverified@example.test"),response(identity,"SUSPENDED",true,"verified@example.test"),response(UUID.randomUUID(),"ACTIVE",true,"verified@example.test"),response(identity,"ACTIVE",true,"bad-address"),"null"}) {
            var http=mock(DocumentHttp.class);reply(http,response,200);
            assertThrows(IllegalStateException.class,()->resolver(http).resolve(item(identity,"override@example.test")));
        }
    }
    @Test void absentOwnerAndUnavailableAuthorityNeverFallBackToDeliveryAddress() {
        var http=mock(DocumentHttp.class);
        assertThrows(IllegalArgumentException.class,()->resolver(http).resolve(item(null,"override@example.test")));verifyNoInteractions(http);
        var properties=new NotificationDeliveryProperties();
        assertThrows(IllegalStateException.class,()->new AuthRecipientEmailResolver(properties,http,mapper()).resolve(item(identity,"override@example.test")));
        reply(http,"{}",503);assertThrows(IllegalStateException.class,()->resolver(http).resolve(item(identity,"override@example.test")));
    }
    @Test void unsafeOriginAndTransportFailureArePrivateAndFailClosed() {
        var http=mock(DocumentHttp.class);var properties=properties();properties.setAuthInternalBaseUrl("http://auth.example.test");
        assertThrows(IllegalStateException.class,()->new AuthRecipientEmailResolver(properties,http,mapper()).resolve(item(identity,"override@example.test")));verifyNoInteractions(http);
        when(http.get(any(),any(),any(),anyInt())).thenThrow(new IllegalStateException("private-upstream-detail"));
        var error=assertThrows(IllegalStateException.class,()->resolver(http).resolve(item(identity,"override@example.test")));
        assertFalse(error.toString().contains("private-upstream-detail"));assertNull(error.getCause());
    }
    private AuthRecipientEmailResolver resolver(DocumentHttp http){return new AuthRecipientEmailResolver(properties(),http,mapper());}
    private ObjectMapper mapper(){return new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);}
    private NotificationDeliveryProperties properties(){var p=new NotificationDeliveryProperties();p.setAuthInternalBaseUrl("https://auth.example.test");p.setAuthInternalServiceSecret("unit-test-only-secret");return p;}
    @SuppressWarnings("unchecked") private void reply(DocumentHttp http,String body,int status){HttpResponse<byte[]> response=mock(HttpResponse.class);when(response.statusCode()).thenReturn(status);when(response.body()).thenReturn(body.getBytes(StandardCharsets.UTF_8));when(http.get(any(),any(),any(),anyInt())).thenReturn(response);}
    private String response(UUID owner,String status,boolean verified,String email){return "{\"identityId\":\""+owner+"\",\"email\":\""+email+"\",\"emailVerified\":"+verified+",\"status\":\""+status+"\",\"emailRevision\":2,\"verifiedAt\":\"2026-09-14T00:00:00Z\"}";}
    private NotificationDeliveryModels.DeliveryWorkItem item(UUID owner,String override){return new NotificationDeliveryModels.DeliveryWorkItem(UUID.randomUUID(),owner,"EMAIL",override,"Title","Body",null,null,Map.of(),1,0,UUID.randomUUID());}
}
