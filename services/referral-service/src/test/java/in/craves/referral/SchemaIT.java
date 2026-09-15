package in.craves.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class SchemaIT {
    JdbcTemplate jdbc;
    @BeforeEach void reset() { jdbc=new JdbcTemplate(TestDatabase.reset()); }
    @Test void onlyAnInactiveDefaultPolicyExists() {
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM referral_schema.policy",Integer.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM referral_schema.policy_activation",Integer.class));
        assertEquals(0L,jdbc.queryForObject("SELECT sum(available_paise) FROM referral_schema.budget",Long.class));
    }
    @Test void policyAndAuditAreImmutable() {
        assertThrows(DataAccessException.class,()->jdbc.update("UPDATE referral_schema.policy SET l1_bps=100 WHERE id=1"));
        jdbc.update("INSERT INTO referral_schema.audit(actor,action,target,detail) VALUES ('test','VERIFY','test','{}')");
        assertThrows(DataAccessException.class,()->jdbc.update("DELETE FROM referral_schema.audit"));
        assertThrows(DataAccessException.class,()->jdbc.execute("TRUNCATE referral_schema.audit"));
    }
    @Test void attributionCannotBeRewrittenOrCreateInvalidPath() {
        UUID root=UUID.randomUUID();
        jdbc.update("INSERT INTO referral_schema.member(user_id,code,path,registered_at,terms_version,registration_hash) VALUES (?, 'ABCDEFGHJKLMNPQR',?::uuid[],now(),'test','hash')",root,"{"+root+"}");
        assertThrows(DataAccessException.class,()->jdbc.update("UPDATE referral_schema.member SET parent_id=? WHERE user_id=?",root,root));
        UUID bad=UUID.randomUUID();
        assertThrows(DataAccessException.class,()->jdbc.update("INSERT INTO referral_schema.member(user_id,code,path,registered_at,terms_version,registration_hash) VALUES (?, 'BCDEFGHJKLMNPQRS',?::uuid[],now(),'test','hash')",bad,"{"+root+","+bad+"}"));
    }
}
