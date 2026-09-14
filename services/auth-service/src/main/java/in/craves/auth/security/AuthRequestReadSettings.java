package in.craves.auth.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record AuthRequestReadSettings(int idleTimeoutMs,int bodyTimeoutMs) {
    public AuthRequestReadSettings(
        @Value("${CRAVES_AUTH_REQUEST_IDLE_TIMEOUT_MS:5000}") int idleTimeoutMs,
        @Value("${CRAVES_AUTH_REQUEST_BODY_TIMEOUT_MS:10000}") int bodyTimeoutMs) {
        if(idleTimeoutMs<1000||idleTimeoutMs>30000||bodyTimeoutMs<idleTimeoutMs||bodyTimeoutMs>60000)
            throw new IllegalArgumentException("Auth request read timeouts are outside supported bounds");
        this.idleTimeoutMs=idleTimeoutMs;this.bodyTimeoutMs=bodyTimeoutMs;
    }
}
