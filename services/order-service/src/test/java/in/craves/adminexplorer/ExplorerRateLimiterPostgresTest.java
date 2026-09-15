package in.craves.adminexplorer;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="EXPLORER_TEST_DB_URL",matches="jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/craves_explorer_test")
class ExplorerRateLimiterPostgresTest {
    DriverManagerDataSource source;
    JdbcTemplate jdbc;
    ExplorerRateLimiter limiter;

    @BeforeEach void setup() throws Exception {
        source=new DriverManagerDataSource(System.getenv("EXPLORER_TEST_DB_URL"),"postgres","postgres");
        jdbc=new JdbcTemplate(source);
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS order_schema; DROP TABLE IF EXISTS "+ExplorerRateLimiter.TABLE);
        try(var stream=getClass().getResourceAsStream(ExplorerFixture.ADMISSION_MIGRATION)) {
            assertNotNull(stream); jdbc.execute(new String(stream.readAllBytes(),StandardCharsets.UTF_8));
        }
        limiter=new ExplorerRateLimiter(source);
    }
    int count() { return jdbc.queryForObject("SELECT count(*) FROM "+ExplorerRateLimiter.TABLE,Integer.class); }
    void fill(int n) { for(int i=0;i<n;i++)limiter.admit(); }

    @Test void twentyAdmissionsThen429WithRetryAfter() {
        fill(20);
        var error=assertThrows(ExplorerRateLimiter.Limited.class,limiter::admit);
        assertTrue(error.retryAfter()>=1 && error.retryAfter()<=60);assertEquals(20,count());
    }
    @Test void newServiceInstanceCannotResetTheBudget() {
        fill(20);
        assertThrows(ExplorerRateLimiter.Limited.class,()->new ExplorerRateLimiter(source).admit());
        assertEquals(20,count());
    }
    @Test void onlyExpiredAdmissionsLeaveTheRollingWindow() {
        fill(20);
        jdbc.update("UPDATE "+ExplorerRateLimiter.TABLE+" SET admitted_at=clock_timestamp()-interval '61 seconds' WHERE id=(SELECT id FROM "+ExplorerRateLimiter.TABLE+" LIMIT 1)");
        limiter.admit();assertEquals(20,count());
        assertThrows(ExplorerRateLimiter.Limited.class,limiter::admit);
    }
    @Test void parallelInstancesCannotOverrunTheSharedBudget() throws Exception {
        fill(18);
        var ready=new CountDownLatch(12);var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(12)) {
            var results=new ArrayList<Future<Boolean>>();
            for(int i=0;i<12;i++)results.add(pool.submit(()->{
                ready.countDown();assertTrue(start.await(5,TimeUnit.SECONDS));
                try {new ExplorerRateLimiter(source).admit();return true;}
                catch(ExplorerRateLimiter.Limited expected){return false;}
            }));
            assertTrue(ready.await(5,TimeUnit.SECONDS));start.countDown();
            int accepted=0;for(var result:results)if(result.get(5,TimeUnit.SECONDS))accepted++;
            assertTrue(accepted>0 && accepted<=2);assertEquals(18+accepted,count());
            while(count()<20)limiter.admit();
            assertThrows(ExplorerRateLimiter.Limited.class,limiter::admit);
        }
    }
    @Test void contendedAdmissionDoesNotWaitForAnotherTransaction() throws Exception {
        try(var connection=source.getConnection()) {
            connection.setAutoCommit(false);
            try(var statement=connection.prepareStatement("SELECT pg_advisory_xact_lock(?, ?)")) {
                statement.setInt(1,ExplorerRateLimiter.LOCK_NAMESPACE);statement.setInt(2,ExplorerRateLimiter.LOCK_DATASET);statement.execute();
            }
            assertTimeoutPreemptively(Duration.ofSeconds(2),()->{
                assertEquals(1,assertThrows(ExplorerRateLimiter.Limited.class,limiter::admit).retryAfter());
            });
            assertEquals(0,count());connection.rollback();
        }
        limiter.admit();assertEquals(1,count());
    }
    @Test void outerRollbackCannotRefundAnAdmission() {
        var outer=new TransactionTemplate(new DataSourceTransactionManager(source));
        outer.executeWithoutResult(tx->{limiter.admit();tx.setRollbackOnly();});
        assertEquals(1,count());
    }
    @Test void missingCounterFailsClosedBeforeAnyReportAudit() {
        jdbc.execute("DROP TABLE "+ExplorerRateLimiter.TABLE);
        assertThrows(RuntimeException.class,limiter::admit);
        assertThrows(RuntimeException.class,()->new ExplorerEngine(source).read(UUID.randomUUID(),
            ExplorerQuery.parse(ExplorerQueryTest.normal(),ExplorerDomain.DATASET,ExplorerQueryTest.NOW)));
    }
    @Test void failedReportStillConsumesAdmission() {
        jdbc.execute("DROP TABLE IF EXISTS "+ExplorerDomain.AUDIT+" CASCADE; DROP TABLE IF EXISTS "+ExplorerFixture.TABLE+" CASCADE");
        assertThrows(RuntimeException.class,()->new ExplorerEngine(source).read(UUID.randomUUID(),
            ExplorerQuery.parse(ExplorerQueryTest.normal(),ExplorerDomain.DATASET,ExplorerQueryTest.NOW)));
        assertEquals(1,count());
    }
}
