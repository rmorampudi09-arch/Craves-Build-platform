package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.web.InternalOrderFinanceController;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FinancialSourceSignatureTest {
    static final String KEY="TEST_ONLY_32_CHARACTER_FINANCE_KEY_VALUE";
    @Test void keyOrderingIsStableButAmountsAndArrayOrderMatter()throws Exception{
        var json=new ObjectMapper();assertEquals(FinancialJson.hash(json.readTree("{\"b\":1,\"a\":2}"),json),FinancialJson.hash(json.readTree("{\"a\":2,\"b\":1}"),json));
        assertNotEquals(FinancialJson.hash(json.readTree("[1,2]"),json),FinancialJson.hash(json.readTree("[2,1]"),json));
    }
    @Test void exactBytesAndDedicatedKeyAreRequired(){
        byte[] body="{}".getBytes(StandardCharsets.UTF_8);String signature=FinancialJson.sign(body,KEY);
        assertTrue(FinancialJson.authentic(body,signature,KEY));assertFalse(FinancialJson.authentic("{ }".getBytes(StandardCharsets.UTF_8),signature,KEY));
        assertFalse(FinancialJson.authentic(body,signature,""));assertFalse(FinancialJson.authentic(body,"0".repeat(64),KEY));
    }
    @Test void unauthenticatedAndOversizedEventsNeverReachFinalization(){
        var finalizer=mock(OrderFinancialFinalizationService.class);var controller=new InternalOrderFinanceController(new ObjectMapper(),mock(OrderFinancialQuoteService.class),finalizer,KEY);
        var missing=new MockHttpServletRequest();missing.setContent("{}".getBytes(StandardCharsets.UTF_8));assertThrows(RuntimeException.class,()->controller.accept(missing));
        var oversized=new MockHttpServletRequest();oversized.setContent(new byte[524289]);assertThrows(RuntimeException.class,()->controller.accept(oversized));verifyNoInteractions(finalizer);
    }
}
