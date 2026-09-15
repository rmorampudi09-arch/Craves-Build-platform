package in.craves.auth.security;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.Semaphore;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Runs before Spring Security/credential validation. Forwarded headers never select a bucket. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE+20)
public class PostgresAuthAbuseProtectionFilter extends OncePerRequestFilter {
    private static final int MAX_BODY=32768;
    private final AuthRateLimitSettings settings;
    private final PostgresAuthRateLimiter limiter;
    private final Semaphore permits;
    private final AuthRequestReadSettings reads;
    private final ObjectMapper json=new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    public PostgresAuthAbuseProtectionFilter(AuthRateLimitSettings settings,PostgresAuthRateLimiter limiter) {
        this(settings,limiter,new AuthRequestReadSettings(5000,10000));
    }
    @Autowired
    public PostgresAuthAbuseProtectionFilter(AuthRateLimitSettings settings,PostgresAuthRateLimiter limiter,AuthRequestReadSettings reads) {
        this.settings=settings; this.limiter=limiter; this.permits=new Semaphore(settings.maxConcurrent());this.reads=reads;
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !settings.postgresEnabled() || !"POST".equalsIgnoreCase(request.getMethod()) || AuthProtectedOperation.operation(request)==null;
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
        throws ServletException,IOException {
        response.setHeader("Cache-Control","no-store"); response.setHeader("X-Content-Type-Options","nosniff");
        if(!permits.tryAcquire()) { limited(response); return; }
        byte[] body=null;
        try {
            String operation=AuthProtectedOperation.operation(request);
            // Gate before parsing or attacker-controlled credential keys. Only two global keys exist.
            try { if(!limiter.allowGlobal(operation)) { limited(response); return; } }
            catch(RuntimeException unavailable) { unavailable(response); return; }
            if(!boundedHeaders(request)) { error(response,431,"AUTH_REQUEST_TOO_LARGE","Authentication headers are too large"); return; }
            if(request.getHeader("Content-Encoding")!=null && !"identity".equalsIgnoreCase(request.getHeader("Content-Encoding"))) {
                error(response,415,"AUTH_REQUEST_INVALID","JSON authentication request required"); return;
            }
            try {
                MediaType type=MediaType.parseMediaType(request.getContentType()==null?"":request.getContentType());
                if(!"application".equals(type.getType())||!"json".equals(type.getSubtype()) ||
                    (type.getCharset()!=null&&!StandardCharsets.UTF_8.equals(type.getCharset()))) throw new IllegalArgumentException();
            } catch(IllegalArgumentException invalid) { error(response,415,"AUTH_REQUEST_INVALID","JSON authentication request required"); return; }
            if(request.getContentLengthLong()>MAX_BODY) { error(response,413,"AUTH_REQUEST_TOO_LARGE","Authentication request is too large"); return; }
            try { body=readBody(request.getInputStream(),reads.bodyTimeoutMs()*1_000_000L,System::nanoTime); }
            catch(IOException expired) { error(response,408,"AUTH_REQUEST_TIMEOUT","Authentication request timed out");return; }
            if(body.length>MAX_BODY) { error(response,413,"AUTH_REQUEST_TOO_LARGE","Authentication request is too large"); return; }
            String token;
            try {
                JsonNode root=json.readTree(body); JsonNode value=root!=null&&root.isObject()?root.get("exchange".equals(operation)?"firebaseIdToken":"refreshToken"):null;
                if(value==null||!value.isTextual()||value.textValue().isBlank()||value.textValue().length()>20000||
                    value.textValue().chars().anyMatch(c->c<33||c>126)) throw new IllegalArgumentException();
                token=value.textValue();
            } catch(IOException|IllegalArgumentException invalid) { error(response,400,"AUTH_REQUEST_INVALID","Authentication request is invalid"); return; }
            try {
                if(!limiter.allowCredential(operation,token)||("refresh".equals(operation)&&!limiter.allowKnownRefreshIdentity(token))) {
                    limited(response); return;
                }
            } catch(RuntimeException unavailable) { unavailable(response); return; }
            chain.doFilter(new BodyRequest(request,body),response);
        } finally {
            if(body!=null) Arrays.fill(body,(byte)0);
            permits.release();
        }
    }
    static byte[] readBody(InputStream input,long budgetNanos,LongSupplier nanoTime) throws IOException {
        long started=nanoTime.getAsLong();var output=new ByteArrayOutputStream();byte[] chunk=new byte[4096];
        try {
            while(output.size()<=MAX_BODY) {
                if(nanoTime.getAsLong()-started>=budgetNanos) throw new IOException("Auth body read deadline");
                int length=input.read(chunk,0,Math.min(chunk.length,MAX_BODY+1-output.size()));
                if(nanoTime.getAsLong()-started>=budgetNanos) throw new IOException("Auth body read deadline");
                if(length<0) break;
                if(length>0) output.write(chunk,0,length);
                if(output.size()>MAX_BODY) break;
            }
            return output.toByteArray();
        } finally { Arrays.fill(chunk,(byte)0); }
    }
    private static boolean boundedHeaders(HttpServletRequest request) {
        var names=request.getHeaderNames(); int total=0;
        if(names==null) return true;
        while(names.hasMoreElements()) {
            String name=names.nextElement(); if(name.length()>256) return false;
            var values=request.getHeaders(name);
            while(values.hasMoreElements()) {
                String value=values.nextElement(); total+=name.length()+value.length();
                if(value.length()>20000||total>65536) return false;
            }
        }
        return true;
    }
    private void limited(HttpServletResponse response) throws IOException {
        response.setHeader("Retry-After",Integer.toString(limiter.retryAfterSeconds()));
        error(response,429,"AUTH_RATE_LIMITED","Too many authentication attempts. Try again later.");
    }
    private static void unavailable(HttpServletResponse response) throws IOException {
        error(response,503,"AUTH_RATE_LIMIT_UNAVAILABLE","Authentication protection is temporarily unavailable");
    }
    private static void error(HttpServletResponse response,int status,String code,String message) throws IOException {
        response.setStatus(status); response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"code\":\""+code+"\",\"message\":\""+message+"\"}");
    }
    private static class BodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        BodyRequest(HttpServletRequest request,byte[] body) { super(request); this.body=body; }
        @Override public int getContentLength() { return body.length; }
        @Override public long getContentLengthLong() { return body.length; }
        @Override public String getCharacterEncoding() { return StandardCharsets.UTF_8.name(); }
        @Override public ServletInputStream getInputStream() {
            var input=new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public int read(byte[] bytes,int offset,int length) { return input.read(bytes,offset,length); }
                @Override public boolean isFinished() { return input.available()==0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { throw new IllegalStateException("Synchronous Auth endpoint only"); }
            };
        }
        @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8)); }
    }
}
