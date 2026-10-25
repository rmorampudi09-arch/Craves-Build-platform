package in.craves.order.security.internalcall;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

// CH-03: internal routes check the caller's own key; a bad signature only blocks where enforcement is switched on.
class InternalCallFilterTest {
    private static final String GRANT = "/internal/v1/roles/chef/grant";
    private static final byte[] USER_CHEF_KEY = "user-chef-test-key-0123456789abcdef".getBytes(StandardCharsets.UTF_8);
    private static final byte[] ORDER_KEY = "order-test-key-0123456789abcdef-xyz".getBytes(StandardCharsets.UTF_8);
    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final byte[] BODY = "{\"identityId\":\"9f0c\"}".getBytes(StandardCharsets.UTF_8);

    @Test
    void unsignedCallPassesToTheRouteSecretCheckWhenNotEnforced() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter(List.of()).doFilter(post(), response, chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void unsignedCallIsRejectedOnAnEnforcedPath() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter(List.of("/internal/v1/roles/chef/**")).doFilter(post(), response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("INTERNAL_CALL_SIGNATURE_REQUIRED");
    }

    @Test
    void validSignatureFromTheAllowedCallerReachesTheControllerWithTheBodyIntact() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter(List.of("/internal/v1/roles/chef/**")).doFilter(signed("user-chef", USER_CHEF_KEY), response, chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(chain.getRequest().getInputStream().readAllBytes()).isEqualTo(BODY);
    }

    @Test
    void anotherServiceCannotGrantTheChefRoleOnceEnforced() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter(List.of("/internal/v1/roles/chef/**")).doFilter(signed("order", ORDER_KEY), response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("INTERNAL_CALL_FORBIDDEN").doesNotContain("CALLER_NOT_ALLOWED");
    }

    @Test
    void percentEncodedPathCannotSkipEnforcement() throws Exception {
        MockHttpServletRequest encoded = new MockHttpServletRequest("POST", "/%69nternal/v1/roles/%63hef/grant");
        encoded.setContent(BODY);
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter(List.of("/internal/v1/roles/chef/**")).doFilter(encoded, response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void oversizedSignedBodyIsRejectedWithoutBufferingItWhenEnforced() throws Exception {
        MockHttpServletRequest large = signed("user-chef", USER_CHEF_KEY);
        large.setContent(new byte[InternalCallFilter.MAX_SIGNED_BODY_BYTES + 1]);
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter(List.of("/internal/v1/roles/chef/**")).doFilter(large, response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("INTERNAL_CALL_UNAUTHORIZED");
    }

    @Test
    void badSignatureIsOnlyReportedWhereEnforcementIsOff() throws Exception {
        MockHttpServletRequest tampered = signed("user-chef", USER_CHEF_KEY);
        tampered.setContent("{\"identityId\":\"someone-else\"}".getBytes(StandardCharsets.UTF_8));
        MockFilterChain chain = new MockFilterChain();

        filter(List.of()).doFilter(tampered, new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void publicRoutesAreNotTouched() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/checkout");
        MockFilterChain chain = new MockFilterChain();

        filter(List.of("/**")).doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isSameAs(request);
    }

    private static InternalCallFilter filter(List<String> enforced) {
        var verifier = new InternalCallSignature.Verifier(
            Map.of("user-chef", USER_CHEF_KEY, "order", ORDER_KEY), Clock.fixed(NOW, ZoneOffset.UTC));
        return new InternalCallFilter(List.of("/internal/**"), verifier, enforced,
            Map.of("/internal/v1/roles/chef/**", Set.of("user-chef")));
    }

    private static MockHttpServletRequest post() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", GRANT);
        request.setContent(BODY);
        return request;
    }

    private static MockHttpServletRequest signed(String caller, byte[] key) {
        MockHttpServletRequest request = post();
        InternalCallSignature.sign(caller, key, "POST", GRANT, BODY, NOW, UUID.randomUUID().toString())
            .forEach(request::addHeader);
        return request;
    }

    @Test
    void keysShorterThan32BytesAreRefused() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> InternalCallSignature.parseCallerKeys("order=" + shortKey))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
