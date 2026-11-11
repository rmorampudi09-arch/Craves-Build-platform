package in.craves.notification.delivery;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.documents.DocumentHttp;
import java.net.URI;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Handbook 082: an SMS goes only to the recipient's own active Indian sign-in phone, never to a supplied address. */
class AuthRecipientPhoneResolverTest {
    private final UUID identity = UUID.randomUUID();

    @Test
    void theAuthPhoneOfAnActiveIdentityWinsOverTheSuppliedAddress() {
        DocumentHttp http = auth(status(identity, "ACTIVE"), contact(identity, "+919876543210"));
        assertEquals("919876543210", resolver(http, properties()).resolve(item(identity)));
    }

    @Test
    void inactiveForeignOrMissingPhonesAreNeverSentAndNeverRetried() {
        String[][] cases = {
            {status(identity, "SUSPENDED"), contact(identity, "+919876543210")},
            {status(identity, "ACTIVE"), contact(identity, "+14155550123")},
            {status(identity, "ACTIVE"), contact(identity, "+915876543210")},
            {status(identity, "ACTIVE"), "{\"identityId\":\"" + identity + "\",\"phoneNumber\":null}"},
        };
        for (String[] answers : cases) {
            var error = assertThrows(Msg91SmsAdapter.SmsNotSent.class, () -> resolver(auth(answers[0], answers[1]), properties()).resolve(item(identity)));
            assertFalse(error.getMessage().contains("+91"));
        }
    }

    @Test
    void anotherOwnerAnUnreadableAnswerOrAnOutageIsRetriedAndAnUnknownPersonIsNot() {
        String[][] retried = {
            {status(identity, "ACTIVE"), contact(UUID.randomUUID(), "+919876543210")},
            {status(UUID.randomUUID(), "ACTIVE"), contact(identity, "+919876543210")},
            {status(identity, "ACTIVE"), "null"},
        };
        for (String[] answers : retried) {
            assertThrows(IllegalStateException.class, () -> resolver(auth(answers[0], answers[1]), properties()).resolve(item(identity)));
        }
        assertThrows(IllegalStateException.class, () -> resolver(auth(503, status(identity, "ACTIVE")), properties()).resolve(item(identity)));
        assertThrows(Msg91SmsAdapter.SmsNotSent.class, () -> resolver(auth(400, "{}"), properties()).resolve(item(identity)));
        DocumentHttp down = mock(DocumentHttp.class);
        when(down.get(any(), any(), any(), anyInt())).thenThrow(new IllegalStateException("private-upstream-detail"));
        var error = assertThrows(IllegalStateException.class, () -> resolver(down, properties()).resolve(item(identity)));
        assertFalse(error.getMessage().contains("private-upstream-detail"));
    }

    @Test
    void noOwnerNoConfigurationOrAnUnsafeOriginNeverCallsAuth() {
        DocumentHttp http = mock(DocumentHttp.class);
        assertThrows(IllegalArgumentException.class, () -> resolver(http, properties()).resolve(item(null)));
        assertThrows(IllegalStateException.class, () -> resolver(http, new NotificationDeliveryProperties()).resolve(item(identity)));
        NotificationDeliveryProperties plain = properties();
        plain.setAuthInternalBaseUrl("http://auth.example.test");
        assertThrows(IllegalStateException.class, () -> resolver(http, plain).resolve(item(identity)));
        verifyNoInteractions(http);
    }

    private AuthRecipientPhoneResolver resolver(DocumentHttp http, NotificationDeliveryProperties properties) {
        return new AuthRecipientPhoneResolver(properties, http, new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES));
    }

    private DocumentHttp auth(String statusBody, String contactBody) {
        DocumentHttp http = mock(DocumentHttp.class);
        HttpResponse<byte[]> statusReply = reply(statusBody);
        HttpResponse<byte[]> contactReply = reply(contactBody);
        URI base = URI.create("https://auth.example.test/internal/v1/identities/" + identity);
        when(http.get(eq(URI.create(base + "/email")), any(), any(), anyInt())).thenReturn(statusReply);
        when(http.get(eq(URI.create(base + "/contact")), any(), any(), anyInt())).thenReturn(contactReply);
        return http;
    }

    private DocumentHttp auth(int status, String body) {
        DocumentHttp http = mock(DocumentHttp.class);
        HttpResponse<byte[]> answer = reply(body, status);
        when(http.get(any(), any(), any(), anyInt())).thenReturn(answer);
        return http;
    }

    private static HttpResponse<byte[]> reply(String body) {
        return reply(body, 200);
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<byte[]> reply(String body, int status) {
        HttpResponse<byte[]> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body.getBytes(StandardCharsets.UTF_8));
        return response;
    }

    private static String status(UUID owner, String status) {
        return "{\"identityId\":\"" + owner + "\",\"email\":null,\"emailVerified\":false,\"status\":\"" + status + "\"}";
    }

    private static String contact(UUID owner, String phone) {
        return "{\"identityId\":\"" + owner + "\",\"phoneNumber\":\"" + phone + "\",\"displayName\":\"Asha\"}";
    }

    private static NotificationDeliveryProperties properties() {
        NotificationDeliveryProperties properties = new NotificationDeliveryProperties();
        properties.setAuthInternalBaseUrl("https://auth.example.test");
        properties.setAuthInternalServiceSecret("unit-test-only-secret");
        return properties;
    }

    private static NotificationDeliveryModels.DeliveryWorkItem item(UUID owner) {
        return new NotificationDeliveryModels.DeliveryWorkItem(UUID.randomUUID(), owner, "SMS", "+911111111111", "Title", "Body", "ORDER",
            null, Map.of(), 5, 0, UUID.randomUUID());
    }
}
