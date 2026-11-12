package in.craves.notification.delivery;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryWorkItem;
import in.craves.notification.documents.DocumentHttp;
import java.net.URI;
import java.util.Arrays;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Handbook 082: the number an SMS goes to is always the recipient's own sign-in phone from Auth, never an address a caller
 * supplied, and only while the identity is ACTIVE. Only Indian mobile numbers (+91, 10 digits starting 6–9): DLT-registered
 * templates cover India only.
 */
@Component
public class AuthRecipientPhoneResolver {
    private static final String INTERNAL_SECRET_HEADER = "X-Craves-Internal-Secret";
    private final NotificationDeliveryProperties properties;
    private final DocumentHttp http;
    private final ObjectMapper mapper;

    public AuthRecipientPhoneResolver(NotificationDeliveryProperties properties, DocumentHttp http, ObjectMapper mapper) {
        this.properties = properties;
        this.http = http;
        this.mapper = mapper;
    }

    /**
     * {@code 91XXXXXXXXXX}, as MSG91 takes it. A person who is not ACTIVE, has no Indian mobile or is unknown to Auth is
     * {@link Msg91SmsAdapter.SmsNotSent} (never retried); an Auth outage is an IllegalStateException (retried).
     */
    public String resolve(DeliveryWorkItem item) {
        if (item.recipientIdentityId() == null) {
            throw new IllegalArgumentException("Notification recipient identity is required for SMS lookup");
        }
        if (!StringUtils.hasText(properties.getAuthInternalBaseUrl()) || !StringUtils.hasText(properties.getAuthInternalServiceSecret())) {
            throw new IllegalStateException("Auth lookup endpoint and secret are not configured");
        }
        URI origin = URI.create(properties.getAuthInternalBaseUrl().trim());
        if (!"https".equalsIgnoreCase(origin.getScheme()) || origin.getHost() == null || origin.getUserInfo() != null
            || origin.getQuery() != null || origin.getFragment() != null
            || (origin.getPath() != null && !origin.getPath().isEmpty() && !"/".equals(origin.getPath()))) {
            throw new IllegalStateException("Auth lookup endpoint is not a plain https origin");
        }
        UUID id = item.recipientIdentityId();
        Status status = read(origin, id, "/email", Status.class);
        Contact contact = read(origin, id, "/contact", Contact.class);
        if (!id.equals(status.identityId()) || !id.equals(contact.identityId())) {
            throw new IllegalStateException("Auth answered for another identity");
        }
        if (!"ACTIVE".equals(status.status()) || contact.phoneNumber() == null || !contact.phoneNumber().matches("\\+91[6-9][0-9]{9}")) {
            throw new Msg91SmsAdapter.SmsNotSent("Recipient does not have an active Indian mobile number");
        }
        return contact.phoneNumber().substring(1);
    }

    private <T> T read(URI origin, UUID id, String suffix, Class<T> type) {
        java.net.http.HttpResponse<byte[]> reply;
        try {
            reply = http.get(origin.resolve("/internal/v1/identities/" + id + suffix), INTERNAL_SECRET_HEADER,
                properties.getAuthInternalServiceSecret(), 8192);
        } catch (Exception ex) {
            throw new IllegalStateException("Auth phone lookup is unavailable");
        }
        byte[] body = reply.body();
        try {
            if (reply.statusCode() == 400 || reply.statusCode() == 404) {
                throw new Msg91SmsAdapter.SmsNotSent("Recipient is not known to Auth");
            }
            if (reply.statusCode() != 200) {
                throw new IllegalStateException("Auth phone lookup answered HTTP " + reply.statusCode());
            }
            T value;
            try {
                value = mapper.readValue(body, type);
            } catch (Exception ex) {
                value = null;
            }
            if (value == null) {
                throw new IllegalStateException("Auth phone lookup answered something unreadable");
            }
            return value;
        } finally {
            if (body != null) {
                Arrays.fill(body, (byte) 0);
            }
        }
    }

    private record Status(UUID identityId, String status) {
        @Override public String toString() { return "Status[REDACTED]"; }
    }

    private record Contact(UUID identityId, String phoneNumber) {
        @Override public String toString() { return "Contact[REDACTED]"; }
    }
}
