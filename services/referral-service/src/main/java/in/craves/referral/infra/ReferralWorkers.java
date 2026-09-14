package in.craves.referral.infra;

import in.craves.referral.ReferralProblem;
import in.craves.referral.ReferralSettings;
import in.craves.referral.domain.AwardService;
import in.craves.referral.domain.PayoutBatchPlanner;
import in.craves.referral.domain.SettlementService;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import static in.craves.referral.infra.Store.*;

@Component
public class ReferralWorkers {
    private static final Logger LOG=LoggerFactory.getLogger(ReferralWorkers.class);
    private final Store db;
    private final InboxService inbox;
    private final AwardService awards;
    private final SettlementService settlement;
    private final PayoutBatchPlanner payouts;
    private final ReferralSettings settings;
    private final Clock clock;
    private final AtomicLong sweepHour=new AtomicLong(-1);
    public ReferralWorkers(Store db,InboxService inbox,AwardService awards,SettlementService settlement,PayoutBatchPlanner payouts,ReferralSettings settings,Clock clock) {
        this.db=db; this.inbox=inbox; this.awards=awards; this.settlement=settlement; this.payouts=payouts; this.settings=settings; this.clock=clock;
    }
    @Scheduled(fixedDelayString="${referral.worker-delay-ms:15000}",initialDelayString="${referral.worker-delay-ms:15000}")
    public void tick() {
        if(!settings.enabled() || !settings.workersEnabled()) return;
        try {
            for(int i=0;i<100 && inbox.applyOne();i++) { /* Bounded durable source batch. */ }
            if(settings.awardsEnabled()) {
                for(Map<String,Object> row:db.rows("SELECT st.order_id AS id FROM referral_schema.order_state st LEFT JOIN referral_schema.worker_schedule w ON w.kind='AWARD' AND w.aggregate_id=st.order_id WHERE NOT st.awarded AND st.delivered_at IS NOT NULL AND st.verified_capture AND (w.next_at IS NULL OR w.next_at<=?) ORDER BY st.delivered_at,st.order_id LIMIT 50",time(clock.instant())))
                    attempt("AWARD",uuid(row,"id"),awards::award,900);
                for(Map<String,Object> row:db.rows("SELECT c.checkout_id AS id FROM referral_schema.checkout c LEFT JOIN referral_schema.worker_schedule w ON w.kind='CUSTOMER' AND w.aggregate_id=c.checkout_id WHERE c.first_qualifying_confirmed AND NOT c.full_refund AND NOT EXISTS(SELECT 1 FROM referral_schema.reward r WHERE r.checkout_id=c.checkout_id AND r.track='CUSTOMER') AND (w.next_at IS NULL OR w.next_at<=?) ORDER BY c.created_at,c.checkout_id LIMIT 50",time(clock.instant())))
                    attempt("CUSTOMER",uuid(row,"id"),awards::awardCustomer,900);
            }
            if(settings.settlementEnabled()) {
                long hour=clock.instant().getEpochSecond()/3600;
                if(sweepHour.get()!=hour) {
                    db.update("INSERT INTO referral_schema.worker_schedule(kind,aggregate_id,next_at) SELECT 'CREDIT',r.id,? FROM referral_schema.reward r WHERE r.status='PENDING' AND r.hold_until<=? AND NOT EXISTS(SELECT 1 FROM referral_schema.worker_schedule w WHERE w.kind='CREDIT' AND w.aggregate_id=r.id) ORDER BY r.hold_until,r.id LIMIT 1000 ON CONFLICT DO NOTHING",time(clock.instant()),time(clock.instant()));
                    sweepHour.set(hour);
                }
                // Follow-up to the hourly sweep runs frequently so a fresh Finance reply does not age out for an hour.
                for(Map<String,Object> row:db.rows("SELECT r.id FROM referral_schema.reward r JOIN referral_schema.worker_schedule w ON w.kind='CREDIT' AND w.aggregate_id=r.id WHERE r.status='PENDING' AND r.hold_until<=? AND w.next_at<=? ORDER BY w.next_at,r.id LIMIT 100",time(clock.instant()),time(clock.instant())))
                    attempt("CREDIT",uuid(row,"id"),settlement::settle,60);
            }
            if(settings.withdrawalsEnabled()) {
                for(Map<String,Object> row:db.rows("SELECT r.id FROM referral_schema.reservation r LEFT JOIN referral_schema.worker_schedule w ON w.kind='PAYOUT' AND w.aggregate_id=r.id WHERE r.kind='CASHOUT' AND r.status='APPROVED' AND r.updated_at<=? AND (w.next_at IS NULL OR w.next_at<=?) ORDER BY r.requested_at,r.id LIMIT 50",time(PayoutBatchPlanner.weeklyCutoff(clock.instant())),time(clock.instant())))
                    attempt("PAYOUT",uuid(row,"id"),payouts::plan,900);
            }
        } catch(RuntimeException ex) { LOG.error("Referral worker cycle failed; durable records retained; code={}",safeCode(ex)); }
    }
    private void attempt(String kind,UUID id,Predicate<UUID> action,long delay) {
        String code="WAITING_FOR_DEPENDENCY";
        try { if(action.test(id)) code="APPLIED"; }
        catch(RuntimeException ex) { code=safeCode(ex); }
        db.update("INSERT INTO referral_schema.worker_schedule(kind,aggregate_id,next_at,attempts,last_code) VALUES (?,?,?,1,?) ON CONFLICT(kind,aggregate_id) DO UPDATE SET next_at=EXCLUDED.next_at,attempts=referral_schema.worker_schedule.attempts+1,last_code=EXCLUDED.last_code",
            kind,id,time(clock.instant().plusSeconds(delay)),code);
    }
    private static String safeCode(RuntimeException ex) { return ex instanceof ReferralProblem problem?problem.getMessage():"DATABASE_OR_WORKER_FAILURE"; }
}
