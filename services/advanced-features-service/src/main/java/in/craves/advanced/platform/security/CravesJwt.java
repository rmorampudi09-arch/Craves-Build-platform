package in.craves.advanced.platform.security;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/** Verifies Craves access tokens exactly as the other services do: RS256, issuer, audience, UUID subject, roles, token_version. */
public final class CravesJwt {
    private static final Pattern ROLE = Pattern.compile("[A-Za-z_]{1,40}");

    private CravesJwt() { }

    public static JwtDecoder decoder(String pemBase64, String issuer, String audience, Clock clock) {
        if (pemBase64 == null || pemBase64.isBlank()) {
            // Fail closed: the service starts, every bearer token is refused until the key is configured.
            return token -> { throw new BadJwtException("JWT_VERIFICATION_NOT_CONFIGURED"); };
        }
        try {
            String pem = new String(Base64.getDecoder().decode(pemBase64.strip()), StandardCharsets.UTF_8);
            String encoded = pem.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\\s", "");
            RSAPublicKey key = (RSAPublicKey) KeyFactory.getInstance("RSA")
                    .generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(encoded)));
            if (key.getModulus().bitLength() < 2048) throw new IllegalArgumentException("weak key");
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(key).signatureAlgorithm(SignatureAlgorithm.RS256).build();
            JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ofSeconds(30));
            timestamps.setClock(clock);
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(timestamps, new JwtIssuerValidator(issuer),
                    jwt -> claims(jwt, audience, clock)));
            return decoder;
        } catch (Exception ex) {
            throw new IllegalStateException("JWT verification key is invalid", ex);
        }
    }

    static OAuth2TokenValidatorResult claims(Jwt jwt, String audience, Clock clock) {
        try {
            UUID.fromString(jwt.getSubject());
            Object version = jwt.getClaims().get("token_version");
            Object roles = jwt.getClaims().get("roles");
            boolean integral = version instanceof Long || version instanceof Integer;
            boolean valid = jwt.getExpiresAt() != null && jwt.getIssuedAt() != null
                    && !jwt.getIssuedAt().isAfter(clock.instant().plusSeconds(30))
                    && jwt.getExpiresAt().isAfter(jwt.getIssuedAt())
                    && jwt.getAudience() != null && jwt.getAudience().contains(audience)
                    && integral && ((Number) version).longValue() >= 0
                    && roles instanceof List<?> list && list.size() <= 20
                    && list.stream().allMatch(role -> role instanceof String text && ROLE.matcher(text).matches());
            return valid ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid access token claims", null));
        } catch (RuntimeException ex) {
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid access token claims", null));
        }
    }
}
