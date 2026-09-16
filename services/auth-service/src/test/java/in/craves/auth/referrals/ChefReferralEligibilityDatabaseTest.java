package in.craves.auth.referrals;

import in.craves.auth.referrals.transport.ReferralOutbox;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="REFERRAL_OWNER_TEST_JDBC_URL",matches=".+")
class ChefReferralEligibilityDatabaseTest {
    ReferralEnrollmentDatabaseTest f; ChefReferralEligibilityWorker worker;
    @BeforeEach void setup() throws Exception {
        f=new ReferralEnrollmentDatabaseTest();f.setup();
        try(var input=getClass().getResourceAsStream("/db/migration/V17__chef_referral_eligibility.sql")) {
            f.db.execute(new String(input.readAllBytes(),StandardCharsets.UTF_8));
        }
        worker=new ChefReferralEligibilityWorker(f.db,f.json,new ReferralOutbox(f.db,f.json,f.tx),f.tx.getTransactionManager());
    }
    boolean latest() throws Exception {
        return f.json.readTree(f.db.queryForObject("SELECT envelope FROM referral_source_outbox WHERE envelope::jsonb->>'eventType'='account.chef_status' ORDER BY (envelope::jsonb->'payload'->>'version')::int DESC LIMIT 1",String.class)).path("payload").path("eligible").booleanValue();
    }
    @Test void canonicalRoleAndActiveStatusAreRequiredAndRevocationIsQueuedImmediately() throws Exception {
        var user=f.identity();f.tx.executeWithoutResult(s->f.enrollment.signup(user,new ReferralSignup(null,"TEST_ONLY_TERMS",true)));
        assertTrue(worker.observeOne());assertFalse(latest());assertFalse(worker.observeOne());
        f.db.update("INSERT INTO auth_identity_role(identity_id,role_code) VALUES (?,'CHEF')",user.getId());
        assertTrue(worker.observeOne());assertTrue(latest());
        f.db.update("UPDATE auth_identity SET status='SUSPENDED' WHERE id=?",user.getId());
        assertTrue(worker.observeOne());assertFalse(latest());
        f.db.update("UPDATE auth_identity SET status='ACTIVE' WHERE id=?",user.getId());
        assertTrue(worker.observeOne());assertTrue(latest());
        f.db.update("DELETE FROM auth_identity_role WHERE identity_id=? AND role_code='CHEF'",user.getId());
        assertTrue(worker.observeOne());assertFalse(latest());
        assertEquals(5,f.db.queryForObject("SELECT version FROM referral_chef_observation",Integer.class));
    }
    @Test void noConsentMeansNoAutomaticEnrollmentOrEligibilityPublication() {
        var user=f.identity();f.db.update("INSERT INTO auth_identity_role(identity_id,role_code) VALUES (?,'CHEF')",user.getId());
        assertFalse(worker.observeOne());assertEquals(0,f.count("referral_source_outbox"));assertEquals(0,f.count("referral_enrollment"));
    }
    @Test void observationAndDurableEventRollBackTogether() {
        var user=f.identity();f.tx.executeWithoutResult(s->f.enrollment.signup(user,new ReferralSignup(null,"TEST_ONLY_TERMS",true)));
        assertThrows(IllegalStateException.class,()->f.tx.executeWithoutResult(s->{assertTrue(worker.observeOne());throw new IllegalStateException("synthetic rollback");}));
        assertEquals(0,f.db.queryForObject("SELECT version FROM referral_chef_observation",Integer.class));
        assertEquals(1,f.count("referral_source_outbox"));assertTrue(worker.observeOne());assertEquals(2,f.count("referral_source_outbox"));
    }
}
