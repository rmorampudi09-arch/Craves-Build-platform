package in.craves.userchef.supportchat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.AdminDirectoryService;
import in.craves.userchef.service.SupportCaseService;
import in.craves.userchef.supportchat.SupportChatController.SupportCaseRef;
import in.craves.userchef.web.SupportCaseDtos.CreateSupportCaseRequest;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * What the voice support line (voice-support-gateway) needs for a phone call: who is calling, judged by the caller's
 * number, their latest orders, and a support ticket when the agent cannot settle the matter on the call.
 * Only the caller's own data is returned, and only the allowlisted order fields the chat assistant also sees.
 */
@Service
public class VoiceSupportService {
    static final int RECENT_ORDERS = 5;
    static final String TICKET_PREFIX = "[Opened by Craves voice assistant from a phone call]\n";
    // Per caller and for all callers together, per replica: a phone line is public, so ticket spam must stay bounded.
    static final int TICKETS_PER_PHONE_PER_MINUTE = 2;
    static final int TICKETS_PER_PHONE_PER_DAY = 3;
    static final int TICKETS_PER_MINUTE = 10;
    static final int TICKETS_PER_DAY = 200;
    static final UUID ALL_CALLERS = UUID.nameUUIDFromBytes("voice-ticket:all".getBytes(StandardCharsets.UTF_8));

    private final JdbcTemplate jdbc;
    private final SupportOrderClient orders;
    private final SupportCaseService supportCases;
    private final SupportChatLimiter limiter;
    private final AuthInternalClientProperties internal;
    private final ObjectMapper objectMapper;

    public VoiceSupportService(
        JdbcTemplate jdbc,
        SupportOrderClient orders,
        SupportCaseService supportCases,
        SupportChatLimiter limiter,
        AuthInternalClientProperties internal,
        ObjectMapper objectMapper
    ) {
        this.jdbc = jdbc;
        this.orders = orders;
        this.supportCases = supportCases;
        this.limiter = limiter;
        this.internal = internal;
        this.objectMapper = objectMapper;
    }

    /**
     * The account behind a phone number: an approved chef first, then a customer, then a chef applicant.
     * {@code applicationStatus} (PENDING, APPROVED, REJECTED) and {@code reviewStatus} (DRAFT, PENDING, UNDER_REVIEW,
     * MORE_INFORMATION_REQUIRED) are set for chefs only.
     */
    public record Caller(UUID identityId, String role, String firstName, String applicationStatus, String reviewStatus) {
    }

    /** {@code caller} is null when no account uses the number; {@code orders} is then empty. */
    public record CallerContext(Caller caller, ArrayNode orders) {
    }

    public CallerContext context(String phone) {
        String normalized = normalizePhone(phone);
        if (normalized == null) {
            return new CallerContext(null, objectMapper.createArrayNode());
        }
        Caller caller = lookup(normalized);
        if (caller == null) {
            return new CallerContext(null, objectMapper.createArrayNode());
        }
        boolean chef = "CHEF".equals(caller.role());
        ArrayNode recent;
        if (chef && !"APPROVED".equals(caller.applicationStatus())) {
            recent = objectMapper.createArrayNode(); // An applicant has no kitchen orders yet.
        } else {
            try {
                recent = orders.recentOrdersForPhoneCall(internal.getServiceSecret(), caller.identityId(), chef, RECENT_ORDERS);
            } catch (ApiException exception) {
                recent = objectMapper.createArrayNode(); // The agent can still help; it says order lookups are down.
            }
        }
        return new CallerContext(caller, recent);
    }

