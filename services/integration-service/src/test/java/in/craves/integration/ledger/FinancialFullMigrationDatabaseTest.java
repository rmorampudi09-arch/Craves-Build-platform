package in.craves.integration.ledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.settlement.ChefFinancialRepository;
import in.craves.integration.settlement.ChefFinancialModels.CreateEarningRequest;
import in.craves.integration.settlement.ChefFinancialModels.CreateSettlementBatchRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class FinancialFullMigrationDatabaseTest {
    DriverManagerDataSource isolatedDatabase() {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        var jdbc=new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        jdbc.execute("DROP TABLE IF EXISTS public.flyway_schema_history");
        return ds;
    }
    Flyway flyway(DriverManagerDataSource ds,String target) {
        var config=Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema")
            .table("flyway_schema_history").locations("classpath:db/migration");
        if(target!=null) config.target(target);
        return config.load();
    }
    @Test void entireIntegrationMigrationChainAppliesAndValidatesTwice() {
        var ds=isolatedDatabase();var jdbc=new JdbcTemplate(ds);var flyway=flyway(ds,null);
        var first=flyway.migrate();
        assertTrue(first.success);assertTrue(first.migrationsExecuted>20);
        flyway.validate();assertEquals(0,flyway.migrate().migrationsExecuted);
        assertTrue(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='payment_schema' AND table_name='ledger_transaction')",Boolean.class));
        assertTrue(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='payment_schema' AND table_name='chef_settlement_item' AND column_name='active_reservation')",Boolean.class));
    }
    @Test void upgradePreservesHistoricalFailedBatchAndReleasesItsReservation() {
        var ds=isolatedDatabase();flyway(ds,"120").migrate();
        var jdbc=new JdbcTemplate(ds);var tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        var repository=new ChefFinancialRepository(jdbc,new ObjectMapper().findAndRegisterModules());
        UUID actor=UUID.randomUUID(),chef=UUID.randomUUID();
        var earning=tx.execute(status->{
            var created=repository.create(new CreateEarningRequest(UUID.randomUUID(),chef,"ON_DEMAND","INR",
                new BigDecimal("369.00"),new BigDecimal("25.83"),BigDecimal.ZERO,BigDecimal.ZERO,new BigDecimal("343.17"),
                "legacy/"+UUID.randomUUID(),"Historical approved allocation"),actor);
            return repository.approve(created.id(),actor,"Historical approval");
        });
        var batch=tx.execute(status->repository.createBatch(new CreateSettlementBatchRequest("legacy-batch/"+UUID.randomUUID(),"INR",List.of(earning.id()),"Historical reservation"),actor));
        tx.execute(status->{repository.changeBatchStatus(batch.id(),"SUBMITTED","legacy-external",actor,"Historical submission");
            repository.changeBatchStatus(batch.id(),"FAILED",null,actor,"Historical confirmed no-debit failure");return null;});
        assertThrows(RuntimeException.class,()->tx.execute(status->repository.createBatch(new CreateSettlementBatchRequest("before-upgrade","INR",List.of(earning.id()),"Cannot re-reserve under old uniqueness"),actor)));
        var latest=flyway(ds,null);assertTrue(latest.migrate().success);latest.validate();
        var retry=tx.execute(status->repository.createBatch(new CreateSettlementBatchRequest("after-upgrade","INR",List.of(earning.id()),"Re-reserved without deleting history"),actor));
        assertNotEquals(batch.id(),retry.id());assertEquals("FAILED",repository.getBatch(batch.id()).status());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM payment_schema.chef_settlement_item WHERE earning_entry_id=?",Integer.class,earning.id()));
        assertEquals(new BigDecimal("25.83"),repository.get(earning.id()).commissionAmount());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.ledger_transaction",Integer.class));
    }
}
