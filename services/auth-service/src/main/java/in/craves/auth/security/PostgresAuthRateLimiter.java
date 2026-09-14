package in.craves.auth.security;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class PostgresAuthRateLimiter {
    private final JdbcTemplate jdbc;
    private final AuthRateLimitSettings settings;
    private final Clock clock;
    private final TokenHasher hasher=new TokenHasher();
    @Autowired
    public PostgresAuthRateLimiter(JdbcTemplate jdbc, AuthRateLimitSettings settings) { this(jdbc,settings,Clock.systemUTC()); }
    public PostgresAuthRateLimiter(JdbcTemplate jdbc, AuthRateLimitSettings settings, Clock clock) {
        // Share the existing pool, but do not change other callers' query timeouts.
        this.jdbc=new JdbcTemplate(java.util.Objects.requireNonNull(jdbc.getDataSource()));
        this.jdbc.setQueryTimeout(3);
        this.settings=settings; this.clock=clock;
    }
    public boolean allowGlobal(String operation) {
        checkOperation(operation);
        int limit="exchange".equals(operation)?settings.globalExchangeLimit():settings.globalRefreshLimit();
        long count=increment("global:"+operation,limit);
        if(count>limit) return false;
        // Bounded indexed cleanup. Repeated admitted batches prevent attacker-controlled cardinality growth.
        if((count-1)%50==0) jdbc.update("DELETE FROM auth_rate_limit_counter WHERE (bucket_key,window_start) IN " +
            "(SELECT bucket_key,window_start FROM auth_rate_limit_counter WHERE expires_at<=? ORDER BY expires_at LIMIT 500)",Timestamp.from(clock.instant()));
        return true;
    }
    public boolean allowCredential(String operation,String rawToken) {
        checkOperation(operation);
        return increment("credential:"+operation+":"+hasher.sha256Base64Url(rawToken),settings.credentialLimit())<=settings.credentialLimit();
    }
    public boolean allowKnownRefreshIdentity(String rawToken) {
        // This is an indexed cost-control lookup, never authentication or a token-validity decision.
        var owners=jdbc.query("SELECT identity_id FROM refresh_session WHERE refresh_token_hash=? AND revoked_at IS NULL AND expires_at>?",
            (rs,row)->rs.getObject(1,UUID.class),hasher.sha256Base64Url(rawToken),Timestamp.from(clock.instant()));
        if(owners.isEmpty()) return true;
        return increment("identity:refresh:"+hasher.sha256Base64Url(owners.getFirst().toString()),settings.identityRefreshLimit())<=settings.identityRefreshLimit();
    }
    public int retryAfterSeconds() { return settings.windowSeconds()-(int)Math.floorMod(clock.instant().getEpochSecond(),settings.windowSeconds()); }
    private long increment(String key,int limit) {
        Instant now=clock.instant(); long window=Math.floorDiv(now.getEpochSecond(),settings.windowSeconds())*settings.windowSeconds();
        Long count=jdbc.queryForObject("INSERT INTO auth_rate_limit_counter(bucket_key,window_start,expires_at,request_count) VALUES(?,?,?,1) " +
            "ON CONFLICT(bucket_key,window_start) DO UPDATE SET request_count=LEAST(auth_rate_limit_counter.request_count+1,?) RETURNING request_count",
            Long.class,key,Timestamp.from(Instant.ofEpochSecond(window)),Timestamp.from(Instant.ofEpochSecond(window+2L*settings.windowSeconds())),(long)limit+1);
        if(count==null) throw new IllegalStateException("Auth rate-limit counter unavailable");
        return count;
    }
    private static void checkOperation(String operation) {
        if(!"exchange".equals(operation)&&!"refresh".equals(operation)) throw new IllegalArgumentException("Unknown Auth operation");
    }
}