    /**
     * Opens a ticket for the caller. A known account gets a normal ticket (visible in their app notifications);
     * an unknown number gets a guest ticket carrying the number, like a website callback request.
     */
    public SupportCaseRef openTicket(String phone, String subject, String details, String callerName, String language) {
        String normalized = normalizePhone(phone);
        if (normalized == null) {
            throw ApiException.badRequest("VOICE_PHONE_INVALID", "phone must be a 10-digit Indian mobile number");
        }
        String cleanSubject = clip(SupportAssistant.mask(subject), 120);
        String cleanDetails = clip(SupportAssistant.mask(details), 1500);
        if (cleanSubject.isEmpty() || cleanDetails.isEmpty()) {
            throw ApiException.badRequest("VOICE_TICKET_INVALID", "subject and details are required");
        }
        limiter.admit(UUID.nameUUIDFromBytes(("voice-ticket:" + normalized).getBytes(StandardCharsets.UTF_8)),
            TICKETS_PER_PHONE_PER_MINUTE, TICKETS_PER_PHONE_PER_DAY);
        limiter.admit(ALL_CALLERS, TICKETS_PER_MINUTE, TICKETS_PER_DAY);

        String name = callerName == null || callerName.isBlank() ? "" : clip(SupportAssistant.mask(callerName), 80);
        String message = TICKET_PREFIX
            + "Caller's number: " + normalized + "\n"
            + (name.isEmpty() ? "" : "Name given on the call: " + name + "\n")
            + (language == null || language.isBlank() ? "" : "Language of the call: " + clip(language, 40) + "\n")
            + "\n" + cleanDetails;
        Caller caller = lookup(normalized);
        if (caller == null) {
            var created = supportCases.createGuest("Call: " + cleanSubject, message);
            return new SupportCaseRef(created.id(), created.caseNumber());
        }
        CurrentUser user = new CurrentUser(caller.identityId(), null, normalized, List.of(caller.role()));
        var created = supportCases.create(user,
            new CreateSupportCaseRequest(caller.role(), null, "Call: " + cleanSubject, message));
        return new SupportCaseRef(created.supportCase().id(), created.supportCase().caseNumber());
    }

    private Caller lookup(String phone) {
        List<String> variants = AdminDirectoryService.phoneVariants(phone);
        List<Map<String, Object>> chefs = jdbc.queryForList(
            "SELECT a.identity_id, a.first_name, a.status, d.review_status FROM chef_application a "
                + "LEFT JOIN chef_onboarding_draft d ON d.application_id = a.id "
                + "WHERE a.phone_number IN (?, ?, ?) LIMIT 1",
            variants.get(0), variants.get(1), variants.get(2));
        List<Map<String, Object>> customers = jdbc.queryForList(
            "SELECT identity_id, first_name FROM customer_profile WHERE registered_phone_number IN (?, ?, ?) LIMIT 1",
            variants.get(0), variants.get(1), variants.get(2));
        if (!chefs.isEmpty() && (customers.isEmpty() || "APPROVED".equals(String.valueOf(chefs.get(0).get("status"))))) {
            Map<String, Object> chef = chefs.get(0);
            return new Caller(uuid(chef.get("identity_id")), "CHEF", text(chef.get("first_name")), text(chef.get("status")),
                text(chef.get("review_status")));
        }
        if (!customers.isEmpty()) {
            Map<String, Object> customer = customers.get(0);
            return new Caller(uuid(customer.get("identity_id")), "CUSTOMER", text(customer.get("first_name")), null, null);
        }
        return null;
    }

    /** Accepts 10 digits, with or without +91, 91 or a leading 0 (Exotel sends 0XXXXXXXXXX), as 10 digits. */
    static String normalizePhone(String value) {
        if (value == null) {
            return null;
        }
        String digits = value.replaceAll("[^0-9]", "");
        if (digits.length() == 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        } else if (digits.length() == 11 && digits.startsWith("0")) {
            digits = digits.substring(1);
        }
        return digits.matches("[6-9]\\d{9}") ? digits : null;
    }

    private static UUID uuid(Object value) {
        return value instanceof UUID id ? id : UUID.fromString(String.valueOf(value));
    }

    private static String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String clip(String value, int max) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
