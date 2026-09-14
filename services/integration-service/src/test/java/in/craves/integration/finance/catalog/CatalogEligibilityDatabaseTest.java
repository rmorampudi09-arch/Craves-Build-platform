package in.craves.integration.finance.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.*;
import in.craves.integration.finance.source.ChefTaxProfileService;
import in.craves.integration.security.CravesPrincipal;
import java.time.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="CRAVES_CATALOG_DISPOSABLE_DATABASE",matches="true")
class CatalogEligibilityDatabaseTest {
    JdbcTemplate jdbc; ChefTaxProfileService profiles; CatalogEligibilityService service; TransactionTemplate read;
    final CravesPrincipal actor=new CravesPrincipal(UUID.randomUUID(),"",Set.of("PAYMENTS_ADMIN"));
    @BeforeEach void setup() {
        assertEquals("true",System.getenv("GITHUB_ACTIONS"),"Disposable CI only; never a local production tunnel");
        String url=System.getenv("CATALOG_TEST_JDBC_URL"); assertEquals("jdbc:postgresql://localhost:5432/catalog_finance_test",url);
        var ds=new DriverManagerDataSource(url,"postgres",System.getenv("CATALOG_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds); jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE"); jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        var flyway=Flyway.configure().dataSource(ds).schemas("payment_schema").defaultSchema("payment_schema").locations("classpath:db/migration").load();
        flyway.migrate(); assertEquals(0,flyway.migrate().migrationsExecuted); flyway.validate();
        profiles=new ChefTaxProfileService(jdbc,new ObjectMapper().findAndRegisterModules());
        var policies=mock(FinancePolicyService.class);
        var enabled=new FinancePolicy(LocalDate.now(FinancePolicy.ZONE),true,false,false,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0",false,"DISPOSABLE-CI-ONLY");
        when(policies.current()).thenReturn(new FinancePolicyService.View(1,UUID.randomUUID(),enabled,List.of(),"TEST",1));
        service=new CatalogEligibilityService(policies,profiles);
        read=new TransactionTemplate(new DataSourceTransactionManager(ds)); read.setReadOnly(true); read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);read.setTimeout(5);
    }
    ChefTaxProfileService.Profile profile(LocalDate date,String turnover) {
        int year=date.getMonthValue()<4?date.getYear()-1:date.getYear();
        return new ChefTaxProfileService.Profile("36","RESTAURANT_ECO_9_5","UNREGISTERED",null,turnover,year+"-"+String.format("%02d",(year+1)%100),date,"0","DISPOSABLE-CI-ONLY","DISPOSABLE-CI-ONLY","DISPOSABLE-CI-ONLY");
    }
    CatalogEligibilityService.Snapshot evaluate() {return read.execute(s->service.evaluate(UUID.randomUUID()));}
    @Test void actualCurrentYearProfilesAndImmutableVersionsControlCompleteReadOnlyAuthority() {
        assertTrue(evaluate().eligibleChefIds().isEmpty());
        UUID eligible=UUID.randomUUID(),review=UUID.randomUUID(),old=UUID.randomUUID(); LocalDate today=LocalDate.now(FinancePolicy.ZONE);
        profiles.save(actor,eligible,profile(today,"100.00"),"Disposable valid fixture");
        profiles.save(actor,review,profile(today,"2000000.01"),"Disposable review hold fixture");
        profiles.save(actor,old,profile(today.minusYears(1),"100.00"),"Disposable prior-year fixture");
        var resolvedBatch=profiles.resolvedBatch(1000);
        assertTrue(resolvedBatch.complete());assertEquals(2,resolvedBatch.versions().size());
        assertTrue(resolvedBatch.versions().contains(profiles.resolved(eligible)));
        assertTrue(resolvedBatch.versions().contains(profiles.resolved(review)));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->profiles.resolved(old));
        long versions=jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_chef_tax_version",Long.class);
        var first=evaluate(); assertTrue(first.complete()); assertEquals(List.of(eligible),first.eligibleChefIds());
        assertEquals(first.hash(),evaluate().hash());
        assertEquals(versions,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_chef_tax_version",Long.class));
        profiles.save(actor,eligible,profile(today,"2000000.01"),"Disposable revocation fixture");
        var revoked=evaluate(); assertTrue(revoked.complete());assertTrue(revoked.eligibleChefIds().isEmpty());assertNotEquals(first.hash(),revoked.hash());
        assertEquals(4L,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_chef_tax_version",Long.class));
        assertEquals(0L,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_payout_instruction",Long.class));
    }
}
