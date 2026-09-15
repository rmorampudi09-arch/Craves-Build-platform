package in.craves.referral.security;

import in.craves.referral.ReferralProblem;
import in.craves.referral.ReferralSettings;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.Collections;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import static in.craves.referral.ReferralProblem.require;

public final class SourceAuthenticationFilter extends OncePerRequestFilter {
    public static final String BODY_ATTRIBUTE=SourceAuthenticationFilter.class.getName()+".rawBody";
    public static final int MAX_BODY_BYTES=131072;
    private final ReferralSettings settings;
    private final Clock clock;
    public SourceAuthenticationFilter(ReferralSettings settings,Clock clock) { this.settings=settings; this.clock=clock; }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws IOException,ServletException {
        try {
            require("POST".equals(request.getMethod()) && request.getQueryString()==null,405,"SIGNED_POST_REQUIRED");
            String path=request.getRequestURI();
            require(List.of("/internal/v1/referrals/events","/internal/v1/referrals/operations","/internal/v1/referrals/outbox/claim","/internal/v1/referrals/outbox/ack","/internal/v1/referrals/lookup").contains(path),404,"SOURCE_ROUTE_NOT_FOUND");
            require(request.getContentType()!=null && request.getContentType().matches("(?i)application/json(?:;\\s*charset=utf-8)?"),415,"JSON_REQUIRED");
            require(request.getHeader("Authorization")==null,401,"SOURCE_AUTHORIZATION_SCHEME_CONFLICT");
            String source=single(request,"X-Referral-Source"), keyId=single(request,"X-Referral-Key-Id");
            String timestamp=single(request,"X-Referral-Timestamp"), signature=single(request,"X-Referral-Signature");
            require(request.getContentLengthLong()<=MAX_BODY_BYTES,413,"SOURCE_BODY_TOO_LARGE");
            byte[] body=request.getInputStream().readNBytes(MAX_BODY_BYTES+1);
            require(body.length<=MAX_BODY_BYTES,413,"SOURCE_BODY_TOO_LARGE");
            SourceSignatures.verify(settings.key(source,keyId),source,keyId,timestamp,request.getMethod(),path,body,signature,clock);
            var context=SecurityContextHolder.createEmptyContext();
            context.setAuthentication(new UsernamePasswordAuthenticationToken(source,null,List.of(new SimpleGrantedAuthority("SOURCE_"+source))));
            SecurityContextHolder.setContext(context); request.setAttribute(BODY_ATTRIBUTE,body);
            chain.doFilter(request,response);
        } catch(ReferralProblem ex) { error(response,ex.status(),ex.getMessage()); }
        finally { SecurityContextHolder.clearContext(); }
    }
    private static String single(HttpServletRequest request,String header) {
        List<String> values=Collections.list(request.getHeaders(header));
        require(values.size()==1 && !values.getFirst().contains(","),401,"INVALID_SOURCE_HEADERS");
        return values.getFirst();
    }
    public static void error(HttpServletResponse response,int status,String code) throws IOException {
        if(response.isCommitted()) return;
        response.setStatus(status); response.setHeader("Cache-Control","private, no-store, max-age=0");
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\""+code+"\"}");
    }
}
