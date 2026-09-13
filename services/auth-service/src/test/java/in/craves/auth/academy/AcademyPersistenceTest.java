package in.craves.auth.academy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import java.util.stream.StreamSupport;
import static org.junit.jupiter.api.Assertions.*;

/** Runs only against an explicitly named disposable CI database, never a production database. */
@EnabledIfEnvironmentVariable(named="ACADEMY_TEST_JDBC_URL",matches="jdbc:postgresql://.+/craves_academy_ci")
class AcademyPersistenceTest {
    static JdbcTemplate db; static AcademyService service; static AcademyCatalog catalog; static TransactionTemplate tx;
    @BeforeAll static void setup() throws Exception {
        var source=new DriverManagerDataSource(System.getenv("ACADEMY_TEST_JDBC_URL"),System.getenv("ACADEMY_TEST_DB_USER"),System.getenv("ACADEMY_TEST_DB_PASSWORD"));
        db=new JdbcTemplate(source);db.execute("DROP SCHEMA IF EXISTS academy_schema CASCADE");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V7__craves_academy.sql")).execute(source);
        var mapper=new ObjectMapper();catalog=new AcademyCatalog(mapper);service=new AcademyService(db,mapper,catalog);
        tx=new TransactionTemplate(new DataSourceTransactionManager(source));
    }
    @BeforeEach void clear(){db.execute("TRUNCATE academy_schema.learner,academy_schema.roadmap,academy_schema.audit CASCADE");}
    private <T>T run(Supplier<T> f){return tx.execute(s->f.get());}
    private List<Integer> answers(String course,String lesson){return StreamSupport.stream(catalog.lesson(course,lesson).path("questions").spliterator(),false).map(q->q.path("answer").asInt()).toList();}
    private JsonNode pass(UUID id,UUID receipt,String course,String lesson){return run(()->service.submit(id,receipt,course,lesson,catalog.version(),answers(course,lesson)));}
    private List<String> lessonIds(String course){return StreamSupport.stream(catalog.course(course).path("lessons").spliterator(),false).map(l->l.path("id").asText()).toList();}
    @Test void retryIsIdempotentAndAnswersCannotBeChangedUnderSameReceipt(){
        UUID id=UUID.randomUUID(),receipt=UUID.randomUUID();var first=pass(id,receipt,"auth","auth-identity");
        assertEquals(40,first.path("earnedXp").asInt());assertEquals(first,pass(id,receipt,"auth","auth-identity"));
        var changed=new ArrayList<>(answers("auth","auth-identity"));changed.set(0,(changed.get(0)+1)%4);
        assertThrows(ResponseStatusException.class,()->run(()->service.submit(id,receipt,"auth","auth-identity",catalog.version(),changed)));
        assertEquals(40L,run(()->service.state(id)).get("xp"));
    }
    @Test void courseBonusAwardedOnceAndLearnersRemainIsolated(){
        UUID id=UUID.randomUUID();var lessons=lessonIds("auth");
        assertTrue(lessons.size()>=2);
        for(int i=0;i<lessons.size()-1;i++)assertEquals(40,pass(id,UUID.randomUUID(),"auth",lessons.get(i)).path("earnedXp").asInt());
        String finalLesson=lessons.get(lessons.size()-1);
        assertEquals(160,pass(id,UUID.randomUUID(),"auth",finalLesson).path("earnedXp").asInt());
        db.update("UPDATE academy_schema.attempt SET created_at=now()-interval '1 minute'");
        assertEquals(0,pass(id,UUID.randomUUID(),"auth",finalLesson).path("earnedXp").asInt());
        assertEquals(lessons.size()*40L+120L,run(()->service.state(id)).get("xp"));
        assertEquals(0L,run(()->service.state(UUID.randomUUID())).get("xp"));
    }
    @Test void concurrentDuplicateRequestsCannotDuplicateXp() throws Exception {
        UUID id=UUID.randomUUID(),receipt=UUID.randomUUID();
        try(var pool=Executors.newFixedThreadPool(4)){
            var tasks=new ArrayList<Callable<JsonNode>>();for(int i=0;i<4;i++)tasks.add(()->pass(id,receipt,"auth","auth-identity"));
            for(var f:pool.invokeAll(tasks))assertEquals(40,f.get().path("earnedXp").asInt());
        }
        assertEquals(1,db.queryForObject("SELECT count(*) FROM academy_schema.attempt",Integer.class));
        assertEquals(40L,run(()->service.state(id)).get("xp"));
    }
    @Test void staleVersionsAndIncompleteQuizzesAreRejected(){
        UUID id=UUID.randomUUID();assertThrows(ResponseStatusException.class,()->run(()->service.submit(id,UUID.randomUUID(),"auth","auth-identity","old",List.of(0,0))));
        assertThrows(ResponseStatusException.class,()->run(()->service.submit(id,UUID.randomUUID(),"auth","auth-identity",catalog.version(),List.of(0))));
    }
    @Test void preferencesResetOnlyTheModelAndRapidHeartbeatsCannotFarmTime(){
        UUID id=UUID.randomUUID();pass(id,UUID.randomUUID(),"auth","auth-identity");
        run(()->{service.preferences(id,false);return null;});var state=run(()->service.state(id));
        assertEquals(false,state.get("personalized"));assertEquals(40L,state.get("xp"));assertEquals(List.of(),state.get("recommendations"));
        for(int i=0;i<4;i++)run(()->{service.event(id,UUID.randomUUID(),"auth","auth-identity","ACTIVE_HEARTBEAT");return null;});
        assertEquals(0L,run(()->service.state(id)).get("activeSeconds"));
        db.update("UPDATE academy_schema.activity SET created_at=now()-interval '31 seconds'");
        run(()->{service.event(id,UUID.randomUUID(),"auth","auth-identity","ACTIVE_HEARTBEAT");return null;});
        assertEquals(30L,run(()->service.state(id)).get("activeSeconds"));
    }
    @Test void privatePlansUseOptimisticConcurrencyAndRetentionPreservesXp(){
        UUID actor=UUID.randomUUID(),plan=UUID.randomUUID();
        run(()->{service.savePlan(actor,plan,"Example plan","platform","CI-only example, not a Craves plan","PROPOSED",0);return null;});
        assertThrows(ResponseStatusException.class,()->run(()->{service.savePlan(actor,plan,"Other","platform","stale write","APPROVED",0);return null;}));
        run(()->{service.savePlan(actor,plan,"Example plan","platform","Reviewed test","APPROVED",1);return null;});
        assertThrows(ResponseStatusException.class,()->run(()->{service.deletePlan(actor,plan,1);return null;}));
        pass(actor,UUID.randomUUID(),"auth","auth-identity");
        run(()->{service.event(actor,UUID.random.randomUUID(),"auth","auth-identity","LESSON_OPEN");return null;});
        db.update("UPDATE academy_schema.activity SET created_at=now()-interval '91 days'");
        db.update("UPDATE academy_schema.attempt SET created_at=now()-interval '366 days'");
        run(()->{service.retention();return null;});
        assertEquals(0,db.queryForObject("SELECT count(*) FROM academy_schema.activity",Integer.class));
        assertEquals(0,db.queryForObject("SELECT count(*) FROM academy_schema.attempt",Integer.class));
        assertEquals(40L,run(()->service.state(actor)).get("xp"));
        run(()->{service.deletePlan(actor,plan,2);return null;});assertTrue(service.plans().isEmpty());
    }
}
