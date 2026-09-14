package in.craves.userchef.email;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.exception.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class AuthEmailProjectionSecurityTest {
    static final String KEY="unit-test-only-projection-key-at-least-32";
    @Test void signedProjectionIsAcceptedWithExactRevisionAckAndNoStore() throws Exception {
        var service=mock(AuthEmailProjectionService.class);when(service.receive(any(),any())).thenReturn(new AuthEmailProjectionService.Receipt("APPLIED",2));
        var result=controller(service).receive(request(json(event()),0));assertEquals("APPLIED",result.getBody().status());
        assertEquals(2,result.getBody().emailRevision());assertEquals("no-store",result.getHeaders().getCacheControl());
    }
    @Test void invalidExpiredTamperedAndWrongKeySignaturesAreDeniedBeforeService() throws Exception {
        var service=mock(AuthEmailProjectionService.class);var data=json(event());
        for(int skew:new int[]{-301,301}) assertEquals(401,assertThrows(ApiException.class,()->controller(service).receive(request(data,skew))).getStatus());
        var tampered=request(data,0);tampered.setContent("{}".getBytes(StandardCharsets.UTF_8));assertThrows(ApiException.class,()->controller(service).receive(tampered));
        var absent=request(data,0);absent.removeHeader("X-Craves-Email-Signature");assertThrows(ApiException.class,()->controller(service).receive(absent));
        verifyNoInteractions(service);
    }
    @Test void unverifiedMissingFieldsInvalidRevisionAndMalformedAddressAreDenied() throws Exception {
        var service=mock(AuthEmailProjectionService.class);var valid=event();
        for(var event:new AuthEmailProjectionService.Event[]{
            new AuthEmailProjectionService.Event(valid.eventId(),valid.identityId(),valid.email(),false,2,valid.verifiedAt()),
            new AuthEmailProjectionService.Event(valid.eventId(),valid.identityId(),"bad",true,2,valid.verifiedAt()),
            new AuthEmailProjectionService.Event(valid.eventId(),valid.identityId(),valid.email(),true,0,valid.verifiedAt()),
            new AuthEmailProjectionService.Event(valid.eventId(),valid.identityId(),valid.email(),true,2,null),
            new AuthEmailProjectionService.Event(valid.eventId(),null,valid.email(),true,2,valid.verifiedAt())})
            assertEquals(400,assertThrows(ApiException.class,()->controller(service).receive(request(json(event),0))).getStatus());
        verifyNoInteractions(service);
    }
    @Test void oversizedUnknownDuplicateAndTrailingFieldsRejected() throws Exception {
        var service=mock(AuthEmailProjectionService.class);assertEquals(413,assertThrows(ApiException.class,()->controller(service).receive(request(new byte[4097],0))).getStatus());
        String body=new String(json(event()),StandardCharsets.UTF_8);
        for(String malformed:new String[]{"{",body+"{}",body.substring(0,body.length()-1)+",\"extra\":true}",body.substring(0,body.length()-1)+",\"emailVerified\":true}"})
            assertEquals(400,assertThrows(ApiException.class,()->controller(service).receive(request(malformed.getBytes(StandardCharsets.UTF_8),0))).getStatus());
        verifyNoInteractions(service);
    }
    @Test void signedScalarCoercionsAreRejected() throws Exception {
        var service=mock(AuthEmailProjectionService.class);var mapper=new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        com.fasterxml.jackson.databind.node.ObjectNode body=mapper.valueToTree(event());
        for(String field:new String[]{"emailVerified","emailRevision","verifiedAt"}) {
            var invalid=body.deepCopy();invalid.put(field,"true");
            assertEquals(400,assertThrows(ApiException.class,()->controller(service).receive(request(mapper.writeValueAsBytes(invalid),0))).getStatus());
        }
        verifyNoInteractions(service);
    }
    @Test void privateHttpErrorsDoNotExposePersistenceDetailsOrAllowCaching() throws Exception {
        var service=mock(AuthEmailProjectionService.class);
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller(service))
            .setControllerAdvice(new AuthEmailProjectionErrors()).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(AuthEmailProjectionController.PATH)
            .contentType("application/json").content("{}"))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control","private, no-store, max-age=0"))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().json("{\"code\":\"EMAIL_INTERNAL_AUTH_REQUIRED\"}"));
        byte[] body=json(event());var signed=request(body,0);
        when(service.receive(any(),any())).thenThrow(new IllegalStateException("private-persistence-detail"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(AuthEmailProjectionController.PATH)
            .contentType("application/json").content(body).header("X-Craves-Email-Timestamp",signed.getHeader("X-Craves-Email-Timestamp"))
            .header("X-Craves-Email-Signature",signed.getHeader("X-Craves-Email-Signature")))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isServiceUnavailable())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().json("{\"code\":\"EMAIL_PROJECTION_UNAVAILABLE\"}"));
    }
    static byte[] json(Object event)throws Exception{return new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).writeValueAsBytes(event);}
    static AuthEmailProjectionService.Event event(){return new AuthEmailProjectionService.Event(UUID.randomUUID(),UUID.randomUUID(),"ci-only@example.test",true,2,Instant.now().minusSeconds(1));}
    static AuthEmailProjectionController controller(AuthEmailProjectionService service){return new AuthEmailProjectionController(KEY,service,new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS));}
    static MockHttpServletRequest request(byte[] body,int skew)throws Exception {
        String timestamp=Long.toString(Instant.now().plusSeconds(skew).getEpochSecond());
        var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(KEY.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        mac.update(("POST\n"+AuthEmailProjectionController.PATH+"\n"+timestamp+"\n").getBytes(StandardCharsets.UTF_8));
        var request=new MockHttpServletRequest("POST",AuthEmailProjectionController.PATH);request.setContent(body);request.setContentType("application/json");
        request.addHeader("X-Craves-Email-Timestamp",timestamp);request.addHeader("X-Craves-Email-Signature",HexFormat.of().formatHex(mac.doFinal(body)));return request;
    }
}
