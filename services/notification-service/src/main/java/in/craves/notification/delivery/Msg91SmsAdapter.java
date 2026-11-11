package in.craves.notification.delivery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryResult;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryWorkItem;
import in.craves.notification.delivery.NotificationDeliveryRepository.SmsContent;
import in.craves.notification.documents.DocumentHttp;
import in.craves.notification.service.SmsPolicyProperties;
import in.craves.notification.service.SmsPolicyProperties.SmsTemplate;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Handbook 082: one transactional SMS through MSG91's flow API (the provider Auth already uses for OTP). The text is the
 * DLT template the owner registered; Craves sends only the template id, the recipient's own Auth phone and the template's
 * variables, taken by name from the notification payload (scalars only, control and invisible characters removed, at most
 * 30 characters each, the DLT variable limit). Nothing else from the notification (title, body) is ever sent. An SMS that
 * can never be sent (stale, unlisted, a team alert, a missing variable, no active Indian mobile, a test number) is
 * {@link SmsNotSent}, which the worker records as SKIPPED instead of retrying.
 */
@Component
@ConditionalOnProperty(prefix = "craves.notification.delivery", name = "sms-enabled", havingValue = "true")
public class Msg91SmsAdapter {
    static final String PROVIDER = "msg91-sms";
    /** An order update read hours later is noise; anything older is skipped. shortcut: fixed, make it per event if one needs longer. */
    static final Duration MAX_AGE = Duration.ofMinutes(30);
    private static final URI FLOW = URI.create("https://control.msg91.com/api/v5/flow");
    private static final int MAX_VARIABLE = 30;
    private static final int MAX_ANSWER = 8192;

    private final NotificationDeliveryProperties properties;
    private final SmsPolicyProperties policy;
    private final NotificationDeliveryRepository repository;
    private final AuthRecipientPhoneResolver phones;
    private final DocumentHttp http;
    private final ObjectMapper mapper;
    private final URI flow;
    private final Clock clock;

    /** An SMS that will never be sent; recorded as SKIPPED with this reason. */
    public static final class SmsNotSent extends RuntimeException {
        public SmsNotSent(String reason) {
            super(reason, null, false, false);
        }
    }

    @Autowired
    public Msg91SmsAdapter(NotificationDeliveryProperties properties, SmsPolicyProperties policy, NotificationDeliveryRepository repository,
                           AuthRecipientPhoneResolver phones, DocumentHttp http, ObjectMapper mapper) {
        this(properties, policy, repository, phones, http, mapper, FLOW, Clock.systemUTC());
    }

    Msg91SmsAdapter(NotificationDeliveryProperties properties, SmsPolicyProperties policy, NotificationDeliveryRepository repository,
                    AuthRecipientPhoneResolver phones, DocumentHttp http, ObjectMapper mapper, URI flow, Clock clock) {
        this.properties = properties;
        this.policy = policy;
        this.repository = repository;
        this.phones = phones;
        this.http = http;
        this.mapper = mapper;
        this.flow = flow;
        this.clock = clock;
    }

    public DeliveryResult send(DeliveryWorkItem item) {
        SmsContent content = repository.smsContent(item.requestId());
        if (content.createdAt() == null || content.createdAt().toInstant().isBefore(clock.instant().minus(MAX_AGE))) {
            throw new SmsNotSent("Older than " + MAX_AGE.toMinutes() + " minutes; an SMS is not sent this late");
        }
        if (AuthRecipientEmailResolver.TEAM_ALERT.equals(item.targetType())) {
            throw new SmsNotSent("A team alert is never sent by SMS");
        }
        SmsTemplate template = policy.template(content.eventType());
        if (template == null) {
            throw new SmsNotSent("No SMS template is configured for " + content.eventType());
        }
        JsonNode payload = readJson(content.payloadJson());
        Map<String, String> variables = new LinkedHashMap<>();
        for (String name : template.variables()) {
            variables.put(name, variable(payload, name));
        }
        String phone = phones.resolve(item);
        if (properties.isSmsSkippedNumber(phone)) {
            throw new SmsNotSent("A test number; SMS not sent");
        }
        ObjectNode recipient = mapper.createObjectNode().put("mobiles", phone);
        variables.forEach(recipient::put);
        ObjectNode body = mapper.createObjectNode().put("template_id", template.templateId()).put("short_url", "0");
        body.putArray("recipients").add(recipient);
        java.net.http.HttpResponse<byte[]> response;
        try {
            response = http.postJson(flow, Map.of("authkey", properties.getMsg91AuthKey()), mapper.writeValueAsString(body), MAX_ANSWER);
        } catch (Exception ex) {
            throw new IllegalStateException("MSG91 SMS request failed or timed out");
        }
        JsonNode answer = readJson(new String(response.body(), StandardCharsets.UTF_8));
        String requestId = answer.path("message").asText("");
        if (response.statusCode() != 200 || !"success".equals(answer.path("type").asText())) {
            throw new IllegalStateException("MSG91 refused the SMS (HTTP " + response.statusCode() + "): " + clean(requestId, 120));
        }
        if (requestId.isBlank() || requestId.length() > 120) {
            throw new IllegalStateException("MSG91 accepted the SMS without a request id");
        }
        return new DeliveryResult(PROVIDER, requestId);
    }

    private JsonNode readJson(String text) {
        try {
            JsonNode value = text == null ? null : mapper.readTree(text);
            return value != null && value.isObject() ? value : mapper.createObjectNode();
        } catch (Exception ex) {
            return mapper.createObjectNode();
        }
    }

    private static String variable(JsonNode payload, String name) {
        JsonNode value = payload.get(name);
        String text = value == null || !value.isValueNode() || value.isNull() ? "" : clean(value.asText(), Integer.MAX_VALUE);
        if (text.isEmpty()) {
            throw new SmsNotSent("SMS variable " + name + " is missing from the notification payload");
        }
        if (text.codePointCount(0, text.length()) > MAX_VARIABLE) {
            throw new SmsNotSent("SMS variable " + name + " is longer than " + MAX_VARIABLE + " characters");
        }
        return text;
    }

    /** Control, invisible format and line or paragraph separator characters become spaces; trimmed and capped. */
    private static String clean(String text, int max) {
        String cleaned = text.replaceAll("[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}]", " ").trim();
        return cleaned.length() > max ? cleaned.substring(0, max) : cleaned;
    }
}
