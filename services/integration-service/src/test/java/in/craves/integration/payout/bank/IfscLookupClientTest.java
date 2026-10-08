package in.craves.integration.payout.bank;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class IfscLookupClientTest {
    @Test void confirmsExactIfscAndCachesSafeLabels() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();var client=new IfscLookupClient(builder.build());
        server.expect(requestTo("https://ifsc.razorpay.com/HDFC0001234")).andRespond(withSuccess("{\"IFSC\":\"HDFC0001234\",\"BANK\":\"Test Bank\",\"BRANCH\":\"Test Branch\"}",MediaType.APPLICATION_JSON));
        var result=client.lookup("hdfc0001234");assertEquals("Test Branch",result.branchName());assertEquals(result,client.lookup("HDFC0001234"));server.verify();
    }
    @Test void mismatchingDirectoryResponseCannotConfirmBank() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();var client=new IfscLookupClient(builder.build());
        server.expect(requestTo("https://ifsc.razorpay.com/HDFC0001234")).andRespond(withSuccess("{\"IFSC\":\"HDFC0009999\",\"BANK\":\"Test Bank\",\"BRANCH\":\"Test Branch\"}",MediaType.APPLICATION_JSON));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->client.lookup("HDFC0001234")).getStatusCode());server.verify();
    }
    @Test void missingAndInvalidCodesStayUnconfirmed() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();var client=new IfscLookupClient(builder.build());
        assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->client.lookup("../bad")).getStatusCode());
        server.expect(requestTo("https://ifsc.razorpay.com/HDFC0001234")).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,()->client.lookup("HDFC0001234")).getStatusCode());server.verify();
    }
}
