package in.craves.auth.centralotp;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Temporary phone verification only. Roles and sessions remain owned by existing services. */
@Component
public final class CentralOtpTestBypass {
    private static final Logger log = LoggerFactory.getLogger(CentralOtpTestBypass.class);
    private final Map<String, String> whitelist;
    private final boolean enabled;
    private final byte[] code;
    private final Instant expiresAt;
    private final Clock clock;
    private final String environment;

    @Autowired
    public CentralOtpTestBypass(
            @Value("${CRAVES_OTP_TEST_ENABLED:false}") boolean enabled,
            @Value("${CRAVES_OTP_TEST_WHITELIST_JSON:}") String whitelistJson,
            @Value("${CRAVES_OTP_TEST_CODE:}") String code,
            @Value("${CRAVES_OTP_TEST_EXPIRES_AT:}") String expiresAt,
            @Value("${CRAVES_ENVIRONMENT:unknown}") String environment) {
        this(enabled, whitelistJson, code, expiresAt, environment, Clock.systemUTC());
    }

    CentralOtpTestBypass(boolean enabled, String whitelistJson, String code,
                         String expiresAt, String environment, Clock clock) {
        this.clock = clock;
        this.enabled = enabled;
        this.environment = environment.matches("[A-Za-z0-9_-]{1,40}") ? environment : "unknown";
        try {
            Map<String, String> parsed = whitelistJson.isBlank() ? Map.of()
                    : new ObjectMapper().readValue(whitelistJson, new TypeReference<Map<String, String>>() {});
            if (parsed.size() > 210 || parsed.entrySet().stream().anyMatch(entry ->
                    !entry.getKey().matches("\\+91[6-9][0-9]{9}") || entry.getValue() == null ||
                    !entry.getValue().matches("(?:CUST|CHEF|ADMIN)-E2E-[0-9]{3}"))) {
                throw new IllegalArgumentException();
            }
            this.whitelist = Map.copyOf(parsed);
            this.expiresAt = expiresAt.isBlank() ? Instant.EPOCH : Instant.parse(expiresAt);
            if (enabled && (parsed.size() != 210 || !code.matches("[0-9]{6}") ||
                    this.expiresAt.isAfter(clock.instant().plus(Duration.ofHours(24))))) {
                throw new IllegalArgumentException();
            }
            this.code = code.getBytes(StandardCharsets.UTF_8);
        } catch (Exception invalid) {
            // Do not include configuration values or parser messages in exceptions/logs.
            throw new IllegalArgumentException("Invalid temporary OTP test configuration");
        }
    }

    static CentralOtpTestBypass disabled() {
        return new CentralOtpTestBypass(false, "", "", "", "unknown", Clock.systemUTC());
    }

    boolean contains(String phone) {
        return phone != null && whitelist.containsKey(phone);
    }

    void send(String phone) {
        requireActive(phone);
        audit("send", phone);
    }

    void verify(String phone, String submittedCode) {
        requireActive(phone);
        if (submittedCode == null || !MessageDigest.isEqual(code, submittedCode.getBytes(StandardCharsets.UTF_8))) {
            throw AuthException.badRequest("OTP_INVALID", "The code is incorrect. Please try again.");
        }
        audit("verify", phone);
    }

    private void requireActive(String phone) {
        // Keep configured synthetic numbers out of MSG91 even after expiry or explicit disablement.
        if (!contains(phone) || !enabled || !clock.instant().isBefore(expiresAt)) {
            throw CentralOtpProvider.unavailable();
        }
    }

    private void audit(String operation, String phone) {
        log.info("Temporary OTP test operation={} testId={} phoneSuffix={} environment={}",
                operation, whitelist.get(phone), phone.substring(phone.length() - 4), environment);
    }
}
