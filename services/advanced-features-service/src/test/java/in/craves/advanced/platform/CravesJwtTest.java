package in.craves.advanced.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.advanced.platform.security.CravesJwt;
import in.craves.advanced.support.TestTokens;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

class CravesJwtTest {
    final JwtDecoder decoder = CravesJwt.decoder(TestTokens.publicPemBase64(), TestTokens.ISSUER, TestTokens.AUDIENCE, Clock.systemUTC());

    @Test
    void acceptsAuthShapedTokens() {
        UUID user = UUID.randomUUID();
        assertThat(decoder.decode(TestTokens.token(user, "CUSTOMER", "CHEF")).getSubject()).isEqualTo(user.toString());
    }

    @Test
    void refusesWrongAudienceFutureIssueAndMissingKey() {
        assertThatThrownBy(() -> decoder.decode(TestTokens.token(UUID.randomUUID(), Instant.now(), "other", "CUSTOMER")))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(TestTokens.token(UUID.randomUUID(), Instant.now().plusSeconds(600), TestTokens.AUDIENCE, "CUSTOMER")))
                .isInstanceOf(JwtException.class);
        JwtDecoder unconfigured = CravesJwt.decoder("", TestTokens.ISSUER, TestTokens.AUDIENCE, Clock.systemUTC());
        assertThatThrownBy(() -> unconfigured.decode(TestTokens.token(UUID.randomUUID(), "CUSTOMER"))).isInstanceOf(JwtException.class);
    }
}
