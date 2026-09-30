package in.craves.integration.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.CartBillPreviewFinanceService;
import in.craves.integration.finance.source.FinancialJson;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

class InternalCartBillPreviewControllerTest {
    private final String key="test-key-only-at-least-32-characters-long";
    @Test void rejectsUnsignedTamperedAndOversizedCallsBeforeReadingPolicies() throws Exception {
        var service=mock(CartBillPreviewFinanceService.class);
        var controller=new InternalCartBillPreviewController(service,new ObjectMapper(),key);
        var request=new MockHttpServletRequest();request.setContent("{}".getBytes(StandardCharsets.UTF_8));
        assertThrows(ResponseStatusException.class,()->controller.preview(request));
        request.addHeader("X-Craves-Finance-Signature",FinancialJson.sign("different".getBytes(StandardCharsets.UTF_8),key));
        assertThrows(ResponseStatusException.class,()->controller.preview(request));
        request.setContent(new byte[524289]);
        assertThrows(ResponseStatusException.class,()->controller.preview(request));
        verifyNoInteractions(service);
    }
    @Test void acceptsOnlyASignedBody() throws Exception {
        var service=mock(CartBillPreviewFinanceService.class);
        var controller=new InternalCartBillPreviewController(service,new ObjectMapper(),key);
        var request=new MockHttpServletRequest();byte[] body="{\"foodSubtotal\":\"251.00\",\"deliveryBeforeTax\":\"30.00\",\"pickupStateCode\":\"36\",\"dropoffStateCode\":\"36\"}".getBytes(StandardCharsets.UTF_8);
        request.setContent(body);request.addHeader("X-Craves-Finance-Signature",FinancialJson.sign(body,key));
        controller.preview(request);
        verify(service).preview(any(CartBillPreviewFinanceService.Request.class));
    }
}
