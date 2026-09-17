package in.craves.auth.referrals;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.referrals.transport.ReferralOutbox;
import java.sql.Timestamp;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** The approved role is granted only by the authenticated chef-approval path. */
@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ChefReferralEligibilityWorker {
    private final JdbcTemplate db; private final ObjectMapper json; private final ReferralOutbox outbox;
    private final TransactionTemplate tx;
    public ChefReferralEligibilityWorker(JdbcTemplate db,ObjectMapper json,ReferralOutbox outbox,PlatformTransactionManager manager) {
        this.db=db; this.json=json; this.outbox=outbox; this.tx=new TransactionTemplate(manager);
    }
    @Scheduled(scheduler="referralTaskScheduler",fixedDelayString="${CRAVES_REFERRAL_CHEF_POLL_MS:5000}")
    public void tick() {for(int i=0;i<50 && observeOne();i++) { /* bounded, durable observations */ }}
    public boolean observeOne() {
        return Boolean.TRUE.equals(tx.execute(status->{
            var rows=db.queryForList("SELECT o.*,clock_timestamp() AS observed_at FROM referral_chef_observation o WHERE next_at<=now() ORDER BY next_at,identity_id LIMIT 1 FOR UPDATE SKIP LOCKED");
            if(rows.isEmpty()) return false;
            var row=rows.getFirst(); UUID user=(UUID)row.get("identity_id");
            // Read the canonical account and role together; never trust a bearer-token role claim.
            boolean eligible=Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM auth_identity a JOIN auth_identity_role r ON r.identity_id=a.id WHERE a.id=? AND a.status='ACTIVE' AND r.role_code='CHEF')",Boolean.class,user));
            int version=Math.addExact(((Number)row.get("version")).intValue(),1);
            var at=((Timestamp)row.get("observed_at")).toInstant();
            var body=json.createObjectNode().put("userId",user.toString()).put("version",version).put("eligible",eligible).put("observedAt",at.toString());
            outbox.enqueue("chef/"+user+"/"+version,"account.chef_status",user,at,body);
            db.update("UPDATE referral_chef_observation SET version=?,next_at=now()+interval '5 minutes' WHERE identity_id=?",version,user);
            return true;
        }));
    }
}
