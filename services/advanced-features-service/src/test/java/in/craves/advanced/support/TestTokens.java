package in.craves.advanced.support;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.UUID;

/** Mints RS256 access tokens shaped exactly like Auth's, signed by a throwaway test key. */
public final class TestTokens {
    public static final String ISSUER = "https://api.craves.in/auth";
    public static final String AUDIENCE = "craves-api";
    private static final KeyPair KEYS;

    static {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            KEYS = generator.generateKeyPair();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private TestTokens() { }

    public static String publicPemBase64() {
        String pem = "-----BEGIN PUBLIC KEY-----\n" + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.UTF_8))
                .encodeToString(KEYS.getPublic().getEncoded()) + "\n-----END PUBLIC KEY-----\n";
        return Base64.getEncoder().encodeToString(pem.getBytes(StandardCharsets.UTF_8));
    }

    public static String token(UUID subject, String... roles) {
        return token(subject, Instant.now(), AUDIENCE, roles);
    }

    public static String token(UUID subject, Instant issuedAt, String audience, String... roles) {
        try {
            JWTClaimsSet claims = new JWTClaimsSet.Builder().subject(subject.toString()).issuer(ISSUER).audience(audience)
                    .issueTime(Date.from(issuedAt)).expirationTime(Date.from(issuedAt.plusSeconds(24 * 3600)))
                    .claim("roles", List.of(roles)).claim("token_version", 1).build();
            SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims);
            jwt.sign(new RSASSASigner((RSAPrivateKey) KEYS.getPrivate()));
            return jwt.serialize();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
