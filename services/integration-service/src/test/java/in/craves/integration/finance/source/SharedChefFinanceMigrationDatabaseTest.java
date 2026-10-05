package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.security.CravesPrincipal;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class SharedChefFinanceMigrationDatabaseTest {
    DriverManagerDataSource ds;JdbcTemplate jdbc;ChefTaxProfileService profiles;
    final CravesPrincipal actor=new CravesPrincipal(UUID.randomUUID(),"",Set.of("PAYMENTS_ADMIN"));
    @BeforeEach void setup() {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        migration("146").migrate();profiles=new ChefTaxProfileService(jdbc,new ObjectMapper().findAndRegisterModules());
    }
    Flyway migration(String target) {
        var config=Flyway.configure().dataSource(ds).schemas("payment_schema").defaultSchema("payment_schema").locations("classpath:db/migration");
        if(target!=null)config.target(target);return config.load();
    }
    ChefTaxProfileService.Version profile(String rate,LocalDate day) {
        int year=day.getMonthValue()<4?day.getYear()-1:day.getYear();
        return profiles.save(actor,UUID.randomUUID(),new ChefTaxProfileService.Profile("36","RESTAURANT_ECO_9_5","UNREGISTERED",null,
            "100.00",year+"-"+String.format("%02d",(year+1)%100),day,rate,"TEST_REVIEWED_WITHHOLDING","TEST_CLASSIFICATION","TEST_TERMS"),"Disposable actual reviewed terms");
    }
    @Test void upgradePromotesOnlyExistingUnanimousCurrentYearTermsAndKeepsHistory() {
        var one=profile("0",LocalDate.now(FinancePolicy.ZONE));var two=profile("0.0",LocalDate.now(FinancePolicy.ZONE));
        String before=jdbc.queryForObject("SELECT jsonb_agg(payload ORDER BY id)::text FROM payment_schema.finance_chef_tax_version",String.class);
        long revision=jdbc.queryForObject("SELECT revision FROM payment_schema.finance_policy_head",Long.class);
        var migration=migration(null);assertEquals(1,migration.migrate().migrationsExecuted);migration.validate();assertEquals(0,migration.migrate().migrationsExecuted);
        assertEquals("0.000000",jdbc.queryForObject("SELECT withholding_rate::text FROM payment_schema.finance_shared_chef_terms_version",String.class));
        var sources=jdbc.queryForObject("SELECT source_profile_ids::text FROM payment_schema.finance_shared_chef_terms_version",String.class);
        assertTrue(sources.contains(one.id().toString()));assertTrue(sources.contains(two.id().toString()));
        assertEquals(before,jdbc.queryForObject("SELECT jsonb_agg(payload ORDER BY id)::text FROM payment_schema.finance_chef_tax_version",String.class));
        assertEquals(revision,jdbc.queryForObject("SELECT revision FROM payment_schema.finance_policy_head",Long.class));
        assertThrows(RuntimeException.class,()->jdbc.update("DELETE FROM payment_schema.finance_shared_chef_terms_version"));
    }
    @Test void differingIndividualRatesDoNotSilentlyChooseANewCommonRate() {
        profile("0",LocalDate.now(FinancePolicy.ZONE));profile("1",LocalDate.now(FinancePolicy.ZONE));migration(null).migrate();
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_shared_chef_terms_version",Integer.class));
        assertNull(jdbc.queryForObject("SELECT version_id FROM payment_schema.finance_shared_chef_terms_head",UUID.class));
    }
    @Test void absentOrStaleReviewsDoNotManufactureWithholdingDeclarations() {
        profile("0",LocalDate.now(FinancePolicy.ZONE).minusYears(1));migration(null).migrate();
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_shared_chef_terms_version",Integer.class));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_chef_tax_version",Integer.class));
    }
}
