package in.craves.auth.email;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import in.craves.auth.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class EmailVerificationControllerTest {
    private final EmailVerificationService service=mock(EmailVerificationService.class);
    private final EmailVerificationController controller=new EmailVerificationController(service,new ObjectMapper());
    private final CurrentUser user=new CurrentUser(UUID.randomUUID(),"synthetic","+10000000000",List.of("CUSTOMER"),1);
    private final UsernamePasswordAuthenticationToken authentication=new UsernamePasswordAuthenticationToken(user,null);
    @Test void derivesIdentityOnlyFromAuthentication() {
        UUID request=UUID.randomUUID();
        controller.issue(authentication,request("{\"email\":\"chef@example.test\",\"requestId\":\""+request+"\"}"));
        verify(service).issue(user,"chef@example.test",request);
        assertThrows(AuthException.class,()->controller.state(null));
        assertThrows(AuthException.class,()->controller.issue(null,request("{}")));
    }
    @Test void refusesUnknownDuplicateOversizeTrailingAndMistypedBodyFields() {
        String id=UUID.randomUUID().toString();
        for(String body:List.of(
            "{\"email\":\"chef@example.test\",\"requestId\":\""+id+"\",\"identityId\":\""+id+"\"}",
            "{\"email\":\"chef@example.test\",\"email\":\"other@example.test\",\"requestId\":\""+id+"\"}",
            "{\"email\":true,\"requestId\":\""+id+"\"}","{}{}","[1,2]"," ".repeat(4097),
            "{\"email\":\"chef@example.test\",\"requestId\":\"1-1-1-1-1\"}"))
            assertThrows(AuthException.class,()->controller.issue(authentication,request(body)));
        verifyNoInteractions(service);
    }
    @Test void verificationPassesOnlyChallengeAndCodeToAuthenticatedOwner() {
        UUID id=UUID.randomUUID();
        controller.verify(authentication,request("{\"challengeId\":\""+id+"\",\"code\":\"012345\"}"));
        verify(service).verify(user,id,"012345");
    }
    @Test void resendTakesOnlyOwnedChallengeAndIdempotencyIdentifier() {
        UUID id=UUID.randomUUID(),receipt=UUID.randomUUID();
        controller.resend(authentication,request("{\"challengeId\":\""+id+"\",\"requestId\":\""+receipt+"\"}"));
        verify(service).resend(user,id,receipt);
    }
    private static MockHttpServletRequest request(String body) {
        var request=new MockHttpServletRequest(); request.setContentType("application/json");
        request.setContent(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)); return request;
    }
}
