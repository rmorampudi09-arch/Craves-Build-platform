package in.craves.subscription.credit;

import static org.junit.jupiter.api.Assertions.*;

import in.craves.subscription.credit.DayCreditRepository.DayCredit;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** One choice per declined day or per resume: refund request or days added at the end. */
@EnabledIfEnvironmentVariable(named="SUBSCRIPTION_TEST_JDBC_URL",matches=".+")
@ResourceLock("disposable-subscription-migration-schema")
class DayCreditDatabaseTest {
    JdbcTemplate db;DayCreditRepository repository;
    UUID plan=UUID.randomUUID(),subscription=UUID.randomUUID(),customer=UUID.randomUUID(),chef=UUID.randomUUID();
    Instant now=Instant.parse("2026-10-14T10:00:00Z");
    static LocalDate d(String monthDay){return LocalDate.parse("2026-"+monthDay);}

    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url=System.getenv("SUBSCRIPTION_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("SUBSCRIPTION_TEST_DB_USER"),System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db=new JdbcTemplate(ds);
        assertEquals("subscription_schema_test",db.queryForObject("SELECT current_database()",String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history").locations("classpath:db/migration").load().migrate();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount) VALUES (?,?,?,'TEST plan','MONTHLY',2800)",plan,"TEST-"+plan,chef);
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date,next_billing_date) VALUES (?,?,?,?,'ACTIVE',?,?)",subscription,customer,plan,chef,d("10-13"),d("11-10"));
        repository=new DayCreditRepository(db);
    }

    @Test void insertPendingThenListForCustomer() {
        Optional<UUID> id=repository.insertPending(subscription,"DECLINE",d("10-14"),d("10-14"),"LUNCH",null,now.plus(48,ChronoUnit.HOURS));
        assertTrue(id.isPresent());
        List<DayCredit> credits=repository.listForCustomer(subscription,now.minus(30,ChronoUnit.DAYS));
        assertEquals(1,credits.size());
        DayCredit credit=credits.get(0);
        assertEquals(id.get(),credit.id());
        assertEquals("DECLINE",credit.kind());
        assertEquals(d("10-14"),credit.firstDate());
        assertEquals("LUNCH",credit.mealSlotCode());
        assertNull(credit.days());
        assertEquals("PENDING_CHOICE",credit.status());
        assertNull(credit.refundAmount());
        assertNull(credit.chosenBy());
        assertEquals(now.plus(48,ChronoUnit.HOURS),credit.choiceDeadline());
    }

    @Test void secondDeclineChoiceForTheSameDayIsIgnored() {
        assertTrue(repository.insertPending(subscription,"DECLINE",d("10-14"),d("10-14"),"LUNCH",null,now).isPresent());
        assertTrue(repository.insertPending(subscription,"DECLINE",d("10-14"),d("10-14"),"DINNER",null,now).isEmpty());
        assertEquals(1,db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_day_credit",Integer.class));
    }

    @Test void settleOnlyMovesAPendingChoice() {
        UUID id=repository.insertPending(subscription,"PAUSE",d("10-20"),d("10-22"),null,3,now).orElseThrow();
        assertTrue(repository.settle(id,"EXTENDED","CUSTOMER"));
        assertFalse(repository.settle(id,"REFUND_REQUESTED","SYSTEM"));
        DayCredit credit=repository.lockForSubscription(id,subscription).orElseThrow();
        assertEquals("EXTENDED",credit.status());
        assertEquals("CUSTOMER",credit.chosenBy());
        assertNotNull(credit.chosenAt());
        assertTrue(repository.lockForSubscription(id,UUID.randomUUID()).isEmpty(),"another plan's choice is never found");
    }

    @Test void dueDeadlinesReturnsOnlyOverduePending() {
        UUID overdue=repository.insertPending(subscription,"DECLINE",d("10-14"),d("10-14"),"LUNCH",null,now.minusSeconds(1)).orElseThrow();
        repository.insertPending(subscription,"DECLINE",d("10-15"),d("10-15"),"LUNCH",null,now.plusSeconds(60)).orElseThrow();
        UUID settled=repository.insertPending(subscription,"DECLINE",d("10-16"),d("10-16"),"LUNCH",null,now.minusSeconds(5)).orElseThrow();
        repository.settle(settled,"EXTENDED","SYSTEM");
        assertEquals(List.of(overdue),repository.dueDeadlines(now,10).stream().map(DayCredit::id).toList());
    }
}
