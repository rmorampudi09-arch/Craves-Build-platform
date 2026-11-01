package in.craves.integration.delivery.pidge;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PidgeProperties;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import org.junit.jupiter.api.Test;

class PidgeTransportTest {
    final ObjectMapper mapper = new ObjectMapper();
    final PidgeProperties properties = new PidgeProperties();
    final HttpClient http = mock(HttpClient.class);
    final PidgeTransport transport = new PidgeTransport(properties, mapper, http);

    PidgeTransportTest() {
        properties.setEnabled(true);
        properties.setAuthToken("test-token");
    }

    @SuppressWarnings("unchecked")
    HttpResponse<String> response(int status, String body) throws Exception {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        return response;
    }

    @Test void walletErrorIsCategorizedWithoutLeakingProviderBody() throws Exception {
        response(402, "{\"error\":\"Insufficient wallet balance\",\"token\":\"private-token\",\"address\":\"private-address\"}");
        var failure = assertThrows(PidgeTransport.ApiException.class, () -> transport.quote(mapper.createObjectNode()));
        assertEquals("Pidge API HTTP 402 (WALLET_OR_CREDIT_LIMIT)", failure.getMessage());
        assertFalse(failure.uncertain());
        assertFalse(failure.getMessage().contains("private-"));
        verify(http, times(1)).send(any(), any(HttpResponse.BodyHandler.class));
    }

    @Test void unknownErrorIsNotPrintedOrInvented() throws Exception {
        response(400, "{\"error\":\"private-address private-phone private-token\"}");
        var failure = assertThrows(PidgeTransport.ApiException.class, () -> transport.quote(mapper.createObjectNode()));
        assertEquals("Pidge API HTTP 400 (UNCLASSIFIED)", failure.getMessage());
    }

    @Test void mutationUncertaintyIsPreserved() throws Exception {
        response(503, "{}");
        var failure = assertThrows(PidgeTransport.ApiException.class,
            () -> transport.mutate("/v1.0/store/channel/vendor/order", mapper.createObjectNode()));
        assertTrue(failure.uncertain());
        verify(http, times(1)).send(any(), any(HttpResponse.BodyHandler.class));
    }

    @Test void timeoutDoesNotRetryChargeableQuote() throws Exception {
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(new HttpTimeoutException("private-token"));
        var failure = assertThrows(PidgeTransport.ApiException.class, () -> transport.quote(mapper.createObjectNode()));
        assertEquals("Pidge response was not received", failure.getMessage());
        assertFalse(failure.uncertain());
        verify(http, times(1)).send(any(), any(HttpResponse.BodyHandler.class));
    }

    @Test void providerErrorOnHttpSuccessStillFailsClosed() throws Exception {
        response(200, "{\"error\":\"Invalid token private-token\"}");
        var failure = assertThrows(PidgeTransport.ApiException.class, () -> transport.quote(mapper.createObjectNode()));
        assertEquals("Pidge reported an API error (AUTHORIZATION)", failure.getMessage());
    }

    @Test void workerCancellationPreservesInterruptAndDoesNotRetry() throws Exception {
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(new InterruptedException("private-token"));
        try {
            var failure = assertThrows(PidgeTransport.ApiException.class, () -> transport.quote(mapper.createObjectNode()));
            assertEquals("Pidge request interrupted", failure.getMessage());
            assertTrue(Thread.currentThread().isInterrupted());
            verify(http, times(1)).send(any(), any(HttpResponse.BodyHandler.class));
        } finally { Thread.interrupted(); }
    }

    @Test void safeCategoriesAreBoundedAndNeverEchoInput() {
        assertEquals("SERVICEABILITY", PidgeTransport.failureCategory("Not serviceable"));
        assertEquals("UNCLASSIFIED", PidgeTransport.failureCategory(null));
        assertEquals("UNCLASSIFIED", PidgeTransport.failureCategory("x".repeat(8193)));
    }
}
