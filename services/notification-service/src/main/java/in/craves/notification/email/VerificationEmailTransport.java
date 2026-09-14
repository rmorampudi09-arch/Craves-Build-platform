package in.craves.notification.email;

import com.azure.communication.email.EmailClient;
import com.azure.communication.email.EmailClientBuilder;
import com.azure.communication.email.models.EmailAddress;
import com.azure.communication.email.models.EmailMessage;
import com.azure.communication.email.models.EmailSendStatus;
import com.azure.core.http.netty.NettyAsyncHttpClientBuilder;
import com.azure.core.http.policy.FixedDelayOptions;
import com.azure.core.http.policy.RetryOptions;
import in.craves.notification.delivery.NotificationDeliveryProperties;
import java.time.Duration;
import org.springframework.stereotype.Component;

/** Independent bounded transport, with no automatic resend on ambiguous ACS outcomes. */
@Component
public class VerificationEmailTransport {
    public enum Outcome { ACCEPTED, UNKNOWN, UNAVAILABLE }
    private final NotificationDeliveryProperties properties;
    private final java.util.concurrent.Semaphore capacity;
    @org.springframework.beans.factory.annotation.Autowired
    public VerificationEmailTransport(NotificationDeliveryProperties properties) { this(properties, new java.util.concurrent.Semaphore(8)); }
    VerificationEmailTransport(NotificationDeliveryProperties properties, java.util.concurrent.Semaphore capacity) {
        this.properties = properties; this.capacity = capacity;
    }
    public boolean configured() {
        return properties.getAcsEmailConnectionString() != null && !properties.getAcsEmailConnectionString().isBlank() &&
            VerificationEmailRequest.validEmail(properties.getAcsEmailSenderAddress());
    }
    EmailMessage prepareMessage(VerificationEmailRequest request) throws java.io.IOException {
        var content = VerificationEmailTemplate.render(request.code());
        EmailMessage message = new EmailMessage().setSenderAddress(properties.getAcsEmailSenderAddress()).setToRecipients(request.email())
                .setSubject(VerificationEmailTemplate.SUBJECT).setBodyHtml(content.html()).setBodyPlainText(content.plainText())
                .setUserEngagementTrackingDisabled(true)
                .setAttachments(new com.azure.communication.email.models.EmailAttachment("craves.png", "image/png",
                    com.azure.core.util.BinaryData.fromBytes(content.logo())).setContentId(VerificationEmailTemplate.LOGO_CID));
        if (VerificationEmailRequest.validEmail(properties.getAcsEmailReplyToAddress()))
                message.setReplyTo(new EmailAddress(properties.getAcsEmailReplyToAddress()));
        return message;
    }
    public Outcome send(VerificationEmailRequest request) {
        if (!capacity.tryAcquire()) return Outcome.UNAVAILABLE;
        try { return sendWithinCapacity(request); }
        finally { capacity.release(); }
    }
    private Outcome sendWithinCapacity(VerificationEmailRequest request) {
        final EmailClient client;
        final EmailMessage message;
        try {
            if (!configured()) return Outcome.UNAVAILABLE;
            var http = new NettyAsyncHttpClientBuilder().connectTimeout(Duration.ofSeconds(3))
                .responseTimeout(Duration.ofSeconds(8)).readTimeout(Duration.ofSeconds(8)).writeTimeout(Duration.ofSeconds(8)).build();
            client = new EmailClientBuilder().connectionString(properties.getAcsEmailConnectionString()).httpClient(http)
                .retryOptions(new RetryOptions(new FixedDelayOptions(0, Duration.ofSeconds(1)))).buildClient();
            message = prepareMessage(request);
        } catch (Exception ex) { return Outcome.UNAVAILABLE; }
        // Once submission starts, all ambiguous exceptions retain UNKNOWN and must never be blindly retried.
        try {
            var result = client.beginSend(message).waitForCompletion(Duration.ofSeconds(15)).getValue();
            if (result == null || result.getId() == null) return Outcome.UNKNOWN;
            if (EmailSendStatus.SUCCEEDED.equals(result.getStatus())) return Outcome.ACCEPTED;
            if (EmailSendStatus.FAILED.equals(result.getStatus())) return Outcome.UNAVAILABLE;
            return Outcome.UNKNOWN;
        } catch (Exception ex) { return Outcome.UNKNOWN; }
    }
}
