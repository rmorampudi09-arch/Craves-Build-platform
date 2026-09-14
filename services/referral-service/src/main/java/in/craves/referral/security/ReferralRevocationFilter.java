package in.craves.referral.security;

import in.craves.referral.ReferralProblem;
import in.craves.referral.ReferralSettings;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;
import static in.craves.referral.ReferralProblem.require;

/** Uses the existing Craves Auth revocation projection. Redis errors fail closed; no new Auth writes. */
public final class ReferralRevocationFilter extends OncePerRequestFilter {
    private final ReferralSettings settings;
    private final StringRedisTemplate redis;
    private final boolean publicAccessEnabled;
    public ReferralRevocationFilter(ReferralSettings settings,StringRedisTemplate redis,boolean publicAccessEnabled) {
        this.settings=settings; this.redis=redis; this.publicAccessEnabled=publicAccessEnabled;
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) { return !request.getRequestURI().startsWith("/api/v1/referrals/"); }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws IOException,ServletException {
        try {
            settings.requireEnabled();
            require(publicAccessEnabled,503,"REFERRAL_PUBLIC_ACCESS_DISABLED");
            var authentication=SecurityContextHolder.getContext().getAuthentication();
            require(authentication!=null && authentication.getPrincipal() instanceof Jwt,401,"AUTHENTICATION_REQUIRED");
            Jwt jwt=(Jwt)authentication.getPrincipal();
            UUID id=UUID.fromString(jwt.getSubject());
            String projection;
            try { projection=redis.opsForValue().get("craves:auth:revocation:"+id); }
            catch(RuntimeException ex) { throw new ReferralProblem(503,"REVOCATION_VERIFICATION_UNAVAILABLE"); }
            verifyProjection(projection,((Number)jwt.getClaims().get("token_version")).longValue());
            chain.doFilter(request,response);
        } catch(ReferralProblem ex) { SourceAuthenticationFilter.error(response,ex.status(),ex.getMessage()); }
    }
    public static void verifyProjection(String projection,long version) {
        if(projection==null) return; // Auth TTL contract: absent means no current revocation.
        String[] parts=projection.split("\\|",-1);
        require(parts.length==2 && parts[1].matches("[0-9]{1,18}")
            && (parts[0].equals("ACTIVE") || parts[0].equals("SUSPENDED")),503,"INVALID_REVOCATION_PROJECTION");
        require(parts[0].equals("ACTIVE") && version>=Long.parseLong(parts[1]),401,"ACCESS_TOKEN_REVOKED");
    }
}
