package in.craves.notification.documents;

import com.azure.communication.email.EmailClient;
import com.azure.communication.email.EmailClientBuilder;
import com.azure.communication.email.models.EmailAddress;
import com.azure.communication.email.models.EmailAttachment;
import com.azure.communication.email.models.EmailMessage;
import com.azure.communication.email.models.EmailSendStatus;
import com.azure.core.http.netty.NettyAsyncHttpClientBuilder;
import com.azure.core.http.policy.FixedDelayOptions;
import com.azure.core.http.policy.RetryOptions;
import com.azure.core.util.BinaryData;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.delivery.NotificationDeliveryProperties;
import java.net.URI;
import java.time.Duration;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class DocumentEmailGateway {
    public record Prepared(EmailClient client,EmailMessage message) {}
    public record Outcome(String status,String operationId,String errorCode) {}
    private record IdentityEmail(UUID identityId,String email,boolean emailVerified,String status) {}
    private final NotificationDeliveryProperties properties;
    private final DocumentSettings settings;
    private final DocumentHttp http;
    private final ObjectMapper mapper;
    public DocumentEmailGateway(NotificationDeliveryProperties properties,DocumentSettings settings,DocumentHttp http,ObjectMapper mapper) {
        this.properties=properties; this.settings=settings; this.http=http; this.mapper=mapper;
    }
    public Prepared prepare(UUID owner,DocumentModels.Summary summary,byte[] pdf) {
        if(!settings.emailEnabled) throw new IllegalStateException("Document email disabled");
        if(properties.getAuthInternalServiceSecret().isBlank() || properties.getAcsEmailConnectionString().isBlank() ||
            !validEmail(properties.getAcsEmailSenderAddress())) throw new IllegalStateException("DOCUMENT_EMAIL_CONFIGURATION_REQUIRED");
        URI endpoint=URI.create(DocumentSettings.base(properties.getAuthInternalBaseUrl(),settings.allowLocalHttp)
            +"/internal/v1/identities/"+owner+"/email");
        var response=http.get(endpoint,"X-Craves-Internal-Secret",properties.getAuthInternalServiceSecret(),8192);
        IdentityEmail identity;
        try { identity=mapper.readValue(response.body(),IdentityEmail.class); }
        catch(Exception ex) { throw new IllegalStateException("VERIFIED_EMAIL_REQUIRED"); }
        if(response.statusCode()!=200 || identity==null || !owner.equals(identity.identityId()) ||
            !identity.emailVerified() || !"ACTIVE".equals(identity.status()) || !validEmail(identity.email()))
            throw new IllegalStateException("VERIFIED_EMAIL_REQUIRED");
        var transport=new NettyAsyncHttpClientBuilder().connectTimeout(Duration.ofSeconds(5))
            .responseTimeout(Duration.ofSeconds(15)).readTimeout(Duration.ofSeconds(15)).writeTimeout(Duration.ofSeconds(15)).build();
        EmailClient client=new EmailClientBuilder().connectionString(properties.getAcsEmailConnectionString())
            .httpClient(transport).retryOptions(new RetryOptions(new FixedDelayOptions(0,Duration.ofSeconds(1)))).buildClient();
        EmailMessage message=new EmailMessage().setSenderAddress(properties.getAcsEmailSenderAddress())
            .setToRecipients(identity.email().trim()).setSubject("Your Craves "+summary.type().title().toLowerCase(java.util.Locale.ROOT))
            .setBodyPlainText("Your requested Craves document is attached.\n\nDocument ID: "+summary.id()+
                "\nThe document records the saved information at generation time. It is not a GST tax invoice or a promise of settlement."+
                "\n\nYou can access your saved documents after signing into Craves.")
            .setAttachments(new EmailAttachment("craves-"+summary.id()+".pdf","application/pdf",BinaryData.fromBytes(pdf)));
        if(validEmail(properties.getAcsEmailReplyToAddress())) message.setReplyTo(new EmailAddress(properties.getAcsEmailReplyToAddress()));
        return new Prepared(client,message);
    }
    public Outcome send(Prepared prepared) {
        var response=prepared.client().beginSend(prepared.message()).waitForCompletion(Duration.ofSeconds(60));
        var result=response.getValue();
        if(result==null || result.getId()==null) return new Outcome("UNKNOWN",null,"EMAIL_OUTCOME_UNKNOWN");
        if(EmailSendStatus.SUCCEEDED.equals(result.getStatus())) return new Outcome("ACCEPTED",result.getId(),null);
        if(EmailSendStatus.FAILED.equals(result.getStatus())) return new Outcome("FAILED",result.getId(),"EMAIL_PROVIDER_REJECTED");
        return new Outcome("UNKNOWN",result.getId(),"EMAIL_OUTCOME_UNKNOWN");
    }
    static boolean validEmail(String value) {
        return value!=null && value.length()<=254 && value.matches("[^\\s<>@,;]+@[^\\s<>@,;]+\\.[^\\s<>@,;]+");
    }
}
