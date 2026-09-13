package in.craves.integration.ledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.settlement.ChefFinancialRepository;
import in.craves.integration.settlement.ChefFinancialModels.CreateEarningRequest;
import in.craves.integration.settlement.ChefFinancialModels.CreateSettlementBatchRequest;
import in.craves.integration.settlement.ChefFinancialModels.EarningResponse;
import in.craves.integration.settlement.ChefFinancialModels.SettlementBatchResponse;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ChefSettlementHistoryDatabaseTest {
    JdbcTemplate jdbc; TransactionTemplate tx; ChefFinancialRepository repository;
    final UUID actor=UUID.randomUUID(), chef=UUID.randomUUID();
    @BeforeEach void setup() throws Exception {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds); tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE"); jdbc.execute("CREATE SCHEMA payment_schema");
        for(String migration:List.of("V105__chef_financial_ledger.sql","V121__immutable_financial_journal.sql","V122__chef_settlement_history_controls.sql")) {
            String sql=new ClassPathResource("db/migration/"+migration).getContentAsString(StandardCharsets.UTF_8);
            try(Connection c=ds.getConnection();var statement=c.createStatement()) {statement.execute(sql);}
        }
        repository=new ChefFinancialRepository(jdbc,new ObjectMapper().findAndRegisterModules());
    }
    EarningResponse earning(UUID owner) {
        return tx.execute(status->{
            var entry=repository.create(new CreateEarningRequest(UUID.randomUUID(),owner,"ON_DEMAND","INR",
                new BigDecimal("369.00"),new BigDecimal("25.83"),new BigDecimal("0.00"),new BigDecimal("0.00"),
                new BigDecimal("343.17"),"fixture/"+UUID.randomUUID(),"Approved test fixture"),actor);
            return repository.approve(entry.id(),actor,"Approved test fixture");
        });
    }
    SettlementBatchResponse batch(List<UUID> ids) {
        return tx.execute(status->repository.createBatch(new CreateSettlementBatchRequest("batch/"+UUID.randomUUID(),"INR",ids,"Test reservation"),actor));
    }
    SettlementBatchResponse transition(UUID id,String target) {
        return tx.execute(status->repository.changeBatchStatus(id,target,"external/"+id,actor,"Test evidence of definitive outcome"));
    }
    long count(String sql,Object... args) {return jdbc.queryForObject(sql,Long.class,args);}
    @Test void failedBatchCanBeRebatchedWithoutDeletingHistory() {
        var entry=earning(chef); var first=batch(List.of(entry.id()));
        transition(first.id(),"SUBMITTED"); transition(first.id(),"FAILED");
        var second=batch(List.of(entry.id()));
        assertNotEquals(first.id(),second.id());
        assertEquals(2,count("SELECT count(*) FROM payment_schema.chef_settlement_item WHERE earning_entry_id=?",entry.id()));
        assertEquals(1,count("SELECT count(*) FROM payment_schema.chef_settlement_item WHERE earning_entry_id=? AND active_reservation",entry.id()));
        assertEquals("FAILED",repository.getBatch(first.id()).status());
        assertEquals(new BigDecimal("25.83"),repository.get(entry.id()).commissionAmount());
    }
    @Test void cancelledBatchReleasesOnlyItsReservation() {
        var entry=earning(chef);var first=batch(List.of(entry.id()));transition(first.id(),"CANCELLED");
        assertEquals("APPROVED",repository.get(entry.id()).status());
        assertNotNull(batch(List.of(entry.id())));
        assertThrows(RuntimeException.class,()->jdbc.update("DELETE FROM payment_schema.chef_settlement_item WHERE batch_id=?",first.id()));
    }
    @Test void settledEarningCannotBeReversedOrEdited() {
        var entry=earning(chef);var batch=batch(List.of(entry.id()));
        transition(batch.id(),"SUBMITTED");transition(batch.id(),"SETTLED");
        assertThrows(RuntimeException.class,()->tx.execute(status->repository.reverse(entry.id(),actor,"Should not rewrite paid history")));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.chef_earning_entry SET adjustment_amount=1,net_payable=344.17 WHERE id=?",entry.id()));
        assertEquals("SETTLED",repository.get(entry.id()).status());
        assertEquals(new BigDecimal("343.17"),repository.get(entry.id()).netPayable());
    }
    @Test void oneExternalReferenceCannotCoverTwoChefs() {
        var one=earning(chef);var two=earning(UUID.randomUUID());
        assertThrows(RuntimeException.class,()->batch(List.of(one.id(),two.id())));
        assertEquals("APPROVED",repository.get(one.id()).status());
        assertEquals("APPROVED",repository.get(two.id()).status());
        assertEquals(0,count("SELECT count(*) FROM payment_schema.chef_settlement_batch"));
    }
    @Test void concurrentReservationsCannotExceedPayable() throws Exception {
        var entry=earning(chef);
        Callable<Boolean> reserve=()->{try{batch(List.of(entry.id()));return true;}catch(RuntimeException expected){return false;}};
        try(var pool=Executors.newFixedThreadPool(2)) {
            var results=pool.invokeAll(List.of(reserve,reserve));
            assertNotEquals(results.get(0).get(),results.get(1).get());
        }
        assertEquals(1,count("SELECT count(*) FROM payment_schema.chef_settlement_item WHERE earning_entry_id=? AND active_reservation",entry.id()));
    }
    @Test void submittedBatchCannotReleaseOnUnchangedOrUnprovenWorkflow() {
        var entry=earning(chef);var batch=batch(List.of(entry.id()));transition(batch.id(),"SUBMITTED");
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.chef_settlement_item SET active_reservation=false WHERE batch_id=?",batch.id()));
        assertThrows(RuntimeException.class,()->transition(batch.id(),"CANCELLED"));
        assertEquals("SETTLEMENT_PENDING",repository.get(entry.id()).status());
    }
    @Test void confirmedHistoryCannotBeReopenedOrRefChanged() {
        var entry=earning(chef);var batch=batch(List.of(entry.id()));transition(batch.id(),"SUBMITTED");transition(batch.id(),"SETTLED");
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.chef_settlement_batch SET status='DRAFT' WHERE id=?",batch.id()));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.chef_settlement_batch SET external_reference='different' WHERE id=?",batch.id()));
    }
}
