package in.craves.integration.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.security.CravesPrincipal;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class FinancePolicyDatabaseTest {
    JdbcTemplate jdbc;TransactionTemplate tx;FinancePolicyService service;
    final CravesPrincipal admin=new CravesPrincipal(UUID.randomUUID(),"",Set.of("PAYMENTS_ADMIN"));
    @BeforeEach void setup() {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema").locations("classpath:db/migration").load().migrate();
        service=new FinancePolicyService(jdbc,new ObjectMapper().findAndRegisterModules(),false,false,false);
    }
    @Test void defaultIsAnUnactivatedRequestedCutoverNotProductionEvidence() {
        var view=service.view(admin);assertEquals(0,view.revision());assertNull(view.policyId());
        assertFalse(view.settings().ledgerEnabled());assertEquals(LocalDate.of(2026,9,14),view.settings().ledgerStartDate());
        assertEquals(1,view.maximumManualRequestsPerIstDay());assertFalse(view.activationBlockers().isEmpty());
    }
    @Test void saveThenActivateRequiresExactRevisionAndHash() {
        var draft=tx.execute(s->service.draft(admin,new FinancePolicyService.DraftRequest(FinancePolicy.launchDraft(),"Test inactive configuration")));
        var first=tx.execute(s->service.activate(admin,draft.id(),new FinancePolicyService.ActivateRequest(0,draft.contentHash(),"Reviewed inactive controls")));
        assertEquals(1,first.revision());assertFalse(first.settings().ledgerEnabled());
        assertThrows(RuntimeException.class,()->tx.execute(s->service.activate(admin,draft.id(),new FinancePolicyService.ActivateRequest(0,draft.contentHash(),"Stale edit"))));
        assertThrows(RuntimeException.class,()->tx.execute(s->service.activate(admin,draft.id(),new FinancePolicyService.ActivateRequest(1,"b".repeat(64),"Changed content"))));
        assertEquals(1,service.current().revision());
    }
    @Test void activatedPolicyAndAuditCannotBeEdited() {
        var draft=tx.execute(s->service.draft(admin,new FinancePolicyService.DraftRequest(FinancePolicy.launchDraft(),"Test immutable policy")));
        tx.execute(s->service.activate(admin,draft.id(),new FinancePolicyService.ActivateRequest(0,draft.contentHash(),"Test activation")));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.finance_policy_version SET payload='{}'::jsonb WHERE id=?",draft.id()));
        assertThrows(RuntimeException.class,()->jdbc.execute("DELETE FROM payment_schema.finance_policy_activation"));
    }
    @Test void switchingOnCannotBypassUnbuiltSourceOrPayoutCertification() {
        var enabled=new FinancePolicy(LocalDate.of(2026,9,14),true,true,true,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0",true,"TEST-ONLY");
        var draft=tx.execute(s->service.draft(admin,new FinancePolicyService.DraftRequest(enabled,"Candidate, not certification")));
        assertThrows(RuntimeException.class,()->tx.execute(s->service.activate(admin,draft.id(),new FinancePolicyService.ActivateRequest(0,draft.contentHash(),"Cannot bypass release gate"))));
        assertFalse(service.current().settings().ledgerEnabled());
    }
    @Test void chefCannotReadPolicyAndAuditRoleCannotActivate() {
        assertThrows(RuntimeException.class,()->service.view(new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"))));
        var auditor=new CravesPrincipal(UUID.randomUUID(),"",Set.of("AUDIT_ADMIN"));assertNotNull(service.view(auditor));
        assertThrows(RuntimeException.class,()->service.draft(auditor,new FinancePolicyService.DraftRequest(FinancePolicy.launchDraft(),"Not allowed")));
    }
}
