package in.craves.integration.payout.bank;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Versioned AES-256-GCM keys come from secret references, never source code or database rows. */
@Component
public class BankDataCipher {
    private final ObjectMapper json;
    private final String activeId;
    private final String keyRing;
    private final SecureRandom random = new SecureRandom();

    public BankDataCipher(ObjectMapper json,
            @Value("${CRAVES_BANK_DATA_ACTIVE_KEY_ID:}") String activeId,
            @Value("${CRAVES_BANK_DATA_KEYS_JSON:}") String keyRing) {
        this.json = json; this.activeId = activeId; this.keyRing = keyRing;
    }
    public boolean ready() {
        try { key(activeId); return true; } catch (RuntimeException e) { return false; }
    }
    public String encrypt(UUID id, UUID chef, BankOnboardingModels.Details details) {
        try {
            byte[] iv = new byte[12]; random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(activeId), "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad(id, chef));
            byte[] encrypted = cipher.doFinal(json.writeValueAsBytes(details));
            byte[] result = ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array();
            return activeId + "." + Base64.getEncoder().encodeToString(result);
        } catch (Exception e) { throw new IllegalStateException("BANK_ENCRYPTION_UNAVAILABLE"); }
    }
    public BankOnboardingModels.Details decrypt(UUID id, UUID chef, String value) {
        try {
            String[] parts = value.split("\\.", 2);
            byte[] bytes = Base64.getDecoder().decode(parts[1]);
            if (bytes.length < 29) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(parts[0]), "AES"),
                    new GCMParameterSpec(128, java.util.Arrays.copyOf(bytes, 12)));
            cipher.updateAAD(aad(id, chef));
            var details = json.readValue(cipher.doFinal(java.util.Arrays.copyOfRange(bytes, 12, bytes.length)),
                    BankOnboardingModels.Details.class);
            if (!chef.equals(details.chefId())) throw new IllegalArgumentException();
            return details;
        } catch (Exception e) { throw new IllegalStateException("BANK_ENCRYPTED_RECORD_UNVERIFIABLE"); }
    }
    /** Keyed hash prevents enumeration of bank details from audit/fingerprint data. */
    public String fingerprint(BankOnboardingModels.Details details) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key(activeId), "HmacSHA256"));
            mac.update("craves-bank-fingerprint-v1:".getBytes(StandardCharsets.UTF_8));
            return activeId + "." + HexFormat.of().formatHex(mac.doFinal(json.writeValueAsBytes(details)));
        } catch (Exception e) { throw new IllegalStateException("BANK_ENCRYPTION_UNAVAILABLE"); }
    }
    public boolean same(BankOnboardingModels.Details a, BankOnboardingModels.Details b) {
        try { return MessageDigest.isEqual(json.writeValueAsBytes(a), json.writeValueAsBytes(b)); }
        catch (Exception e) { return false; }
    }
    private byte[] key(String id) {
        try {
            if (id == null || !id.matches("[A-Za-z0-9_-]{1,40}")) throw new IllegalArgumentException();
            Map<String,String> keys = json.readValue(keyRing, new TypeReference<>() {});
            byte[] value = Base64.getDecoder().decode(keys.get(id));
            if (value.length != 32) throw new IllegalArgumentException();
            return value;
        } catch (Exception e) { throw new IllegalStateException("BANK_KEY_REFERENCE_NOT_CONFIGURED"); }
    }
    private byte[] aad(UUID id, UUID chef) {
        return ("craves-bank-v1/" + chef + "/" + id).getBytes(StandardCharsets.UTF_8);
    }
}
