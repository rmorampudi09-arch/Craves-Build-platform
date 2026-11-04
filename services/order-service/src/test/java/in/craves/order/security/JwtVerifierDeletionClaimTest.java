package in.craves.order.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.config.CravesJwtProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class JwtVerifierDeletionClaimTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final KeyPair keys = newKeys();
    private final JwtVerifier verifier = new JwtVerifier(properties(), mapper);

    private static KeyPair newKeys() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private CravesJwtProperties properties() {
        String pem = "-----BEGIN PUBLIC KEY-----\n"
            + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.UTF_8)).encodeToString(keys.getPublic().getEncoded())
            + "\n-----END PUBLIC KEY-----\n";
        CravesJwtProperties properties = new CravesJwtProperties();
        properties.setIssuer("craves-auth");
        properties.setAudience("craves-api");
        properties.setVerificationPemBase64(Base64.getEncoder().encodeToString(pem.getBytes(StandardCharsets.UTF_8)));
        return properties;
    }

    private String token(String deletionPending) throws Exception {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", UUID.randomUUID().toString());
        claims.put("iss", "craves-auth");
        claims.put("aud", "craves-api");
        claims.put("exp", Instant.now().plusSeconds(300).getEpochSecond());
        claims.put("phone_number", "+910000000000");
        claims.put("roles", List.of("CUSTOMER"));
        if (deletionPending != null) {
            claims.put("deletion_pending", deletionPending);
        }
        Base64.Encoder url = Base64.getUrlEncoder().withoutPadding();
        String input = url.encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8))
            + "." + url.encodeToString(mapper.writeValueAsBytes(claims));
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(keys.getPrivate());
        signature.update(input.getBytes(StandardCharsets.UTF_8));
        return input + "." + url.encodeToString(signature.sign());
    }

    @Test void verifierReadsTheDeletionPendingClaim() throws Exception {
        assertEquals("ALL", verifier.verify(token("ALL")).deletionPendingScope());
        assertEquals("CHEF", verifier.verify(token("CHEF")).deletionPendingScope());
        assertNull(verifier.verify(token(null)).deletionPendingScope());
    }
}
