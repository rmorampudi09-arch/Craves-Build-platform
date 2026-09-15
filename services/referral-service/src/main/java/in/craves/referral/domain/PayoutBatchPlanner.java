package in.craves.referral.domain;

import in.craves.referral.ReferralSettings;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** Writes reviewed instructions to the referral outbox only. No provider client or transfer execution. */
@Service
public class PayoutBatchPlanner {
    private final Store db;
    private final ProgramService program;
    private final RecipientService recipients;
    private final ReferralSettings settings;
    private final Clock clock;
    public PayoutBatchPlanner(Store db,ProgramService program,RecipientService recipients,ReferralSettings settings,Clock clock) {
        this.db=db; this.program=program; this.recipients=recipients; this.settings=settings; this.clock=clock;
    }
    public static Instant weeklyCutoff(Instant now) {
        var week=now.atZone(ZoneId.of("Asia/Kolkata")).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
            .withHour(8).withMinute(0).withSecond(0).withNano(0);
        return (week.toInstant().isAfter(now)?week.minusWeeks(1):week).toInstant();
    }
    public boolean plan(UUID id) {
        if(!settings.enabled() || !settings.withdrawalsEnabled()) return false;
        return db.tx(() -> {
            Map<String,Object> initial=db.one("SELECT user_id FROM referral_schema.reservation WHERE id=?",id);
            UUID user=uuid(initial,"user_id"); db.lockWallets(List.of(user));
            Map<String,Object> row=db.one("SELECT * FROM referral_schema.reservation WHERE id=? FOR UPDATE",id);
            if(!row.get("kind").equals("CASHOUT") || !row.get("status").equals("APPROVED")
                || instant(row,"updated_at").isAfter(weeklyCutoff(clock.instant()))) return false;
            if(program.held(user) || db.count("SELECT available_paise FROM referral_schema.wallet WHERE user_id=?",user)<0) return false;
            Map<String,Object> assessment=recipients.eligible(user,0);
            require(uuid(assessment,"id").equals(uuid(row,"assessment_id")),409,"RECIPIENT_ASSESSMENT_CHANGED");
            UUID attempt=UUID.randomUUID();
            db.update("UPDATE referral_schema.reservation SET status='SUBMITTED',attempt_id=?,updated_at=? WHERE id=?",attempt,time(clock.instant()),id);
            db.emit("payout:"+id,"referral.payout.requested",Map.of("reservationId",id.toString(),"attemptId",attempt.toString(),
                "beneficiaryUserId",user.toString(),"destinationRef",assessment.get("destination_ref"),
                "grossPaise",Long.toString(number(row,"amount_paise")),"netPaise",Long.toString(number(row,"net_paise")),
                "withholdingPaise",Long.toString(number(row,"withholding_paise")),"assessmentId",uuid(assessment,"id").toString(),"currency","INR"));
            db.audit("worker:weekly","PAYOUT_INSTRUCTION_QUEUED",id.toString(),Map.of("attemptId",attempt.toString()));
            return true;
        });
    }
}
