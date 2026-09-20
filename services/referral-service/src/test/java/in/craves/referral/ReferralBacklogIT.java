package in.craves.referral;

import in.craves.referral.infra.ReferralWorkers;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** A deterministic backlog correctness test, not a production throughput benchmark. */
class ReferralBacklogIT {
    @Test void drainsMoreThanOneThousandDueRewardsWithinTheSameHourlyWindow() {
        ReferralTestRig r=new ReferralTestRig();
        var a=r.member(null); var b=r.member(a); var c=r.member(b); var seller=r.member(c); var buyer=r.member(null);
        for(int i=0;i<334;i++) {
            var order=r.order(seller,buyer,100000); r.deliver(order); r.finance(order,1,0,7000); assertTrue(r.awards.award(order.id()));
        }
        assertEquals(1002,r.db.count("SELECT count(*) FROM referral_schema.reward"));
        r.clock.advance(Duration.ofDays(15));
        ReferralWorkers workers=new ReferralWorkers(r.db,r.inbox,r.awards,r.settlement,r.planner,r.settings,r.clock);
        workers.tick(); assertEquals(1000,r.db.count("SELECT count(*) FROM referral_schema.worker_schedule WHERE kind='CREDIT'"));
        workers.tick(); assertEquals(1002,r.db.count("SELECT count(*) FROM referral_schema.worker_schedule WHERE kind='CREDIT'"));
        // Stale finance still blocks credit even under backlog pressure.
        assertEquals(0,r.db.count("SELECT COALESCE(sum(available_paise),0) FROM referral_schema.wallet"));
        assertEquals(1002,r.db.count("SELECT count(*) FROM referral_schema.reward WHERE status='PENDING'"));
    }
}
