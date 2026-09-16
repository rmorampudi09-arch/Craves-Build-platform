package in.craves.referral.infra;

import in.craves.referral.ReferralSettings;
import in.craves.referral.domain.ChefEarningsService;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import static in.craves.referral.infra.Store.*;

@Component
public class ChefReferralWorker {
    private final Store db; private final ChefEarningsService earnings; private final ReferralSettings settings;
    private final Clock clock; private final boolean enabled;
    public ChefReferralWorker(Store db,ChefEarningsService earnings,ReferralSettings settings,Clock clock,
        @Value("${referral.chef-earnings-enabled:false}") boolean enabled) {
        this.db=db; this.earnings=earnings; this.settings=settings; this.clock=clock; this.enabled=enabled;
    }
    @Scheduled(fixedDelayString="${referral.worker-delay-ms:15000}")
    public void tick() {
        if(!enabled || !settings.enabled() || !settings.workersEnabled()) return;
        for(var row:db.rows("SELECT s.order_id FROM referral_schema.order_snapshot s JOIN referral_schema.checkout c ON c.checkout_id=s.checkout_id JOIN referral_schema.policy p ON p.id=c.policy_id LEFT JOIN referral_schema.worker_schedule w ON w.kind='CHEF_EARN' AND w.aggregate_id=s.order_id WHERE p.program_kind='CHEF_COMMISSION_20260916' AND (w.next_at IS NULL OR w.next_at<=?) ORDER BY w.next_at NULLS FIRST,s.order_id LIMIT 50",time(clock.instant()))) {
            var id=uuid(row,"order_id"); String code="WAITING_FOR_DEPENDENCY";
            try {if(earnings.process(id)) code="APPLIED";}
            catch(RuntimeException ex) {code="CHEF_EARNINGS_RETRY_REQUIRED";}
            db.update("INSERT INTO referral_schema.worker_schedule(kind,aggregate_id,next_at,attempts,last_code) VALUES ('CHEF_EARN',?,?,1,?) ON CONFLICT(kind,aggregate_id) DO UPDATE SET next_at=EXCLUDED.next_at,attempts=referral_schema.worker_schedule.attempts+1,last_code=EXCLUDED.last_code",id,time(clock.instant().plusSeconds(60)),code);
        }
    }
}
