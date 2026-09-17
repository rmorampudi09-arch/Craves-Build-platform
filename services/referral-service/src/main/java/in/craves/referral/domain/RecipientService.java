package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralSettings;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** Receives reviewed evidence from Finance. No KYC/tax status can be self-declared through public APIs. */
@Service
public class RecipientService {
    private final Store db;
    private final Clock clock;
    private final ReferralSettings settings;
    public RecipientService(Store db,Clock clock,ReferralSettings settings) { this.db=db; this.clock=clock; this.settings=settings; }
    public void assess(JsonNode body) {
        Json.fields(body,"assessmentId","userId","financialYear","kycVerified","kycExpiresAt","destinationRef",
            "taxAssessmentRef","taxHandling","cashoutAllowed","annualLimitPaise","assessedAt","annualThresholdReviewRef");
        UUID id=Json.uuid(body,"assessmentId"), user=Json.uuid(body,"userId");
        String hash=Json.hash(body);
        List<Map<String,Object>> old=db.rows("SELECT source_hash FROM referral_schema.recipient_assessment WHERE id=?",id);
        if(!old.isEmpty()) { require(hash.equals(old.getFirst().get("source_hash")),409,"ASSESSMENT_ID_CONFLICT"); return; }
        Instant assessed=Json.instant(body,"assessedAt"), expires=Json.instant(body,"kycExpiresAt");
        String year=Json.text(body,"financialYear",9), destination=Json.text(body,"destinationRef",180);
        String tax=Json.text(body,"taxAssessmentRef",180), handling=Json.text(body,"taxHandling",30);
        String annualReview=Json.optionalText(body,"annualThresholdReviewRef",180);
        boolean verified=Json.bool(body,"kycVerified"), allowed=Json.bool(body,"cashoutAllowed");
        long limit=Json.money(body,"annualLimitPaise");
        require(!assessed.isAfter(clock.instant().plusSeconds(60)) && expires.isAfter(assessed),422,"INVALID_ASSESSMENT_TIME");
        require(year.equals(financialYear(assessed)) && limit>0,422,"INVALID_ASSESSMENT_YEAR_OR_LIMIT");
        require(destination.matches("[A-Za-z0-9][A-Za-z0-9._:-]{5,179}"),422,"OPAQUE_DESTINATION_REFERENCE_REQUIRED");
        require(List.of("REVIEWED_AT_REWARD_CREDIT","REVIEWED_AT_CASHOUT").contains(handling),422,"INVALID_TAX_HANDLING");
        require(!allowed || verified,422,"VERIFIED_KYC_REQUIRED");
        db.update("INSERT INTO referral_schema.recipient_assessment(id,user_id,financial_year,kyc_verified,kyc_expires_at,destination_ref,tax_assessment_ref,tax_handling,cashout_allowed,annual_limit_paise,assessed_at,source_hash,annual_threshold_review_ref) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            id,user,year,verified,time(expires),destination,tax,handling,allowed,limit,time(assessed),hash,annualReview);
        db.audit("source:finance","RECIPIENT_ASSESSED",user.toString(),Map.of("assessmentId",id.toString(),"financialYear",year,"cashoutAllowed",allowed));
    }
    public Map<String,Object> eligible(UUID user,long additional) {
        require(settings.cashoutMinimumPaise()>0 && settings.annualKycThresholdPaise()>0,503,"CASHOUT_THRESHOLDS_NOT_REVIEWED");
        Map<String,Object> assessment=db.one("SELECT * FROM referral_schema.recipient_assessment WHERE user_id=? AND assessed_at<=? ORDER BY assessed_at DESC LIMIT 1",user,time(clock.instant()));
        require(bool(assessment,"kyc_verified") && bool(assessment,"cashout_allowed")
            && instant(assessment,"kyc_expires_at").isAfter(clock.instant())
            && assessment.get("financial_year").equals(financialYear(clock.instant())),409,"CURRENT_RECIPIENT_REVIEW_REQUIRED");
        long used=db.count("SELECT COALESCE(sum(amount_paise),0) FROM referral_schema.reservation WHERE user_id=? AND kind='CASHOUT' AND status<>'RELEASED' AND requested_at>=?",user,time(yearStart(clock.instant())));
        require(Math.addExact(used,additional)<=number(assessment,"annual_limit_paise"),409,"ANNUAL_CASHOUT_LIMIT");
        if(Math.addExact(used,additional)>settings.annualKycThresholdPaise())
            require(assessment.get("annual_threshold_review_ref")!=null,409,"ANNUAL_THRESHOLD_REVIEW_REQUIRED");
        return assessment;
    }
    public void fund(JsonNode body) {
        Json.fields(body,"fundingId","track","amountPaise","evidenceRef");
        UUID id=Json.uuid(body,"fundingId"); String track=Json.text(body,"track",12);
        require(List.of("CUSTOMER","DISCOUNT").contains(track),422,"INVALID_MARKETING_BUDGET");
        long amount=Json.money(body,"amountPaise"); require(amount>0,422,"POSITIVE_FUNDING_REQUIRED");
        String evidence=Json.text(body,"evidenceRef",180);
        db.budget("funding:"+id,track,amount,evidence);
        db.audit("source:finance","MARKETING_BUDGET_FUNDED",id.toString(),Map.of("track",track,"amountPaise",Long.toString(amount),"evidenceRef",evidence));
    }
    public static String financialYear(Instant at) {
        LocalDate date=at.atZone(ZoneId.of("Asia/Kolkata")).toLocalDate();
        int year=date.getMonthValue()>=4?date.getYear():date.getYear()-1;
        return year+"-"+(year+1);
    }
    public static Instant yearStart(Instant at) {
        int year=Integer.parseInt(financialYear(at).substring(0,4));
        return LocalDate.of(year,4,1).atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant();
    }
}
