package in.craves.notification.delivery;

import com.azure.communication.email.EmailClient;
import com.azure.communication.email.models.EmailAddress;
import com.azure.communication.email.models.EmailMessage;
import com.azure.communication.email.models.EmailSendResult;
import com.azure.communication.email.models.EmailSendStatus;
import com.azure.core.util.polling.LongRunningOperationStatus;
import com.azure.core.util.polling.PollResponse;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryResult;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryWorkItem;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConditionalOnProperty(prefix = "craves.notification.delivery", name = "email-enabled", havingValue = "true")
public class AcsEmailAdapter {
    private static final Duration CUSTOMER_ADMIN_COMPLETION_WAIT = Duration.ofSeconds(60);
    private final EmailClient emailClient;
    private final NotificationDeliveryProperties properties;
    private final AuthRecipientEmailResolver recipientEmailResolver;

    public AcsEmailAdapter(
        EmailClient emailClient,
        NotificationDeliveryProperties properties,
        AuthRecipientEmailResolver recipientEmailResolver
    ) {
        this.emailClient = emailClient;
        this.properties = properties;
        this.recipientEmailResolver = recipientEmailResolver;
    }

    public DeliveryResult send(DeliveryWorkItem item) {
        String recipient = recipientEmailResolver.resolve(item);
        EmailMessage message = new EmailMessage()
            .setSenderAddress(properties.getAcsEmailSenderAddress())
            .setToRecipients(recipient)
            .setSubject(item.title())
            .setBodyPlainText(item.body());
        if (StringUtils.hasText(properties.getAcsEmailReplyToAddress())) {
            message.setReplyTo(new EmailAddress(properties.getAcsEmailReplyToAddress().trim()));
        }
        // Scope this correction to the audience saved with this request, not the identity's current roles.
        // Chef and unknown audiences deliberately retain their existing provider handling.
        boolean requireConfirmedResult = "CUSTOMER".equals(item.recipientRole()) || "ADMIN".equals(item.recipientRole());
        PollResponse<EmailSendResult> response;
        try {
            var poller = emailClient.beginSend(message);
            response = requireConfirmedResult
                ? poller.waitForCompletion(CUSTOMER_ADMIN_COMPLETION_WAIT)
                : poller.waitForCompletion();
        } catch (RuntimeException exception) {
            if (!requireConfirmedResult) {
                throw exception;
            }
            // An exception/timeout does not prove rejection. Preserve the queue's existing retry policy
            // without storing provider exception text, which can contain recipient or request data.
            throw new IllegalStateException("ACS Email outcome is unconfirmed");
        }
        if (requireConfirmedResult) {
            requireSuccessfulOperation(response);
        }
        EmailSendResult result = response.getValue();
        if (result == null || result.getId() == null) {
            throw new IllegalStateException("ACS Email did not return an operation identifier");
        }
        return new DeliveryResult("azure-communication-services-email", result.getId());
    }

    private static void requireSuccessfulOperation(PollResponse<EmailSendResult> response) {
        if (response == null) {
            throw new IllegalStateException("ACS Email outcome is unconfirmed");
        }
        EmailSendResult result = response.getValue();
        if (LongRunningOperationStatus.FAILED.equals(response.getStatus())
            || (result != null && EmailSendStatus.FAILED.equals(result.getStatus()))) {
            throw new IllegalStateException("ACS Email operation failed");
        }
        if (LongRunningOperationStatus.USER_CANCELLED.equals(response.getStatus())
            || (result != null && EmailSendStatus.CANCELED.equals(result.getStatus()))) {
            throw new IllegalStateException("ACS Email operation was cancelled");
        }
        if (!LongRunningOperationStatus.SUCCESSFULLY_COMPLETED.equals(response.getStatus())
            || result == null || !EmailSendStatus.SUCCEEDED.equals(result.getStatus())
            || !StringUtils.hasText(result.getId())) {
            throw new IllegalStateException("ACS Email outcome is unconfirmed");
        }
    }
}
