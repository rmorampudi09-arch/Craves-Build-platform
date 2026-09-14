package in.craves.referral.security;

import in.craves.referral.ReferralSettings;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
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

public final class ReferralJwtDecoder {
    private ReferralJwtDecoder() { }
    public static JwtDecoder create(ReferralSettings settings,Clock clock) {
        if(settings.verificationPemBase64()==null || settings.verificationPemBase64().isBlank())
            return token -> { throw new BadJwtException("REFERRAL_VERIFICATION_NOT_CONFIGURED"); };
        try {
            String pem=new String(Base64.getDecoder().decode(settings.verificationPemBase64()),StandardCharsets.UTF_8);
            String encoded=pem.replace("-----BEGIN PUBLIC KEY-----","").replace("-----END PUBLIC KEY-----","").replaceAll("\\s","");
            RSAPublicKey key=(RSAPublicKey)KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(encoded)));
            if(key.getModulus().bitLength()<2048) throw new IllegalArgumentException("Weak verification key");
            NimbusJwtDecoder decoder=NimbusJwtDecoder.withPublicKey(key).signatureAlgorithm(SignatureAlgorithm.RS256).build();
            JwtTimestampValidator timestamps=new JwtTimestampValidator(Duration.ofSeconds(30)); timestamps.setClock(clock);
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(timestamps,new JwtIssuerValidator(settings.jwtIssuer()),jwt -> validate(jwt,settings,clock)));
            return decoder;
        } catch(Exception ex) { throw new IllegalStateException("Referral RSA verification configuration is invalid"); }
    }
    private static OAuth2TokenValidatorResult validate(Jwt jwt,ReferralSettings settings,Clock clock) {
        try {
            UUID.fromString(jwt.getSubject());
            Object version=jwt.getClaims().get("token_version"), roles=jwt.getClaims().get("roles");
            boolean integral=version instanceof Long || version instanceof Integer;
            if(jwt.getExpiresAt()==null || jwt.getIssuedAt()==null || jwt.getIssuedAt().isAfter(clock.instant().plusSeconds(30))
                || !jwt.getExpiresAt().isAfter(jwt.getIssuedAt()) || !jwt.getAudience().contains(settings.jwtAudience())
                || !integral || ((Number)version).longValue()<0 || !(roles instanceof List<?> list)
                || list.size()>20 || list.stream().anyMatch(role->!(role instanceof String text) || !text.matches("[A-Za-z_]{1,40}")))
                throw new IllegalArgumentException();
            return OAuth2TokenValidatorResult.success();
        } catch(RuntimeException ex) { return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Invalid referral access claims",null)); }
    }
}
