package in.craves.notification.service;

import in.craves.notification.api.CreateNotificationRequest;
import in.craves.notification.domain.NotificationChannel;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Handbook 082: which events also go out as a transactional SMS. Every SMS in India must use a DLT-registered template,
 * so nothing is assumed: an event is sent by SMS only when the owner has listed its MSG91 template, in
 * {@code CRAVES_NOTIFICATION_SMS_TEMPLATES} as {@code EVENT_TYPE=<24-hex MSG91 template id>[:var,var];…}. The variables are
 * filled from the notification's payload by name (MSG91's variable names must be the payload keys). Only service events
 * (the important-email list) can be listed. A malformed entry is ignored (and logged), never guessed.
 */
@Component
@ConfigurationProperties(prefix = "craves.notification.sms")
public class SmsPolicyProperties {
    private static final Logger LOGGER = LoggerFactory.getLogger(SmsPolicyProperties.class);
    private static final String TEMPLATE_ID = "[a-fA-F0-9]{24}";
    private static final String EVENT = "[A-Z][A-Z0-9_]{0,79}";
    private static final String VARIABLE = "[A-Za-z][A-Za-z0-9_]{0,39}";
    private static final int MAX_VARIABLES = 10;
    /** Service (transactional) events only, the same as the important-email list: promotional SMS need consent and another DLT route. */
    static final java.util.Set<String> SERVICE_EVENTS = java.util.Set.copyOf(new ImportantEmailPolicyProperties().getEventTypes());

    private boolean enabled = false;
    private String templates = "";
    private Map<String, SmsTemplate> parsed = Map.of();

    public record SmsTemplate(String templateId, List<String> variables) {}

    /** The template for this event, or null when SMS is off or the owner listed none for it. */
    public SmsTemplate template(String eventType) {
        if (!enabled || eventType == null) {
            return null;
        }
        return parsed.get(eventType.trim().toUpperCase(Locale.ROOT));
    }

    /** A direct SMS request is accepted only for a known recipient and an event with a listed template. */
    public boolean accepts(CreateNotificationRequest request) {
        return request.userId() != null && template(request.eventType()) != null;
    }

    /** An in-app notice of a listed event gets an SMS copy, like the important-email copy; a team alert never does. */
    public boolean shouldFanOut(CreateNotificationRequest request, NotificationChannel channel) {
        return channel == NotificationChannel.IN_APP && !"TEAM_ALERT".equals(request.targetType()) && accepts(request);
    }

    static Map<String, SmsTemplate> parse(String value) {
        Map<String, SmsTemplate> result = new LinkedHashMap<>();
        if (value == null) {
            return result;
        }
        for (String entry : value.split(";")) {
            if (entry.isBlank()) {
                continue;
            }
            String[] eventAndRest = entry.trim().split("=", 2);
            String event = eventAndRest[0].trim().toUpperCase(Locale.ROOT);
            String[] idAndVariables = eventAndRest.length == 2 ? eventAndRest[1].trim().split(":", 2) : new String[] {""};
            String templateId = idAndVariables[0].trim();
            List<String> variables = idAndVariables.length == 2 && !idAndVariables[1].isBlank()
                ? List.of(idAndVariables[1].trim().split("\\s*,\\s*")) : List.of();
            if (!event.matches(EVENT) || !SERVICE_EVENTS.contains(event) || !templateId.matches(TEMPLATE_ID) || variables.size() > MAX_VARIABLES
                || !variables.stream().allMatch(v -> v.matches(VARIABLE)) || variables.stream().distinct().count() != variables.size()
                || result.containsKey(event)) {
                LOGGER.warn("CRAVES_NOTIFICATION_SMS_TEMPLATES entry ignored: {}", event.matches(EVENT) ? event : "(unreadable event type)");
                continue;
            }
            result.put(event, new SmsTemplate(templateId, variables));
        }
        return Map.copyOf(result);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getTemplates() {
        return templates;
    }

    public void setTemplates(String templates) {
        this.templates = templates == null ? "" : templates;
        this.parsed = parse(this.templates);
    }
}
