package in.craves.supportassistant.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.supportassistant.config.CravesJwtProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Component
public class JwtVerifier {
    private static final Base64.Decoder URL_DECODER = Base64.getUrlDecoder();
    private final CravesJwtProperties properties;
    private final ObjectMapper objectMapper;
    private volatile RSAPublicKey cachedVerificationKey;

    public JwtVerifier(CravesJwtProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public CurrentUser verify(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                throw unauthorized("Invalid access token format");
            }
            String signingInput = parts[0] + "." + parts[1];
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initVerify(verificationKey());
            signature.update(signingInput.getBytes(StandardCharsets.UTF_8));
            if (!signature.verify(URL_DECODER.decode(parts[2]))) {
                throw unauthorized("Invalid access token signature");
            }

            Map<String, Object> claims = objectMapper.readValue(
                URL_DECODER.decode(parts[1]),
                new TypeReference<Map<String, Object>>() {}
            );
            if (!properties.getIssuer().equals(stringClaim(claims, "iss"))) {
                throw unauthorized("Invalid access token issuer");
            }
            if (!properties.getAudience().equals(stringClaim(claims, "aud"))) {
                throw unauthorized("Invalid access token audience");
            }
            if (!Instant.ofEpochSecond(longClaim(claims, "exp")).isAfter(Instant.now())) {
                throw unauthorized("Access token has expired");
            }

            UUID identityId = UUID.fromString(stringClaim(claims, "sub"));
            String firebaseUid = optionalStringClaim(claims, "firebase_uid");
            String phoneNumber = optionalStringClaim(claims, "phone_number");
            List<String> roles = objectMapper.convertValue(claims.get("roles"), new TypeReference<List<String>>() {});
            return new CurrentUser(identityId, firebaseUid, phoneNumber, roles);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw unauthorized("Invalid access token");
        }
    }

    private RSAPublicKey verificationKey() throws Exception {
        RSAPublicKey existing = cachedVerificationKey;
        if (existing != null) {
            return existing;
        }
        if (!StringUtils.hasText(properties.getVerificationPemBase64())) {
            throw unauthorized("JWT verification is not configured");
        }
        String pem = new String(Base64.getDecoder().decode(properties.getVerificationPemBase64()), StandardCharsets.UTF_8);
        String normalized = pem
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replaceAll("\\s", "");
        byte[] decoded = Base64.getMimeDecoder().decode(normalized);
        cachedVerificationKey = (RSAPublicKey) KeyFactory.getInstance("RSA")
            .generatePublic(new X509EncodedKeySpec(decoded));
        return cachedVerificationKey;
    }

    private static String stringClaim(Map<String, Object> claims, String name) {
        Object value = claims.get(name);
        if (value == null) {
            throw unauthorized("Missing required access token claim");
        }
        return String.valueOf(value);
    }

    private static String optionalStringClaim(Map<String, Object> claims, String name) {
        Object value = claims.get(name);
        return value == null ? null : String.valueOf(value);
    }

    private static long longClaim(Map<String, Object> claims, String name) {
        Object value = claims.get(name);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            throw unauthorized("Missing required access token claim");
        }
        return Long.parseLong(String.valueOf(value));
    }

    private static ResponseStatusException unauthorized(String message) {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, message);
    }
}
