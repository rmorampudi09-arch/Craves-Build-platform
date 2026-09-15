package in.craves.auth.referrals;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.referrals.transport.ReferralOutbox;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralEnrollment {
    private final JdbcTemplate db;private final ObjectMapper json;private final ReferralOutbox outbox;
    private final String terms;private final byte[] contactKey,attributionKey;private final boolean retentionApproved;
    public ReferralEnrollment(JdbcTemplate db,ObjectMapper json,ReferralOutbox outbox,
        @Value("${CRAVES_REFERRAL_TERMS_VERSION:}") String terms,
        @Value("${CRAVES_REFERRAL_CONTACT_HMAC_BASE64:}") String contactKey,
        @Value("${CRAVES_REFERRAL_ATTRIBUTION_HMAC_BASE64:}") String attributionKey,
        @Value("${CRAVES_REFERRAL_ATTRIBUTION_RETENTION_APPROVED:false}") boolean retentionApproved){
        this.db=db;this.json=json;this.outbox=outbox;this.terms=terms;this.contactKey=Base64.getDecoder().decode(contactKey);this.attributionKey=Base64.getDecoder().decode(attributionKey);this.retentionApproved=retentionApproved;
        if(terms.isBlank() || terms.length()>100 || this.contactKey.length<32 || this.attributionKey.length<32 || java.security.MessageDigest.isEqual(this.contactKey,this.attributionKey))throw new IllegalArgumentException("REFERRAL_ENROLLMENT_CONFIGURATION_REQUIRED");
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void signup(AuthIdentity identity,ReferralSignup consent){
        if(consent==null)return;
        validate(consent);
        String parent=ReferralAttribution.parent(consent.attributionToken(),attributionKey,Instant.now(),retentionApproved);
        if(identity.getId()==null || identity.getCreatedAt()==null || !"ACTIVE".equals(identity.getStatus()))throw new IllegalStateException("AUTHORITATIVE_REFERRAL_ACCOUNT_REQUIRED");
        String contact=contactHash(identity.getPhoneNumber());
        var payload=json.createObjectNode().put("userId",identity.getId().toString()).put("registeredAt",identity.getCreatedAt().toString())
            .put("parentCode",parent).put("contactHash",contact).putNull("deviceHash").putNull("paymentHash").put("fingerprintConsent",false).put("termsVersion",terms);
        var event=outbox.enqueue("account/"+identity.getId()+"/registered","account.registered",identity.getId(),identity.getCreatedAt(),payload);
        db.update("INSERT INTO referral_enrollment(identity_id,event_id,parent_code,terms_version,contact_hash,registered_at) VALUES (?,?,?,?,?,?) ON CONFLICT(identity_id) DO NOTHING",identity.getId(),event,parent,terms,contact,java.sql.Timestamp.from(identity.getCreatedAt()));
    }
    public void validate(ReferralSignup consent){
        if(consent==null || !Boolean.TRUE.equals(consent.termsAccepted()) || !terms.equals(consent.termsVersion()))throw in.craves.auth.exception.AuthException.conflict("CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED","Accept the current referral terms");
    }
    private String contactHash(String phone){
        if(phone==null || !phone.matches("\\+[1-9][0-9]{7,14}"))throw new IllegalArgumentException("VERIFIED_E164_PHONE_REQUIRED");
        try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(contactKey,"HmacSHA256"));return HexFormat.of().formatHex(mac.doFinal(("craves-referral-contact-v1\n"+phone).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}
    }
}
