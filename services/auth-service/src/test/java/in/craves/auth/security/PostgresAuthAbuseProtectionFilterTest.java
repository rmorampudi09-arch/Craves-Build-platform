package in.craves.auth.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PostgresAuthAbuseProtectionFilterTest {
    PostgresAuthRateLimiter limiter;
    PostgresAuthAbuseProtectionFilter filter;
    static AuthRateLimitSettings settings(boolean enabled,String mode,int concurrency) {
        return new AuthRateLimitSettings(enabled,mode,60,concurrency,120,300,10,30);
    }
    @BeforeEach void setup() {
        limiter=mock(PostgresAuthRateLimiter.class);
        when(limiter.allowGlobal(anyString())).thenReturn(true);
        when(limiter.allowCredential(anyString(),anyString())).thenReturn(true);
        when(limiter.allowKnownRefreshIdentity(anyString())).thenReturn(true);
        when(limiter.retryAfterSeconds()).thenReturn(12);
        filter=new PostgresAuthAbuseProtectionFilter(settings(true,"postgres",1),limiter);
    }
    MockHttpServletRequest request(String operation,String body) {
        var request=new MockHttpServletRequest("POST","/api/v1/auth/"+("exchange".equals(operation)?"firebase/exchange":"refresh"));
        request.setContentType("application/json");request.setContent(body.getBytes(StandardCharsets.UTF_8));return request;
    }
    MockHttpServletResponse run(MockHttpServletRequest request) throws Exception {
        var response=new MockHttpServletResponse();filter.doFilter(request,response,(req,res)->res.getWriter().write("forwarded"));return response;
    }
    @Test void globalDenialPrecedesParsingAndNeverCreatesCredentialBucket() throws Exception {
        when(limiter.allowGlobal("exchange")).thenReturn(false);
        var response=run(request("exchange","malformed"));
        assertEquals(429,response.getStatus());assertEquals("12",response.getHeader("Retry-After"));
        verify(limiter,never()).allowCredential(anyString(),anyString());
        assertEquals("no-store",response.getHeader("Cache-Control"));assertFalse(response.getContentAsString().contains("malformed"));
    }
    @Test void exchangeBodyIsPreservedAndGlobalRunsBeforeCredential() throws Exception {
        String body="{\"firebaseIdToken\":\"synthetic-token\",\"adminSession\":true}";
        var response=new MockHttpServletResponse();
        filter.doFilter(request("exchange",body),response,(req,res)->assertEquals(body,new String(req.getInputStream().readAllBytes(),StandardCharsets.UTF_8)));
        var order=inOrder(limiter);order.verify(limiter).allowGlobal("exchange");order.verify(limiter).allowCredential("exchange","synthetic-token");
        verify(limiter,never()).allowKnownRefreshIdentity(anyString());
    }
    @Test void refreshAppliesIdentityLimitOnlyAfterCredentialLimit() throws Exception {
        when(limiter.allowKnownRefreshIdentity("synthetic-refresh")).thenReturn(false);
        var response=run(request("refresh","{\"refreshToken\":\"synthetic-refresh\",\"requestId\":\"synthetic\"}"));
        assertEquals(429,response.getStatus());var order=inOrder(limiter);order.verify(limiter).allowGlobal("refresh");
        order.verify(limiter).allowCredential("refresh","synthetic-refresh");order.verify(limiter).allowKnownRefreshIdentity("synthetic-refresh");
    }
    @Test void credentialDenialDoesNotProbeOwnerOrInvokeController() throws Exception {
        when(limiter.allowCredential(anyString(),anyString())).thenReturn(false);
        assertEquals(429,run(request("refresh","{\"refreshToken\":\"synthetic\"}")).getStatus());
        verify(limiter,never()).allowKnownRefreshIdentity(anyString());
    }
    @Test void globalDatabaseFailureIsPrivateAndFailsClosed() throws Exception {
        when(limiter.allowGlobal(anyString())).thenThrow(new DataAccessResourceFailureException("secret-db-message"));
        var response=run(request("exchange","{\"firebaseIdToken\":\"secret-token\"}"));assertEquals(503,response.getStatus());
        assertFalse(response.getContentAsString().contains("secret"));verify(limiter,never()).allowCredential(anyString(),anyString());
    }
    @Test void credentialDatabaseFailureFailsClosed() throws Exception {
        when(limiter.allowCredential(anyString(),anyString())).thenThrow(new DataAccessResourceFailureException("private"));
        assertEquals(503,run(request("exchange","{\"firebaseIdToken\":\"synthetic\"}")).getStatus());
    }
    @Test void duplicateTrailingAndNonStringTokensAreRejectedBeforeCredentialBuckets() throws Exception {
        for(String body:new String[]{"{\"refreshToken\":\"a\",\"refreshToken\":\"b\"}","{\"refreshToken\":\"a\"} {}","{\"refreshToken\":12}","[]","{\"refreshToken\":\"bad token\"}"})
            assertEquals(400,run(request("refresh",body)).getStatus());
        verify(limiter,never()).allowCredential(anyString(),anyString());
    }
    @Test void ActualBodyLimitWorksWithoutContentLength() throws Exception {
        var request=new MockHttpServletRequest("POST","/api/v1/auth/refresh") {
            @Override public long getContentLengthLong() { return -1; }
            @Override public int getContentLength() { return -1; }
        };
        request.setContentType("application/json");request.setContent(new byte[32769]);
        assertEquals(413,run(request).getStatus());verify(limiter,never()).allowCredential(anyString(),anyString());
    }
    @Test void tokenAndHeadersAreBoundedWithoutSensitiveErrorEcho() throws Exception {
        assertEquals(400,run(request("refresh","{\"refreshToken\":\""+"a".repeat(20001)+"\"}")).getStatus());
        var request=request("refresh","{\"refreshToken\":\"synthetic\"}");request.addHeader("Authorization","a".repeat(20001));
        assertEquals(431,run(request).getStatus());verify(limiter,never()).allowCredential(anyString(),anyString());
    }
    @Test void encodingAndNonJsonContentTypesCannotBypassBounds() throws Exception {
        var compressed=request("refresh","{}");compressed.addHeader("Content-Encoding","gzip");assertEquals(415,run(compressed).getStatus());
        var plain=request("refresh","{}");plain.setContentType("text/plain");assertEquals(415,run(plain).getStatus());
        var latin=request("refresh","{}");latin.setContentType("application/json;charset=ISO-8859-1");assertEquals(415,run(latin).getStatus());
    }
    @Test void spoofedForwardedIpDoesNotSelectAnyBucket() throws Exception {
        var request=request("refresh","{\"refreshToken\":\"synthetic\"}");request.addHeader("X-Forwarded-For","1.2.3.4");request.addHeader("Forwarded","for=9.9.9.9");
        assertEquals("forwarded",run(request).getContentAsString());verify(limiter).allowCredential("refresh","synthetic");
        verify(limiter).allowGlobal("refresh");verify(limiter).allowKnownRefreshIdentity("synthetic");verifyNoMoreInteractions(limiter);
    }
    @Test void concurrencyIsBoundedBeforeDatabaseAndReleasedAfterCompletion() throws Exception {
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        try(var executor=Executors.newSingleThreadExecutor()) {
            var future=executor.submit(()->{try {filter.doFilter(request("refresh","{\"refreshToken\":\"synthetic\"}"),new MockHttpServletResponse(),(req,res)->{
                entered.countDown();try {if(!release.await(5,TimeUnit.SECONDS))throw new java.io.IOException("test timeout");}catch(InterruptedException ex){Thread.currentThread().interrupt();throw new java.io.IOException(ex);}
            });} catch(Exception ex){throw new RuntimeException(ex);}});
            try {assertTrue(entered.await(5,TimeUnit.SECONDS));assertEquals(429,run(request("refresh","{}")).getStatus());verify(limiter,times(1)).allowGlobal("refresh");}
            finally {release.countDown();}
            future.get(5,TimeUnit.SECONDS);
        }
        assertEquals("forwarded",run(request("refresh","{\"refreshToken\":\"synthetic\"}")).getContentAsString());
    }
    @Test void failedControllerAlwaysReleasesConcurrencyPermit() throws Exception {
        assertThrows(java.io.IOException.class,()->filter.doFilter(request("refresh","{\"refreshToken\":\"synthetic\"}"),new MockHttpServletResponse(),(req,res)->{throw new java.io.IOException("synthetic");}));
        assertEquals("forwarded",run(request("refresh","{\"refreshToken\":\"synthetic\"}")).getContentAsString());
    }
    @Test void disabledAndRedisModesLeaveExistingBehaviorIntact() throws Exception {
        for(var settings:new AuthRateLimitSettings[]{settings(false,"postgres",1),settings(true,"redis",1)}) {
            filter=new PostgresAuthAbuseProtectionFilter(settings,limiter);assertEquals("forwarded",run(request("refresh","malformed")).getContentAsString());
        }
        verifyNoInteractions(limiter);
        var redis=new RedisAuthAbuseProtectionFilter(null,true,0,0,60,false,"craves:auth:rate","postgres");assertDoesNotThrow(redis::validate);
    }
    @Test void unprotectedRoutesAndMethodsDoNotTouchLimiter() throws Exception {
        var get=request("refresh","{}");get.setMethod("GET");assertEquals("forwarded",run(get).getContentAsString());
        var logout=request("refresh","{}");logout.setRequestURI("/api/v1/auth/logout");assertEquals("forwarded",run(logout).getContentAsString());verifyNoInteractions(limiter);
    }
    @Test void invalidModesAndUnboundedCapacityFailConfiguration() {
        assertThrows(IllegalArgumentException.class,()->settings(true,"unknown",1));
        assertThrows(IllegalArgumentException.class,()->settings(true,"postgres",0));
        assertThrows(IllegalArgumentException.class,()->new AuthRateLimitSettings(true,"postgres",0,1,120,300,10,30));
    }
    @Test void encodedRawPathStillProtectsTheServletDecodedEndpoint() throws Exception {
        when(limiter.allowGlobal("refresh")).thenReturn(false);
        var request=request("refresh","{\"refreshToken\":\"synthetic\"}");
        request.setRequestURI("/api/v1/auth/re%66resh");request.setServletPath("/api/v1/auth/refresh");
        assertEquals(429,run(request).getStatus());verify(limiter).allowGlobal("refresh");
    }
    @Test void drippingBodyCannotExtendAbsoluteBudget() {
        var nanos=new java.util.concurrent.atomic.AtomicLong();
        var drip=new java.io.InputStream() {
            public int read(){nanos.addAndGet(4_000_000_000L);return 65;}
            public int read(byte[] bytes,int offset,int length){bytes[offset]=65;read();return 1;}
        };
        assertThrows(java.io.IOException.class,()->PostgresAuthAbuseProtectionFilter.readBody(drip,10_000_000_000L,nanos::get));
        assertEquals(12_000_000_000L,nanos.get());
    }
    @Test void readTimeoutReturnsRetryableErrorAndReleasesPermit() throws Exception {
        var request=new MockHttpServletRequest("POST","/api/v1/auth/refresh") {
            @Override public jakarta.servlet.ServletInputStream getInputStream() {
                return new jakarta.servlet.ServletInputStream() {
                    public int read() throws java.io.IOException {throw new java.net.SocketTimeoutException("private network detail");}
                    public boolean isFinished(){return false;}public boolean isReady(){return true;}
                    public void setReadListener(jakarta.servlet.ReadListener listener){}
                };
            }
        };
        request.setContentType("application/json");
        var response=run(request);assertEquals(408,response.getStatus());assertFalse(response.getContentAsString().contains("private"));
        assertEquals("forwarded",run(request("refresh","{\"refreshToken\":\"synthetic\"}")).getContentAsString());
    }

}
