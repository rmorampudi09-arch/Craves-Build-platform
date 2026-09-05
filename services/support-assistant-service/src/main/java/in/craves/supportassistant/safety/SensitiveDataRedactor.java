package in.craves.supportassistant.safety;

import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class SensitiveDataRedactor {
    private static final Pattern BEARER = Pattern.compile("(?i)bearer\\s+[A-Za-z0-9._~+\\-/]+=*");
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile(
        "(?i)(api[_ -]?key|secret|password|passwd|cvv|token)\\s*[:=]\\s*[^\\s,;]+"
    );
    private static final Pattern OTP = Pattern.compile("(?i)(otp|verification code)\\s*[:=-]?\\s*\\d{4,8}");
    private static final Pattern CARD = Pattern.compile("(?<!\\d)(?:\\d[ -]?){13,19}(?!\\d)");
    private static final Pattern EMAIL = Pattern.compile("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}");
    private static final Pattern INDIAN_PHONE = Pattern.compile("(?<!\\d)(?:\\+?91[- ]?)?[6-9]\\d{9}(?!\\d)");
    private static final Pattern PRIVATE_KEY = Pattern.compile("(?is)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----");
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cntrl}&&[^\\r\\n\\t]]");

    public String redactForModel(String value) {
        if (value == null) {
            return "";
        }
        String redacted = CONTROL.matcher(value).replaceAll(" ");
        redacted = PRIVATE_KEY.matcher(redacted).replaceAll("[REDACTED_PRIVATE_KEY]");
        redacted = BEARER.matcher(redacted).replaceAll("[REDACTED_TOKEN]");
        redacted = SECRET_ASSIGNMENT.matcher(redacted).replaceAll("[REDACTED_SECRET]");
        redacted = OTP.matcher(redacted).replaceAll("[REDACTED_OTP]");
        redacted = CARD.matcher(redacted).replaceAll("[REDACTED_PAYMENT_DATA]");
        redacted = EMAIL.matcher(redacted).replaceAll("[REDACTED_EMAIL]");
        redacted = INDIAN_PHONE.matcher(redacted).replaceAll("[REDACTED_PHONE]");
        return redacted.trim();
    }

    public String sanitizeModelOutput(String value) {
        if (value == null) {
            return "";
        }
        return redactForModel(value)
            .replaceAll("(?i)(/[^\\s]+/src/(main|test)/[^\\s]+)", "[INTERNAL_PATH_REDACTED]")
            .replaceAll("(?i)(jdbc:[^\\s]+)", "[INTERNAL_CONNECTION_REDACTED]")
            .trim();
    }
}
