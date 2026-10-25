package in.craves.auth.msg91;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import org.junit.jupiter.api.Test;

class Msg91VerifierTest {
    ObjectMapper json = new ObjectMapper();
    @Test void acceptsOnlyProviderVerifiedIndianPhone() throws Exception {
        assertEquals("+919876543210", Msg91Verifier.phoneFromResponse(json.readTree("{\"type\":\"success\",\"message\":\"919876543210\"}")));
        for (String value : new String[]{"user@example.com", "12125551234", "+919876543210", "910123456789", ""}) {
            var response = json.createObjectNode().put("type", "success").put("message", value);
            assertThrows(AuthException.class, () -> Msg91Verifier.phoneFromResponse(response));
        }
        assertThrows(AuthException.class, () -> Msg91Verifier.phoneFromResponse(null));
        assertThrows(AuthException.class, () -> Msg91Verifier.phoneFromResponse(json.createObjectNode().put("type", "error").put("message", "919876543210")));
    }
    @Test void disabledProviderFailsClosedAndSecretsStayOutOfDiagnostics() {
        assertThrows(AuthException.class, () -> new Msg91Verifier(new Msg91Properties(false, "synthetic-key")).verifiedPhone("token"));
        assertThrows(IllegalStateException.class, () -> new Msg91Properties(true, ""));
        assertFalse(new Msg91Properties(true, "synthetic-key").toString().contains("synthetic-key"));
        assertFalse(new Msg91Controller.VerifyRequest("synthetic-token").toString().contains("synthetic-token"));
    }
}
