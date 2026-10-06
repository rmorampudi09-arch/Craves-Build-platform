package in.craves.auth.email;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import in.craves.auth.security.CurrentUser;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Temporary delivery bypass for exactly three email/phone pairs. Never grants roles. */
@Component
public final class EmailVerificationTestBypass {
    private static final Logger log = LoggerFactory.getLogger(EmailVerificationTestBypass.class);
    private final boolean enabled;
    private final boolean phoneTestEnabled;
    private final Map<String, String> pairs;
    private final Map<String, String> phoneLabels;
    private final String code;
    private final Instant expiresAt;
    private final Clock clock;

    @Autowired
    public EmailVerificationTestBypass(
        @Value("${CRAVES_EMAIL_TEST_ENABLED:false}") boolean enabled,
        @Value("${CRAVES_EMAIL_TEST_WHITELIST_JSON:}") String pairsJson,
        @Value("${CRAVES_OTP_TEST_ENABLED:false}") boolean phoneTestEnabled,
        @Value("${CRAVES_OTP_TEST_WHITELIST_JSON:}") String phoneJson,
        @Value("${CRAVES_OTP_TEST_CODE:}") String code,
        @Value("${CRAVES_OTP_TEST_EXPIRES_AT:}") String expiresAt,
        Clock clock) {
        this.enabled = enabled;
        this.phoneTestEnabled = phoneTestEnabled;
        this.clock = clock;
        try {
            var mapper = new ObjectMapper();
            Map<String, String> parsed = pairsJson.isBlank() ? Map.of()
                : mapper.readValue(pairsJson, new TypeReference<Map<String, String>>() {});
            Map<String, String> labels = parsed.isEmpty() ? Map.of()
                : mapper.readValue(phoneJson, new TypeReference<Map<String, String>>() {});
            if (parsed.size() > 3 || parsed.entrySet().stream().anyMatch(entry ->
                entry.getKey() == null || !entry.getKey().equals(EmailVerificationCrypto.normalizeEmail(entry.getKey()).toLowerCase(Locale.ROOT)) ||
                entry.getValue() == null || !entry.getValue().matches("\\+91[6-9][0-9]{9}") ||
                !labels.containsKey(entry.getValue()) ||
                !labels.get(entry.getValue()).matches("CHEF-E2E-[0-9]{3}")) ||
                parsed.values().stream().distinct().count() != parsed.size()) {
                throw new IllegalArgumentException();
            }
            this.expiresAt = expiresAt.isBlank() ? Instant.EPOCH : Instant.parse(expiresAt);
            if (enabled && (parsed.size() != 3 || labels.size() != 210 ||
                !code.matches("[0-9]{6}") ||
                this.expiresAt.isAfter(clock.instant().plus(Duration.ofHours(24))))) {
                throw new IllegalArgumentException();
            }
            this.pairs = Map.copyOf(parsed);
            this.phoneLabels = Map.copyOf(labels);
            this.code = code;
        } catch (Exception invalid) {
            throw new IllegalArgumentException("Invalid temporary email test configuration");
        }
    }

    static EmailVerificationTestBypass disabled(Clock clock) {
        return new EmailVerificationTestBypass(false, "", false, "", "", "", clock);
    }

    boolean configured(String email) {
        return email != null && pairs.containsKey(email.toLowerCase(Locale.ROOT));
    }

    String codeFor(CurrentUser user, String email) {
        if (!configured(email)) return null;
        String phone = pairs.get(email.toLowerCase(Locale.ROOT));
        if (!enabled || !phoneTestEnabled || user == null ||
            !phone.equals(user.phoneNumber()) || !clock.instant().isBefore(expiresAt)) {
            throw AuthException.badRequest("EMAIL_TEST_NOT_AVAILABLE",
                "This temporary test email cannot be verified by this account right now.");
        }
        return code;
    }

    void audit(String operation, CurrentUser user, String email) {
        if (configured(email)) {
            log.info("Temporary email test operation={} testId={}", operation,
                phoneLabels.get(user.phoneNumber()));
        }
    }
}
