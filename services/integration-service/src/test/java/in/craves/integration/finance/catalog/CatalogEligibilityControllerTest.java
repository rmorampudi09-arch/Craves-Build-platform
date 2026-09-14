package in.craves.integration.finance.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatalogEligibilityControllerTest {
    private final String key="catalog-read-test-key-not-production-12345";
    private final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    private final CatalogEligibilityService service=mock(CatalogEligibilityService.class);
    private final CatalogEligibilityController controller=new CatalogEligibilityController(service,json,key,"different-money-key");
    private MockHttpServletRequest request(byte[] body,long timestamp,String signingKey) {
        var request=new MockHttpServletRequest("POST",CatalogEligibilityProtocol.PATH);request.setContent(body);request.setContentType("application/json");
        String ts=Long.toString(timestamp);request.addHeader(CatalogEligibilityProtocol.TIMESTAMP,ts);
        request.addHeader(CatalogEligibilityProtocol.SIGNATURE,CatalogEligibilityProtocol.sign(signingKey,"POST",ts,body));return request;
    }
    @Test void authorizedReadReturnsOnlySignedPrivacyBoundedFields() throws Exception {
        UUID id=UUID.randomUUID();Instant now=Instant.now();byte[] body=("{\"requestId\":\""+id+"\"}").getBytes();
        when(service.evaluate(id)).thenReturn(new CatalogEligibilityService.Snapshot(id,now,true,null,0,"a".repeat(64),List.of()));
        var response=controller.evaluate(request(body,now.getEpochSecond(),key));
        assertEquals(200,response.getStatusCode().value());assertEquals("no-store, private",response.getHeaders().getFirst("Cache-Control"));
        assertTrue(CatalogEligibilityProtocol.matches(CatalogEligibilityProtocol.sign(key,"RESPONSE",response.getHeaders().getFirst(CatalogEligibilityProtocol.TIMESTAMP),response.getBody()),response.getHeaders().getFirst(CatalogEligibilityProtocol.SIGNATURE)));
        assertEquals(7,json.readTree(response.getBody()).size());assertFalse(new String(response.getBody()).contains("account"));
    }
    @Test void wrongKeyStaleChangedBodyAndMissingSignatureNeverReachService() {
        byte[] body=("{\"requestId\":\""+UUID.randomUUID()+"\"}").getBytes();
        assertEquals(401,controller.evaluate(request(body,Instant.now().getEpochSecond(),"wrong-test-key")).getStatusCode().value());
        assertEquals(401,controller.evaluate(request(body,Instant.now().minusSeconds(60).getEpochSecond(),key)).getStatusCode().value());
        var changed=request(body,Instant.now().getEpochSecond(),key);changed.setContent((new String(body)+" ").getBytes());
        assertEquals(401,controller.evaluate(changed).getStatusCode().value());
        assertEquals(401,controller.evaluate(new MockHttpServletRequest()).getStatusCode().value());verifyNoInteractions(service);
    }
    @Test void readKeyCannotReuseMoneyKeyAndMalformedSignedRequestsFailClosed() {
        assertEquals(503,new CatalogEligibilityController(service,json,key,key).evaluate(new MockHttpServletRequest()).getStatusCode().value());
        assertEquals(503,new CatalogEligibilityController(service,json,"","").evaluate(new MockHttpServletRequest()).getStatusCode().value());
        assertEquals(400,controller.evaluate(request("{\"requestId\":\"not-uuid\"}".getBytes(),Instant.now().getEpochSecond(),key)).getStatusCode().value());
        verifyNoInteractions(service);
    }
}
