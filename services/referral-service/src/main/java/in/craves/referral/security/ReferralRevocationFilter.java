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

/** Uses one explicitly selected Auth verification contract; neither mode falls back on failure. */
public final class ReferralRevocationFilter extends OncePerRequestFilter {
    private final ReferralSettings settings;
    private final StringRedisTemplate redis;
    private final boolean publicAccessEnabled;
    private final boolean absenceContractConfirmed;
    private final ReferralAuthStateClient authState;
    public ReferralRevocationFilter(ReferralSettings settings,StringRedisTemplate redis,boolean publicAccessEnabled) {
        this(settings,redis,publicAccessEnabled,false);
    }
    public ReferralRevocationFilter(ReferralSettings settings,StringRedisTemplate redis,boolean publicAccessEnabled,boolean absenceContractConfirmed) {
        this(settings,redis,publicAccessEnabled,absenceContractConfirmed,null);
    }
    public ReferralRevocationFilter(ReferralSettings settings,StringRedisTemplate redis,boolean publicAccessEnabled,boolean absenceContractConfirmed,ReferralAuthStateClient authState) {
        this.settings=settings; this.redis=redis; this.publicAccessEnabled=publicAccessEnabled;
        this.absenceContractConfirmed=absenceContractConfirmed;
        this.authState=authState;
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) { return !request.getRequestURI().startsWith("/api/v1/referrals/"); }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws IOException,ServletException {
        try {
            settings.requireEnabled();
            require(publicAccessEnabled,503,"REFERRAL_PUBLIC_ACCESS_DISABLED");
            var authentication=SecurityContextHolder.getContext().getAuthentication();
            require(authentication!=null && authentication.getPrincipal() instanceof Jwt,401,"AUTHENTICATION_REQUIRED");
            Jwt jwt=(Jwt)authentication.getPrincipal();
            if(authState!=null) {
                var verified=authState.verify(jwt);
                var retained=authentication.getAuthorities().stream().filter(a->verified.contains(a.getAuthority())).toList();
                SecurityContextHolder.getContext().setAuthentication(new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(jwt,retained,jwt.getSubject()));
                chain.doFilter(request,response);
                return;
            }
            require(!request.getRequestURI().startsWith("/api/v1/referrals/admin/"),503,"AUTH_SESSION_VERIFICATION_REQUIRED");
            UUID id=UUID.fromString(jwt.getSubject());
            String projection;
            try { projection=redis.opsForValue().get("craves:auth:revocation:"+id); }
            catch(RuntimeException ex) { throw new ReferralProblem(503,"REVOCATION_VERIFICATION_UNAVAILABLE"); }
            verifyProjection(projection,((Number)jwt.getClaims().get("token_version")).longValue(),absenceContractConfirmed);
            chain.doFilter(request,response);
        } catch(ReferralProblem ex) { SourceAuthenticationFilter.error(response,ex.status(),ex.getMessage()); }
    }
    public static void verifyProjection(String projection,long version) { verifyProjection(projection,version,false); }
    public static void verifyProjection(String projection,long version,boolean absenceContractConfirmed) {
        require(version>=0,401,"INVALID_TOKEN_VERSION");
        if(projection==null) {
            // An empty/wrong Redis namespace must not silently count as verified account state.
            // Opt in only after validating Auth's publisher, token lifetime, TTL and recovery.
            require(absenceContractConfirmed,503,"REVOCATION_ABSENCE_CONTRACT_UNCONFIRMED");
            return;
        }
        String[] parts=projection.split("\\|",-1);
        require(parts.length==2 && parts[1].matches("[0-9]{1,18}")
            && (parts[0].equals("ACTIVE") || parts[0].equals("SUSPENDED")),503,"INVALID_REVOCATION_PROJECTION");
        require(parts[0].equals("ACTIVE") && version>=Long.parseLong(parts[1]),401,"ACCESS_TOKEN_REVOKED");
    }
}
