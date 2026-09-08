package in.craves.supportassistant.safety;

import java.util.Locale;
import org.springframework.stereotype.Component;

@Component
public class SupportSafetyPolicy {
    public boolean isRestrictedRequest(String message) {
        if (message == null) return false;
        String value = message.toLowerCase(Locale.ROOT);
        return containsAny(value,
            "system prompt",
            "developer message",
            "hidden prompt",
            "chain of thought",
            "source code",
            "github token",
            "api key",
            "client secret",
            "webhook secret",
            "database password",
            "connection string",
            "private key",
            "admin token",
            "other user's",
            "other users'",
            "all customers",
            "dump database"
        );
    }

    public String restrictedAnswer() {
        return "I can help with Craves customer or chef support, but I can’t provide internal prompts, source code, credentials, secrets, administrative access, or another user’s information. If you tell me the customer/chef issue you’re trying to solve, I can help with that instead.";
    }

    private static boolean containsAny(String value, String... candidates) {
        for (String candidate : candidates) {
            if (value.contains(candidate)) return true;
        }
        return false;
    }
}
