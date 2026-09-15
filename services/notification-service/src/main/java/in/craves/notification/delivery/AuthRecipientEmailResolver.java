package in.craves.notification.delivery;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryWorkItem;
import in.craves.notification.documents.DocumentHttp;
import in.craves.notification.email.VerificationEmailRequest;
import java.net.URI;
import java.util.Arrays;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class AuthRecipientEmailResolver {
    private static final String INTERNAL_SECRET_HEADER = "X-Craves-Internal-Secret";
    private final NotificationDeliveryProperties properties;
    private final DocumentHttp http;
    private final ObjectMapper mapper;
    public AuthRecipientEmailResolver(NotificationDeliveryProperties properties, DocumentHttp http, ObjectMapper mapper) {
        this.properties=properties;this.http=http;this.mapper=mapper;
    }
    public String resolve(DeliveryWorkItem item) {
        // An ordinary notification's supplied deliveryAddress never overrides verified Auth identity.
        if(item.recipientIdentityId()==null) throw new IllegalArgumentException("Notification recipient identity is required for email lookup");
        if(!StringUtils.hasText(properties.getAuthInternalBaseUrl()) || !StringUtils.hasText(properties.getAuthInternalServiceSecret()))
            throw new IllegalStateException("Auth email lookup endpoint and secret are not configured");
        try {
            URI origin=URI.create(properties.getAuthInternalBaseUrl().trim());
            if(!"https".equalsIgnoreCase(origin.getScheme()) || origin.getHost()==null || origin.getUserInfo()!=null ||
                origin.getQuery()!=null || origin.getFragment()!=null || (origin.getPath()!=null && !origin.getPath().isEmpty() && !"/".equals(origin.getPath())))
                throw new IllegalStateException();
            var reply=http.get(origin.resolve("/internal/v1/identities/"+item.recipientIdentityId()+"/email"),
                INTERNAL_SECRET_HEADER,properties.getAuthInternalServiceSecret(),8192);
            if(reply.statusCode()!=200) throw new IllegalStateException();
            byte[] body=reply.body();InternalIdentityEmailResponse response;
            try {response=mapper.readValue(body,InternalIdentityEmailResponse.class);}
            finally {Arrays.fill(body,(byte)0);}
            if(response==null || !item.recipientIdentityId().equals(response.identityId()) || !"ACTIVE".equals(response.status()) ||
                !response.emailVerified() || !VerificationEmailRequest.validEmail(response.email())) throw new IllegalStateException();
            return response.email();
        } catch(Exception ex){throw new IllegalStateException("Recipient does not have an available active verified email address");}
    }
    private record InternalIdentityEmailResponse(UUID identityId,String email,boolean emailVerified,String status) {
        @Override public String toString(){return "InternalIdentityEmailResponse[REDACTED]";}
    }
}
