package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralProblem;
import in.craves.referral.ReferralSettings;
import in.craves.referral.core.ReferralCodes;
import in.craves.referral.core.RewardPolicy;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

@Service
public class ProgramService {
    private final Store db;
    private final Clock clock;
    private final ReferralSettings settings;
    private static final String[] APPROVALS={"legalReviewRef","termsVersion","taxReviewRef","privacyReviewRef","fundingReviewRef","multiChefDecisionRef","payoutReviewRef"};
    public ProgramService(Store db, Clock clock, ReferralSettings settings) { this.db=db; this.clock=clock; this.settings=settings; }

    public RewardPolicy policy(Map<String,Object> row) {
        return new RewardPolicy((int)number(row,"l1_bps"),(int)number(row,"l2_bps"),(int)number(row,"l3_bps"),
            (int)number(row,"cap_bps"),(int)number(row,"hold_days"),number(row,"minimum_paise"),
            number(row,"customer_bonus_paise"),number(row,"invitee_discount_paise"));
    }
    public Map<String,Object> policyAt(Instant at) {
        return db.one("SELECT p.* FROM referral_schema.policy p JOIN referral_schema.policy_activation a ON a.policy_id=p.id WHERE a.effective_at<=? ORDER BY a.effective_at DESC LIMIT 1",time(at));
    }
    public Map<String,Object> policyById(long id) { return db.one("SELECT * FROM referral_schema.policy WHERE id=?",id); }
    public List<Map<String,Object>> policies() {
        return db.rows("SELECT p.*,a.effective_at,a.approved_by FROM referral_schema.policy p LEFT JOIN referral_schema.policy_activation a ON a.policy_id=p.id ORDER BY p.id DESC LIMIT 50");
    }
    public long createPolicy(UUID actor, JsonNode body) {
        settings.requireEnabled();
        Json.fields(body,"expectedLatestRevision","l1Bps","l2Bps","l3Bps","capBps","holdDays","minimumPaise","customerBonusPaise","inviteeDiscountPaise","approvals");
        RewardPolicy policy=new RewardPolicy(Json.integer(body,"l1Bps",0,400),Json.integer(body,"l2Bps",0,400),Json.integer(body,"l3Bps",0,400),
            Json.integer(body,"capBps",1,400),Json.integer(body,"holdDays",1,365),Json.money(body,"minimumPaise"),Json.money(body,"customerBonusPaise"),Json.money(body,"inviteeDiscountPaise"));
        long expected=Json.money(body,"expectedLatestRevision");
        JsonNode approvals=body.get("approvals"); Json.fields(approvals,APPROVALS);
        for(String field:APPROVALS) Json.text(approvals,field,180);
        return db.tx(() -> {
            db.jdbc.execute("SELECT pg_advisory_xact_lock(194726851,1)");
            require(db.count("SELECT max(id) FROM referral_schema.policy")==expected,409,"POLICY_REVISION_CONFLICT");
            long id=db.count("INSERT INTO referral_schema.policy(l1_bps,l2_bps,l3_bps,cap_bps,hold_days,minimum_paise,customer_bonus_paise,invitee_discount_paise,approvals,created_by) VALUES (?,?,?,?,?,?,?,?,?::jsonb,?) RETURNING id",
                policy.l1Bps(),policy.l2Bps(),policy.l3Bps(),policy.capBps(),policy.holdDays(),policy.minimumPaise(),policy.customerBonusPaise(),policy.inviteeDiscountPaise(),Json.write(approvals),actor);
            db.audit(actor.toString(),"POLICY_DRAFT_CREATED",Long.toString(id),Map.of("expectedRevision",Long.toString(expected)));
            return id;
        });
    }
    public void approvePolicy(UUID actor,long id,Instant effectiveAt,long expectedActive) {
        settings.requireEnabled();
        require(!effectiveAt.isBefore(clock.instant()) && effectiveAt.isBefore(clock.instant().plusSeconds(31L*86400)),422,"INVALID_POLICY_EFFECTIVE_TIME");
        db.tx(() -> {
            db.jdbc.execute("SELECT pg_advisory_xact_lock(194726851,1)");
            require(db.count("SELECT COALESCE(max(policy_id),0) FROM referral_schema.policy_activation")==expectedActive,409,"POLICY_ACTIVATION_CONFLICT");
            Map<String,Object> policy=policyById(id);
            require(uuid(policy,"created_by")!=null && !actor.equals(uuid(policy,"created_by")),403,"SECOND_APPROVER_REQUIRED");
            JsonNode approvals=Json.parse(policy.get("approvals").toString());
            for(String key:APPROVALS) Json.text(approvals,key,180);
            db.update("INSERT INTO referral_schema.policy_activation(policy_id,effective_at,approved_by,activated_at) VALUES (?,?,?,?)",id,time(effectiveAt),actor,time(clock.instant()));
            db.audit(actor.toString(),"POLICY_ACTIVATED",Long.toString(id),Map.of("effectiveAt",effectiveAt.toString()));
            return null;
        });
    }

