package in.craves.notification.email;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

class VerificationEmailSecurityTest {
    static final String KEY = "unit-test-only-verification-key-at-least-32";
    static String signature(String path, String timestamp, byte[] body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(KEY.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        mac.update(("POST\n"+path+"\n"+timestamp+"\n").getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(mac.doFinal(body));
    }
    static MockHttpServletRequest request(byte[] body, String timestamp) throws Exception {
        var request = new MockHttpServletRequest("POST",VerificationEmailController.PATH);
        request.setContent(body); request.setContentType("application/json");
        request.addHeader("X-Craves-Email-Timestamp",timestamp); request.addHeader("X-Craves-Email-Signature",signature(VerificationEmailController.PATH,timestamp,body));
        return request;
    }
    @Test void hmacBindsMethodPathTimestampAndExactBody() throws Exception {
        Instant now=Instant.now(); String ts=Long.toString(now.getEpochSecond()); byte[] body="{}".getBytes(StandardCharsets.UTF_8);
        String signed=signature(VerificationEmailController.PATH,ts,body);
        assertTrue(EmailInternalSignature.valid(KEY,VerificationEmailController.PATH,ts,signed,body,now));
        assertFalse(EmailInternalSignature.valid(KEY,"/other",ts,signed,body,now));
        assertFalse(EmailInternalSignature.valid(KEY,VerificationEmailController.PATH,ts,signed,"{ }".getBytes(StandardCharsets.UTF_8),now));
        assertFalse(EmailInternalSignature.valid(KEY,VerificationEmailController.PATH,ts,signed,body,now.plusSeconds(301)));
        assertFalse(EmailInternalSignature.valid(KEY,VerificationEmailController.PATH,ts,signed,body,now.minusSeconds(301)));
        assertFalse(EmailInternalSignature.valid("short",VerificationEmailController.PATH,ts,signed,body,now));
    }
    @Test void invalidSignatureCannotInvokeService() throws Exception {
        var service=mock(VerificationEmailService.class); var controller=controller(service,true);
        var request=request("{}".getBytes(StandardCharsets.UTF_8),Long.toString(Instant.now().getEpochSecond()));
        request.removeHeader("X-Craves-Email-Signature");
        assertEquals(401,assertThrows(ResponseStatusException.class,()->controller.send(request)).getStatusCode().value()); verifyNoInteractions(service);
    }
    @Test void signedValidRequestEchoesChallengeAndHasNoStore() throws Exception {
        var service=mock(VerificationEmailService.class); when(service.deliver(any(),any())).thenReturn(VerificationEmailTransport.Outcome.ACCEPTED);
        var dto=dto(); var mapper=new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        var result=controller(service,true).send(request(mapper.writeValueAsBytes(dto),Long.toString(Instant.now().getEpochSecond())));
        assertEquals("no-store",result.getHeaders().getCacheControl()); assertEquals(dto.challengeId(),result.getBody().get("challengeId"));
        assertEquals("ACCEPTED",result.getBody().get("status")); verify(service).deliver(any(),matches("[0-9a-f]{64}"));
    }
    @Test void disabledTransportDoesNotSend() throws Exception {
        var service=mock(VerificationEmailService.class); var dto=dto();
        var result=controller(service,false).send(request(new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).writeValueAsBytes(dto),Long.toString(Instant.now().getEpochSecond())));
        assertEquals("UNAVAILABLE",result.getBody().get("status")); assertEquals(dto.challengeId(),result.getBody().get("challengeId")); verifyNoInteractions(service);
    }
    @Test void oversizedBodyIsRejectedBeforeParsingOrService() throws Exception {
        var service=mock(VerificationEmailService.class);
        assertEquals(413,assertThrows(ResponseStatusException.class,()->controller(service,true).send(request(new byte[4097],Long.toString(Instant.now().getEpochSecond())))).getStatusCode().value()); verifyNoInteractions(service);
    }
    @Test void malformedExtraFieldsDuplicateFieldsAndTrailingJsonAreRejected() throws Exception {
        var service=mock(VerificationEmailService.class); var mapper=new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS); String json=mapper.writeValueAsString(dto());
        for(String body:new String[]{"{",json.substring(0,json.length()-1)+",\"unexpected\":true}",json+"{}",json.substring(0,json.length()-1)+",\"code\":\"999999\"}"})
            assertEquals(400,assertThrows(ResponseStatusException.class,()->controller(service,true).send(request(body.getBytes(StandardCharsets.UTF_8),Long.toString(Instant.now().getEpochSecond())))).getStatusCode().value());
        verifyNoInteractions(service);
    }
    @Test void signedScalarCoercionsAreRejected() throws Exception {
        var service=mock(VerificationEmailService.class);var mapper=new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        var json=mapper.valueToTree(dto());
        for(String field:new String[]{"code","expiresAt","email","identityId","challengeId"}) {
            var invalid=json.deepCopy();((com.fasterxml.jackson.databind.node.ObjectNode)invalid).put(field,804729);
            assertEquals(400,assertThrows(ResponseStatusException.class,()->controller(service,true).send(request(mapper.writeValueAsBytes(invalid),Long.toString(Instant.now().getEpochSecond())))).getStatusCode().value());
        }
        verifyNoInteractions(service);
    }
    @Test void malformedAddressesCodesAndExpiryAreDenied() {
        Instant now=Instant.now(); var valid=dto(); assertTrue(valid.valid(now));
        for(String value:new String[]{"user", "a@b", "a@b.test\r\nBcc:x@y.test", "a<b@c.test", "a@b.test,other@c.test", " a@b.test"})
            assertFalse(new VerificationEmailRequest(valid.challengeId(),valid.identityId(),value,"804729",now.plusSeconds(600)).valid(now));
        for(String value:new String[]{"12345", "1234567", "<html>","１２３４５６"})
            assertFalse(new VerificationEmailRequest(valid.challengeId(),valid.identityId(),valid.email(),value,now.plusSeconds(600)).valid(now));
        assertFalse(new VerificationEmailRequest(valid.challengeId(),valid.identityId(),valid.email(),"804729",now).valid(now));
        assertFalse(new VerificationEmailRequest(valid.challengeId(),valid.identityId(),valid.email(),"804729",now.plusSeconds(661)).valid(now));
        assertEquals("VerificationEmailRequest[REDACTED]", valid.toString());
    }
    @Test void receiptsAreKeyedDomainSeparatedAndContainNoCode() {
        byte[] a="request-a".getBytes(StandardCharsets.UTF_8), b="request-b".getBytes(StandardCharsets.UTF_8);
        assertNotEquals(EmailInternalSignature.fingerprint(KEY,a),EmailInternalSignature.fingerprint(KEY,b));
        assertNotEquals(EmailInternalSignature.fingerprint(KEY,a),EmailInternalSignature.fingerprint(KEY+"-other",a));
    }
    @Test void httpErrorsHaveNoStoreAndNeverEchoSensitiveUpstreamMaterial() throws Exception {
        var service=mock(VerificationEmailService.class);
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller(service,true))
            .setControllerAdvice(new VerificationEmailErrors()).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(VerificationEmailController.PATH)
            .contentType("application/json").content("{}"))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control","private, no-store, max-age=0"))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().json("{\"code\":\"EMAIL_INTERNAL_AUTH_REQUIRED\"}"));
        byte[] body=new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).writeValueAsBytes(dto());String ts=Long.toString(Instant.now().getEpochSecond());
        when(service.deliver(any(),any())).thenThrow(new IllegalStateException("private-upstream-material"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(VerificationEmailController.PATH)
            .contentType("application/json").content(body).header("X-Craves-Email-Timestamp",ts)
            .header("X-Craves-Email-Signature",signature(VerificationEmailController.PATH,ts,body)))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isServiceUnavailable())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().json("{\"code\":\"EMAIL_TRANSPORT_UNAVAILABLE\"}"));
    }
    static VerificationEmailRequest dto() { return new VerificationEmailRequest(UUID.randomUUID(),UUID.randomUUID(),"recipient@example.test","804729",Instant.now().plusSeconds(600)); }
    static VerificationEmailController controller(VerificationEmailService service,boolean enabled) {
        return new VerificationEmailController(new VerificationEmailSettings(KEY,enabled),service,new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS));
    }
}
