package in.craves.referral.domain;

import in.craves.referral.ReferralSettings;
import in.craves.referral.core.RewardMath;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** Reservations only. This service does not call a bank, RazorpayX, or any payout provider. */
@Service
public class CashoutService {
    private final Store db;
    private final ProgramService program;
    private final RecipientService recipients;
    private final ReferralSettings settings;
    private final Clock clock;
    public CashoutService(Store db,ProgramService program,RecipientService recipients,ReferralSettings settings,Clock clock) {
        this.db=db; this.program=program; this.recipients=recipients; this.settings=settings; this.clock=clock;
    }
    public Map<String,Object> request(UUID user,UUID id,long amount) {
        settings.requireEnabled(); require(settings.withdrawalsEnabled(),503,"CASHOUT_DISABLED");
        RewardMath.money(amount);
        return db.tx(() -> {
            db.lockWallets(List.of(user));
            List<Map<String,Object>> previous=db.rows("SELECT * FROM referral_schema.reservation WHERE id=?",id);
            if(!previous.isEmpty()) {
                Map<String,Object> row=previous.getFirst();
                require(user.equals(uuid(row,"user_id")) && row.get("kind").equals("CASHOUT") && amount==number(row,"amount_paise"),409,"RESERVATION_ID_CONFLICT");
                return publicValue(row);
            }
            require(!program.held(user),409,"RECIPIENT_ON_HOLD");
            Map<String,Object> assessment=recipients.eligible(user,amount);
            require(amount>=settings.cashoutMinimumPaise(),422,"BELOW_CASHOUT_MINIMUM");
            require(db.count("SELECT available_paise FROM referral_schema.wallet WHERE user_id=?",user)>=amount,409,"INSUFFICIENT_AVAILABLE_BALANCE");
            require(db.count("SELECT count(*) FROM referral_schema.reservation WHERE user_id=? AND kind='CASHOUT' AND status IN ('RESERVED','APPROVED','SUBMITTED','UNKNOWN')",user)<5,429,"TOO_MANY_PENDING_CASHOUTS");
            db.update("INSERT INTO referral_schema.reservation(id,user_id,kind,amount_paise,status,assessment_id,requested_at,updated_at) VALUES (?,?,'CASHOUT',?,'RESERVED',?,?,?)",
                id,user,amount,uuid(assessment,"id"),time(clock.instant()),time(clock.instant()));
            db.journal("reserve:"+id,user,0,-amount,amount,"INTERNAL_TRANSFER",null,id);
            db.audit(user.toString(),"CASHOUT_RESERVED",id.toString(),Map.of("amountPaise",Long.toString(amount),"assessmentId",uuid(assessment,"id").toString()));
            return publicValue(db.one("SELECT * FROM referral_schema.reservation WHERE id=?",id));
        });
    }
    public void approve(UUID actor,UUID id,long net,long withholding,String evidence) {
        settings.requireEnabled(); require(settings.withdrawalsEnabled(),503,"CASHOUT_DISABLED");
        RewardMath.money(net); RewardMath.money(withholding);
        require(net>0 && evidence!=null && !evidence.isBlank() && evidence.length()<=180,422,"PAYOUT_APPROVAL_EVIDENCE_REQUIRED");
        db.tx(() -> {
            Map<String,Object> initial=db.one("SELECT user_id FROM referral_schema.reservation WHERE id=?",id);
            UUID user=uuid(initial,"user_id"); db.lockWallets(List.of(user));
            Map<String,Object> row=db.one("SELECT * FROM referral_schema.reservation WHERE id=? FOR UPDATE",id);
            require(row.get("kind").equals("CASHOUT") && !user.equals(actor),403,"SECOND_PERSON_APPROVAL_REQUIRED");
            if(!row.get("status").equals("RESERVED")) {
                require(actor.equals(uuid(row,"approved_by")) && row.get("net_paise")!=null && number(row,"net_paise")==net
                    && number(row,"withholding_paise")==withholding && evidence.equals(row.get("approval_ref")),409,"CASHOUT_APPROVAL_CONFLICT"); return null;
            }
            require(Math.addExact(net,withholding)==number(row,"amount_paise"),422,"NET_WITHHOLDING_MISMATCH");
            require(!program.held(user) && db.count("SELECT available_paise FROM referral_schema.wallet WHERE user_id=?",user)>=0,409,"RECIPIENT_ON_HOLD");
            Map<String,Object> assessment=recipients.eligible(user,0);
            require(uuid(assessment,"id").equals(uuid(row,"assessment_id")),409,"RECIPIENT_ASSESSMENT_CHANGED");
            if(assessment.get("tax_handling").equals("REVIEWED_AT_REWARD_CREDIT"))
                require(withholding==0,422,"DO_NOT_WITHHOLD_ALREADY_REVIEWED_CREDIT_TAX_TWICE");
            db.update("UPDATE referral_schema.reservation SET status='APPROVED',net_paise=?,withholding_paise=?,approved_by=?,approval_ref=?,updated_at=? WHERE id=?",
                net,withholding,actor,evidence,time(clock.instant()),id);
            db.audit(actor.toString(),"CASHOUT_APPROVED",id.toString(),Map.of("netPaise",Long.toString(net),"withholdingPaise",Long.toString(withholding),"evidenceRef",evidence)); return null;
        });
    }
    public void cancel(UUID user,UUID id) {
        settings.requireEnabled();
        db.tx(() -> {
            db.lockWallets(List.of(user));
            Map<String,Object> row=db.one("SELECT * FROM referral_schema.reservation WHERE id=? FOR UPDATE",id);
            require(user.equals(uuid(row,"user_id")) && row.get("kind").equals("CASHOUT"),404,"CASHOUT_NOT_FOUND");
            if(row.get("status").equals("RELEASED")) return null;
            require(List.of("RESERVED","APPROVED").contains(row.get("status")),409,"TRANSFER_ALREADY_SUBMITTED_DO_NOT_RETRY");
            db.update("UPDATE referral_schema.reservation SET status='RELEASED',updated_at=? WHERE id=?",time(clock.instant()),id);
            long amount=number(row,"amount_paise");
            db.journal("release:"+id,user,0,amount,-amount,"INTERNAL_TRANSFER",null,id);
            db.audit(user.toString(),"CASHOUT_CANCELLED_BEFORE_SUBMISSION",id.toString(),Map.of()); return null;
        });
    }
    public static Map<String,Object> publicValue(Map<String,Object> row) {
        return Map.of("id",uuid(row,"id").toString(),"amountPaise",Long.toString(number(row,"amount_paise")),
            "status",row.get("status"),"requestedAt",instant(row,"requested_at").toString());
    }
}