    /** Invoked only for a signed Auth-service registration event, never from a user's bearer token. */
    public void register(JsonNode body) {
        Json.fields(body,"userId","registeredAt","parentCode","fingerprintConsent","contactHash","deviceHash","paymentHash","termsVersion");
        UUID user=Json.uuid(body,"userId"); Instant registered=Json.instant(body,"registeredAt");
        require(!registered.isAfter(clock.instant().plusSeconds(60)),422,"FUTURE_REGISTRATION");
        String contact=hash(body,"contactHash",true), device=hash(body,"deviceHash",false), payment=hash(body,"paymentHash",false);
        boolean consent=Json.bool(body,"fingerprintConsent");
        require(device==null || consent,422,"FINGERPRINT_CONSENT_REQUIRED");
        String parentCode=Json.optionalText(body,"parentCode",16); String terms=Json.text(body,"termsVersion",100);
        String fingerprint=Json.hash(body);
        List<Map<String,Object>> existing=db.rows("SELECT registration_hash FROM referral_schema.member WHERE user_id=?",user);
        if(!existing.isEmpty()) { require(existing.getFirst().get("registration_hash").equals(fingerprint),409,"ATTRIBUTION_ALREADY_LOCKED"); return; }
        UUID parent=null; List<UUID> path=new ArrayList<>();
        if(parentCode!=null) {
            require(ReferralCodes.valid(parentCode),422,"INVALID_REFERRAL_CODE");
            Map<String,Object> row=db.one("SELECT * FROM referral_schema.member WHERE code=? FOR SHARE",parentCode);
            parent=uuid(row,"user_id");
            require(bool(row,"is_active") && !parent.equals(user) && !instant(row,"registered_at").isAfter(registered),409,"INVALID_REFERRAL_PARENT");
            require(!contact.equals(row.get("contact_hash")) && (device==null || !device.equals(row.get("device_hash")))
                && (payment==null || !payment.equals(row.get("payment_hash"))),422,"SELF_REFERRAL_SIGNAL");
            path.addAll(array(row,"path"));
            require(!path.contains(user) && path.size()<10000,422,"INVALID_REFERRAL_PATH");
        }
        path.add(user); String pathValue="{"+String.join(",",path.stream().map(UUID::toString).toList())+"}";
        db.update("INSERT INTO referral_schema.member(user_id,code,parent_id,path,registered_at,contact_hash,device_hash,payment_hash,fingerprint_consent,terms_version,registration_hash) VALUES (?,?,?,?::uuid[],?,?,?,?,?,?,?)",
            user,ReferralCodes.generate(),parent,pathValue,time(registered),contact,device,payment,consent,terms,fingerprint);
        db.update("INSERT INTO referral_schema.wallet(user_id) VALUES (?)",user);
        if(db.count("SELECT count(*) FROM referral_schema.member WHERE user_id<>? AND (contact_hash=? OR (?::text IS NOT NULL AND payment_hash=?) OR (?::text IS NOT NULL AND device_hash=?))",user,contact,payment,payment,device,device)>0)
            fraud(user,"identity:"+user,"DUPLICATE_IDENTITY_SIGNAL","auth-registration");
        db.audit("source:auth","ATTRIBUTION_LOCKED",user.toString(),Map.of("hasParent",parent!=null,"depth",path.size()-1));
    }
    public void status(JsonNode body) {
        Json.fields(body,"userId","version","active","reasonRef"); UUID user=Json.uuid(body,"userId");
        int version=Json.integer(body,"version",2,Integer.MAX_VALUE); boolean active=Json.bool(body,"active");
        Map<String,Object> member=db.one("SELECT * FROM referral_schema.member WHERE user_id=? FOR UPDATE",user);
        if(version<=number(member,"source_version")) {
            require(version<number(member,"source_version") || active==bool(member,"is_active"),409,"ACCOUNT_VERSION_CONFLICT"); return;
        }
        db.update("UPDATE referral_schema.member SET is_active=?,source_version=? WHERE user_id=?",active,version,user);
        db.audit("source:auth","ACCOUNT_STATUS_CHANGED",user.toString(),Map.of("active",active,"reasonRef",Json.text(body,"reasonRef",180)));
    }
    public boolean held(UUID user) {
        return db.count("SELECT count(*) FROM referral_schema.member WHERE user_id=? AND is_active",user)!=1
            || db.count("SELECT count(*) FROM referral_schema.fraud_case WHERE user_id=? AND status IN ('OPEN','CONFIRMED')",user)>0;
    }
    public boolean fraud(UUID user,String key,String reason,String evidence) {
        db.update("INSERT INTO referral_schema.fraud_case(id,case_key,user_id,reason_code,evidence_ref) VALUES (?,?,?,?,?) ON CONFLICT(case_key) DO NOTHING",UUID.randomUUID(),key,user,reason,evidence);
        return !db.one("SELECT status FROM referral_schema.fraud_case WHERE case_key=?",key).get("status").equals("CLEARED");
    }
    public void resolveFraud(UUID actor,UUID id,boolean clear,String evidence) {
        settings.requireEnabled(); require(evidence!=null && !evidence.isBlank() && evidence.length()<=180,422,"REVIEW_EVIDENCE_REQUIRED");
        db.tx(() -> {
            Map<String,Object> row=db.one("SELECT * FROM referral_schema.fraud_case WHERE id=? FOR UPDATE",id);
            require(!actor.equals(uuid(row,"user_id")),403,"SELF_REVIEW_FORBIDDEN");
            require(row.get("status").equals("OPEN"),409,"FRAUD_CASE_ALREADY_REVIEWED");
            db.update("UPDATE referral_schema.fraud_case SET status=?,resolved_at=?,resolved_by=? WHERE id=?",clear?"CLEARED":"CONFIRMED",time(clock.instant()),actor,id);
            db.audit(actor.toString(),"FRAUD_CASE_REVIEWED",id.toString(),Map.of("cleared",clear,"evidenceRef",evidence)); return null;
        });
    }
    public Map<String,Object> code(UUID user) {
        settings.requireEnabled(); Map<String,Object> member=db.one("SELECT code,is_active FROM referral_schema.member WHERE user_id=?",user);
        require(bool(member,"is_active"),403,"ACCOUNT_INACTIVE"); String code=member.get("code").toString();
        return Map.of("code",code,"link",settings.link(code),"qrPath","/api/v1/referrals/me/code/qr");
    }
    public static String hash(JsonNode body,String key,boolean required) {
        String value=required?Json.text(body,key,64):Json.optionalText(body,key,64);
        require(value==null || value.matches("[0-9a-f]{64}"),422,"INVALID_HASH"); return value;
    }
    public static void same(Object a,Object b,String code) { require(Objects.equals(a,b),409,code); }
}
