package in.craves.auth.msg91;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Account authkey is server-only; it must be bound to an Azure secret. */
@Component
public record Msg91Properties(boolean enabled, String authkey) {
    public Msg91Properties(@Value("${CRAVES_MSG91_ENABLED:false}") boolean enabled,
                           @Value("${MSG91_AUTHKEY:}") String authkey) {
        if (enabled && (authkey == null || authkey.isBlank()))
            throw new IllegalStateException("MSG91_AUTHKEY is required when MSG91 is enabled");
        this.enabled = enabled;
        this.authkey = authkey;
    }
    @Override public String toString() { return "Msg91Properties[enabled=" + enabled + "]"; }
}
