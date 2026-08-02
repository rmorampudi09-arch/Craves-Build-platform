package in.craves.notification.delivery;

import com.azure.communication.email.EmailClient;
import com.azure.communication.email.models.EmailMessage;
import com.azure.communication.email.models.EmailSendResult;
import com.azure.core.util.polling.PollResponse;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryResult;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryWorkItem;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConditionalOnProperty(prefix = "craves.notification.delivery", name = "email-enabled", havingValue = "true")
public class AcsEmailAdapter {
    private final EmailClient emailClient;
    private final NotificationDeliveryProperties properties;

    public AcsEmailAdapter(EmailClient emailClient, NotificationDeliveryProperties properties) {
        this.emailClient = emailClient;
        this.properties = properties;
    }

    public DeliveryResult send(DeliveryWorkItem item) {
        if (!StringUtils.hasText(item.deliveryAddress()) || !item.deliveryAddress().contains("@")) {
            throw new IllegalArgumentException("Notification email address is missing or invalid");
        }
        EmailMessage message = new EmailMessage()
            .setSenderAddress(properties.getAcsEmailSenderAddress())
            .setToRecipients(item.deliveryAddress())
            .setSubject(item.title())
            .setBodyPlainText(item.body());
        PollResponse<EmailSendResult> response = emailClient.beginSend(message).waitForCompletion();
        EmailSendResult result = response.getValue();
        if (result == null || result.getId() == null) {
            throw new IllegalStateException("ACS Email did not return an operation identifier");
        }
        return new DeliveryResult("azure-communication-services-email", result.getId());
    }
}
