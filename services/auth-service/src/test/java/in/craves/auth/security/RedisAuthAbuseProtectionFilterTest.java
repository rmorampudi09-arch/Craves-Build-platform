package in.craves.auth.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class RedisAuthAbuseProtectionFilterTest {
    @Test
    void disabledFilterDoesNotRequireProductionLimits() {
        RedisAuthAbuseProtectionFilter filter = new RedisAuthAbuseProtectionFilter(
            null,
            false,
            0,
            0,
            60,
            false,
            "craves:auth:rate",
            "redis"
        );

        assertThatCode(filter::validate).doesNotThrowAnyException();
    }

    @Test
    void enabledFilterRequiresExplicitPositiveLimits() {
        RedisAuthAbuseProtectionFilter filter = new RedisAuthAbuseProtectionFilter(
            null,
            true,
            0,
            0,
            60,
            false,
            "craves:auth:rate",
            "redis"
        );

        assertThatThrownBy(filter::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("Explicit positive exchange and refresh rate limits");
    }

    @Test
    void enabledFilterAcceptsReviewedValues() {
        RedisAuthAbuseProtectionFilter filter = new RedisAuthAbuseProtectionFilter(
            null,
            true,
            10,
            20,
            60,
            false,
            "craves:auth:rate",
            "redis"
        );

        assertThatCode(filter::validate).doesNotThrowAnyException();
    }
    @Test
    void encodedEquivalentRouteCannotBypassRedisRateGate() throws Exception {
        var redis=org.mockito.Mockito.mock(org.springframework.data.redis.core.StringRedisTemplate.class);
        var filter=new RedisAuthAbuseProtectionFilter(redis,true,10,20,60,false,"craves:auth:rate","redis");
        var request=new org.springframework.mock.web.MockHttpServletRequest("POST","/app/api/v1/auth/re%66resh");
        request.setContextPath("/app");request.setServletPath("/api/v1/auth/refresh");
        var response=new org.springframework.mock.web.MockHttpServletResponse();
        java.util.concurrent.atomic.AtomicBoolean forwarded=new java.util.concurrent.atomic.AtomicBoolean();
        // A null Redis result must fail closed. A raw-URI bypass would incorrectly forward this request.
        filter.doFilter(request,response,(req,res)->forwarded.set(true));
        org.junit.jupiter.api.Assertions.assertEquals(503,response.getStatus());
        org.junit.jupiter.api.Assertions.assertFalse(forwarded.get());
        org.mockito.Mockito.verify(redis).execute(org.mockito.ArgumentMatchers.any(org.springframework.data.redis.core.script.RedisScript.class),
            org.mockito.ArgumentMatchers.eq(java.util.List.of("craves:auth:rate:refresh:"+java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest("127.0.0.1".getBytes(java.nio.charset.StandardCharsets.UTF_8))))),
            org.mockito.ArgumentMatchers.eq("60"));
    }
}
