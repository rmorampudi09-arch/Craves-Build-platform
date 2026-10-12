package in.craves.subscription.occurrence;

import static org.junit.jupiter.api.Assertions.*;

import in.craves.subscription.occurrence.OccurrenceRepository.ActiveSchedule;
import in.craves.subscription.occurrence.OccurrenceRepository.ClaimedSubscription;
import in.craves.subscription.occurrence.OccurrenceRepository.ScheduleItem;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** A meal a pause cancelled must come back when the generator reaches its date after the resume. */
@EnabledIfEnvironmentVariable(named="SUBSCRIPTION_TEST_JDBC_URL",matches=".+")
@ResourceLock("disposable-subscription-migration-schema")
class OccurrenceResumeDatabaseTest {
    JdbcTemplate db;TransactionTemplate tx;OccurrenceRepository repository;
    UUID plan=UUID.randomUUID(),subscription=UUID.randomUUID(),customer=UUID.randomUUID(),chef=UUID.randomUUID(),address=UUID.randomUUID();
    UUID oldDish=UUID.randomUUID(),dish=UUID.randomUUID(),meal=UUID.randomUUID();
    LocalDate day=LocalDate.parse("2026-10-15");Instant noon=Instant.parse("2026-10-15T06:30:00Z");

    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url=System.getenv("SUBSCRIPTION_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("SUBSCRIPTION_TEST_DB_USER"),System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        // Same Instant binding as the app's JdbcInstantConfiguration template.
        db=new JdbcTemplate(ds){@Override protected org.springframework.jdbc.core.PreparedStatementSetter newArgPreparedStatementSetter(Object[] args){
            return super.newArgPreparedStatementSetter(args==null?null:java.util.Arrays.stream(args).map(a->a instanceof Instant i?java.sql.Timestamp.from(i):a).toArray());}};
        tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        assertEquals("subscription_schema_test",db.queryForObject("SELECT current_database()",String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history").locations("classpath:db/migration").load().migrate();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount) VALUES (?,?,?,'TEST plan','WEEKLY',300)",plan,"TEST-"+plan,chef);
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date,delivery_address_id) VALUES (?,?,?,?,'ACTIVE',?,?)",subscription,customer,plan,chef,LocalDate.parse("2026-10-05"),address);
        db.update("INSERT INTO subscription_schema.subscription_invoice(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,cycle_start,cycle_end,amount,currency,status) VALUES (?,?,?,?,?,?,?,300,'INR','PAID')",UUID.randomUUID(),subscription,plan,customer,chef,LocalDate.parse("2026-10-12"),LocalDate.parse("2026-10-19"));
        repository=new OccurrenceRepository(db);
    }
    void existingMeal(String status) {
        db.update("INSERT INTO subscription_schema.subscription_occurrence(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,delivery_address_id,service_date,service_at,schedule_version,status,meal_slot_code) VALUES (?,?,?,?,?,?,?,?,1,?,'LUNCH')",
            meal,subscription,plan,customer,chef,UUID.randomUUID(),day,java.sql.Timestamp.from(noon.minusSeconds(3600)),status);
        db.update("INSERT INTO subscription_schema.subscription_occurrence_item(id,occurrence_id,menu_item_id,quantity,sequence_number,created_at) VALUES (?,?,?,1,1,now())",UUID.randomUUID(),meal,oldDish);
    }
    UUID generate() {
        var claimed=new ClaimedSubscription(subscription,customer,plan,chef,address,day,UUID.randomUUID());
        var item=new ScheduleItem(dish,2,day.getDayOfWeek().getValue(),null,"LUNCH",LocalTime.of(12,0),1);
        var schedule=new ActiveSchedule(plan,"WEEKLY","Asia/Kolkata",LocalTime.of(12,0),48,2,List.of(item));
        return tx.execute(s->repository.createOccurrence(claimed,schedule,day,"LUNCH",noon,List.of(item),null));
    }
    String mealField(String column){return db.queryForObject("SELECT "+column+"::text FROM subscription_schema.subscription_occurrence WHERE id=?",String.class,meal);}

    @Test void mealCancelledByThePauseIsRestoredWhenRegenerated() {
        existingMeal("CANCELLED");
        db.update("INSERT INTO subscription_schema.subscription_capacity_allocation(id,subscription_id,chef_identity_id,service_date,meal_slot_code,menu_item_id,units,status) VALUES (?,?,?,?,'LUNCH',?,2,'COMMITTED')",
            UUID.randomUUID(),subscription,chef,day,dish);

        assertEquals(meal,generate());

        assertEquals("READY_FOR_ORDER",mealField("status"));
        assertEquals(address.toString(),mealField("delivery_address_id"));
        assertEquals("2",mealField("schedule_version"));
        assertEquals(noon,db.queryForObject("SELECT service_at FROM subscription_schema.subscription_occurrence WHERE id=?",java.sql.Timestamp.class,meal).toInstant());
        assertEquals(List.of(dish),db.queryForList("SELECT menu_item_id FROM subscription_schema.subscription_occurrence_item WHERE occurrence_id=?",UUID.class,meal));
        assertEquals(List.of("CANCELLED>READY_FOR_ORDER"),db.queryForList(
            "SELECT old_status||'>'||new_status FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id=?",String.class,meal));
        assertEquals("MATERIALIZED",db.queryForObject("SELECT status FROM subscription_schema.subscription_capacity_allocation WHERE subscription_id=?",String.class,subscription));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_occurrence WHERE subscription_id=?",Integer.class,subscription));
    }

    @Test void aMealThatWasNotCancelledIsLeftAlone() {
        existingMeal("READY_FOR_ORDER");

        assertNull(generate());

        assertEquals(List.of(oldDish),db.queryForList("SELECT menu_item_id FROM subscription_schema.subscription_occurrence_item WHERE occurrence_id=?",UUID.class,meal));
        assertEquals(0,db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id=?",Integer.class,meal));
    }
}
