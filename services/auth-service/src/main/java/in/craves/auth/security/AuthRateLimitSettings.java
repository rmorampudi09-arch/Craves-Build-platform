package in.craves.auth.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Engineering capacity guards; defaults are not a claim of tested production throughput. */
@Component
public record AuthRateLimitSettings(boolean enabled, String mode, int windowSeconds, int maxConcurrent,
    int globalExchangeLimit, int globalRefreshLimit, int credentialLimit, int identityRefreshLimit) {
    public AuthRateLimitSettings(
        @Value("${CRAVES_AUTH_RATE_LIMIT_ENABLED:false}") boolean enabled,
        @Value("${CRAVES_AUTH_RATE_LIMIT_MODE:redis}") String mode,
        @Value("${CRAVES_AUTH_RATE_LIMIT_WINDOW_SECONDS:60}") int windowSeconds,
        @Value("${CRAVES_AUTH_RATE_LIMIT_MAX_CONCURRENT:6}") int maxConcurrent,
        @Value("${CRAVES_AUTH_RATE_LIMIT_GLOBAL_EXCHANGE_LIMIT:120}") int globalExchangeLimit,
        @Value("${CRAVES_AUTH_RATE_LIMIT_GLOBAL_REFRESH_LIMIT:300}") int globalRefreshLimit,
        @Value("${CRAVES_AUTH_RATE_LIMIT_CREDENTIAL_LIMIT:10}") int credentialLimit,
        @Value("${CRAVES_AUTH_RATE_LIMIT_IDENTITY_REFRESH_LIMIT:30}") int identityRefreshLimit) {
        if (!"redis".equals(mode) && !"postgres".equals(mode)) throw new IllegalArgumentException("Unknown Auth rate-limit mode");
        if (windowSeconds < 1 || windowSeconds > 3600 || maxConcurrent < 1 || maxConcurrent > 32 ||
            globalExchangeLimit < 1 || globalExchangeLimit > 10000 || globalRefreshLimit < 1 || globalRefreshLimit > 10000 ||
            credentialLimit < 1 || credentialLimit > 1000 || identityRefreshLimit < 1 || identityRefreshLimit > 1000)
            throw new IllegalArgumentException("Auth rate-limit capacity guards are outside the supported range");
        this.enabled=enabled; this.mode=mode; this.windowSeconds=windowSeconds; this.maxConcurrent=maxConcurrent;
        this.globalExchangeLimit=globalExchangeLimit; this.globalRefreshLimit=globalRefreshLimit;
        this.credentialLimit=credentialLimit; this.identityRefreshLimit=identityRefreshLimit;
    }
    public boolean postgresEnabled() { return enabled && "postgres".equals(mode); }
}
