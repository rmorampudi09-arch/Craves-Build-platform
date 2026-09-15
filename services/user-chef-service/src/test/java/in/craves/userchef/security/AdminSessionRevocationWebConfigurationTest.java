package in.craves.userchef.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.Semaphore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

class AdminSessionRevocationWebConfigurationTest {
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    MockHttpServletRequest request(String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("verified-principal", null, List.of()));
        var request = new MockHttpServletRequest("GET", "/api/v1/admin/test");
        String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(("{\"roles\":[\"" + role + "\"]}").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        request.addHeader("Authorization", "Bearer synthetic." + payload + ".already-verified-by-filter");
        return request;
    }
    AdminSessionRevocationWebConfiguration configuration(HttpClient client, Semaphore permits) {
        return new AdminSessionRevocationWebConfiguration(new ObjectMapper(), client, URI.create("https://auth.example.com/api/v1/auth/me"), permits);
    }
    @Test void customerChefAndProviderCallbacksNeverCallAdminVerification() throws Exception {
        var client = mock(HttpClient.class); var gate = configuration(client, new Semaphore(16)).interceptor();
        assertTrue(gate.preHandle(request("CUSTOMER"), new MockHttpServletResponse(), new Object()));
        assertTrue(gate.preHandle(request("CHEF"), new MockHttpServletResponse(), new Object()));
        SecurityContextHolder.clearContext();
        assertTrue(gate.preHandle(new MockHttpServletRequest("POST", "/api/v1/webhooks/provider"), new MockHttpServletResponse(), new Object()));
        verifyNoInteractions(client);
    }
    @Test void eachInternalRoleChecksLiveAuthBeforeTheController() throws Exception {
        var client = mock(HttpClient.class);
        @SuppressWarnings("unchecked") HttpResponse<Void> reply = mock(HttpResponse.class);
        when(reply.statusCode()).thenReturn(200);
        when(reply.headers()).thenReturn(HttpHeaders.of(java.util.Map.of("X-Craves-Admin-Session", List.of("verified-v1")), (a,b) -> true)); when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(reply);
        var gate = configuration(client, new Semaphore(16)).interceptor();
        for (String role : List.of("PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "CHEF_ADMIN", "COMPLIANCE_ADMIN", "SUBSCRIPTION_ADMIN", "NOTIFICATION_ADMIN", "AUDIT_ADMIN"))
            assertTrue(gate.preHandle(request(role), new MockHttpServletResponse(), new Object()));
        verify(client, times(9)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }
    @Test void genericSuccessWithoutVerifiedSessionMarkerNeverGrantsAccess() throws Exception {
        var client = mock(HttpClient.class);
        @SuppressWarnings("unchecked") HttpResponse<Void> reply = mock(HttpResponse.class);
        when(reply.statusCode()).thenReturn(200);
        when(reply.headers()).thenReturn(HttpHeaders.of(java.util.Map.of(), (a,b) -> true));
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(reply);
        var failure = assertThrows(ResponseStatusException.class, () -> configuration(client, new Semaphore(16)).interceptor()
            .preHandle(request("PLATFORM_ADMIN"), new MockHttpServletResponse(), new Object()));
        assertEquals(503, failure.getStatusCode().value());
    }
    @Test void revokedSessionAndRoleReturn401AndTransientFailuresReturn503() throws Exception {
        for (int status : new int[]{401,403,429,500,502,503}) {
            var client = mock(HttpClient.class);
            @SuppressWarnings("unchecked") HttpResponse<Void> reply = mock(HttpResponse.class);
            when(reply.statusCode()).thenReturn(status); when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(reply);
            var permits = new Semaphore(16); var gate = configuration(client, permits).interceptor();
            var failure = assertThrows(ResponseStatusException.class, () -> gate.preHandle(request("PLATFORM_ADMIN"), new MockHttpServletResponse(), new Object()));
            assertEquals(status == 401 || status == 403 ? 401 : 503, failure.getStatusCode().value());
            assertEquals(16, permits.availablePermits());
        }
    }
    @Test void transportFailureReleasesCapacityAndNeverGrantsAccess() throws Exception {
        var client = mock(HttpClient.class); when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenThrow(new IOException("synthetic network fault"));
        var permits = new Semaphore(16); var gate = configuration(client, permits).interceptor();
        var failure = assertThrows(ResponseStatusException.class, () -> gate.preHandle(request("PLATFORM_ADMIN"), new MockHttpServletResponse(), new Object()));
        assertEquals(503, failure.getStatusCode().value()); assertEquals(16, permits.availablePermits());
    }
    @Test void saturatedAdminVerificationFailsFastWithoutAnUnboundedQueue() {
        var client = mock(HttpClient.class); var gate = configuration(client, new Semaphore(0)).interceptor();
        var failure = assertThrows(ResponseStatusException.class, () -> gate.preHandle(request("PLATFORM_ADMIN"), new MockHttpServletResponse(), new Object()));
        assertEquals(503, failure.getStatusCode().value()); verifyNoInteractions(client);
    }
}
