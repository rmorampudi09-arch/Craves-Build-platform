package in.craves.integration.delivery.feedback;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import in.craves.integration.config.DeliveryIntelligenceProperties;
import in.craves.integration.delivery.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

@EnabledIfEnvironmentVariable(named="DELIVERY_FEEDBACK_TEST_JDBC_URL",matches=".+")
class DeliveryFeedbackDatabaseTest {
    static HikariDataSource ds;
    static AnnotationConfigApplicationContext app;
    static JdbcTemplate jdbc;
    static DeliveryFeedbackRepository repo;
    static DeliveryFeedbackProcessor processor;
    static DeliveryMetricsRepository metrics;
    static TransactionTemplate tx;
    @Configuration @EnableTransactionManagement static class Transactions {}
    @BeforeAll static void connect() {
        String url=System.getenv("DELIVERY_FEEDBACK_TEST_JDBC_URL");
        // Destructive fixtures can only run against the explicitly named local disposable database.
        assertThat(url).matches("jdbc:postgresql://localhost:[0-9]+/delivery_feedback_test");
        var config=new HikariConfig(); config.setJdbcUrl(url); config.setUsername("postgres");
        config.setPassword(System.getenv("DELIVERY_FEEDBACK_TEST_DB_PASSWORD"));
        config.setMaximumPoolSize(16); config.setConnectionTimeout(5000);
        ds=new HikariDataSource(config); jdbc=new JdbcTemplate(ds);
        app=new AnnotationConfigApplicationContext(); app.register(Transactions.class);
        app.registerBean(JdbcTemplate.class,()->jdbc);
        app.registerBean(DataSourceTransactionManager.class,()->new DataSourceTransactionManager(ds));
        app.registerBean(ObjectMapper.class,()->new ObjectMapper().findAndRegisterModules());
        app.register(DeliveryFeedbackRepository.class,DeliveryFeedbackProcessor.class,DeliveryFeedbackScorer.class,
            DeliveryMetricsRepository.class,DeliveryJsonSupport.class,DeliveryIntelligenceProperties.class,
            in.craves.integration.delivery.status.DeliveryStatusRepository.class,
            in.craves.integration.delivery.status.DeliveryStatusUpdateService.class,
            in.craves.integration.delivery.command.DeliveryOutboxRepository.class,
            in.craves.integration.delivery.command.DeliveryCommandProperties.class,
            in.craves.integration.delivery.pidge.PidgeWebhookNormalizer.class);
        app.refresh(); repo=app.getBean(DeliveryFeedbackRepository.class); processor=app.getBean(DeliveryFeedbackProcessor.class);
        metrics=app.getBean(DeliveryMetricsRepository.class); tx=new TransactionTemplate(app.getBean(DataSourceTransactionManager.class));
    }
    @AfterAll static void close() { if(app!=null)app.close(); if(ds!=null)ds.close(); }
    @BeforeEach void schema() throws Exception {
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        for (String file:List.of("V2__delivery_intelligence_foundation.sql","V102__delivery_webhook_status_reconciliation.sql",
                "V120__delivery_outcome_feedback.sql")) {
            try(var in=getClass().getResourceAsStream("/db/migration/"+file)) {
                String sql=new String(Objects.requireNonNull(in).readAllBytes(),StandardCharsets.UTF_8);
                tx.executeWithoutResult(s->jdbc.execute(sql));
            }
        }
        jdbc.update("INSERT INTO delivery_schema.delivery_provider(provider_id,display_name,adapter_type,is_active) VALUES ('pidge','Pidge','PIDGE_VENDOR_V1',true)");
    }
    UUID fixture(String status) {
        UUID id=UUID.randomUUID(), order=UUID.randomUUID(), sub=UUID.randomUUID(), assignment=UUID.randomUUID();
        String context=new ObjectMapper().createObjectNode().put("orderId",order.toString())
            .put("chefSubOrderId",sub.toString()).put("distanceKm",4).put("area","Madhapur")
            .put("orderHour",18).put("dayOfWeek",5).toString();
        jdbc.update("INSERT INTO delivery_schema.delivery_assignment(id,chef_sub_order_id,order_id,strategy,status,scoring_version,selected_provider_id,request_context) VALUES (?,?,?,'GREEDY','ASSIGNED','TEST','pidge',?::jsonb)",assignment,sub,order,context);
        jdbc.update("INSERT INTO delivery_schema.delivery_job(id,chef_sub_order_id,order_id,assignment_id,provider_id,provider_delivery_id,status,booked_at,last_status_observed_at) VALUES (?,?,?,?,'pidge',?,?,now()-interval '1 hour',now())",id,sub,order,assignment,id.toString(),status);
        return id;
    }
    long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM delivery_schema."+table,Long.class); }
    String state(UUID id) { return jdbc.queryForObject("SELECT status FROM delivery_schema.delivery_outcome_feedback WHERE delivery_job_id=?",String.class,id); }
    void drain() { for(var claim:repo.claim(200,8)) processor.process(claim); }

    @Test void terminalCaptureIsAtomicAndDuplicatesNeverTrainTwice() {
        UUID id=fixture("IN_TRANSIT"); assertThat(count("delivery_outcome_feedback")).isZero();
        tx.executeWithoutResult(s->{jdbc.update("UPDATE delivery_schema.delivery_job SET status='DELIVERED' WHERE id=?",id);s.setRollbackOnly();});
        assertThat(count("delivery_outcome_feedback")).isZero();
        jdbc.update("UPDATE delivery_schema.delivery_job SET status='DELIVERED' WHERE id=?",id);
        var claim=repo.claim(1,8).getFirst(); assertThat(processor.process(claim)).isTrue();
        assertThat(processor.process(claim)).isFalse();
        jdbc.update("UPDATE delivery_schema.delivery_job SET status='DELIVERED' WHERE id=?",id);
        assertThat(repo.claim(1,8)).isEmpty(); assertThat(count("delivery_outcome_receipt")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT alpha FROM delivery_schema.delivery_partner_bandit_state",Double.class)).isEqualTo(2);
        assertThat(state(id)).isEqualTo("RECORDED");
    }
    @Test void recordingFailureRollsBackAllLearningWritesThenRetries() {
        UUID id=fixture("DELIVERED"); var claim=repo.claim(1,8).getFirst();
        jdbc.execute("ALTER TABLE delivery_schema.delivery_partner_bandit_state ADD CONSTRAINT force_failure CHECK(alpha<2)");
        assertThatThrownBy(()->processor.process(claim)).isInstanceOf(RuntimeException.class);
        assertThat(count("delivery_outcome_receipt")).isZero(); assertThat(count("delivery_score_hot")).isZero();
        repo.failed(claim,8); assertThat(state(id)).isEqualTo("RETRY");
        jdbc.execute("ALTER TABLE delivery_schema.delivery_partner_bandit_state DROP CONSTRAINT force_failure");
        jdbc.update("UPDATE delivery_schema.delivery_outcome_feedback SET available_at=now() WHERE delivery_job_id=?",id);
        drain(); assertThat(state(id)).isEqualTo("RECORDED"); assertThat(count("delivery_outcome_receipt")).isEqualTo(1);
    }
    @Test void crashedLeaseIsRecoveredAndStaleWorkerIsFenced() {
        UUID id=fixture("FAILED"); var stale=repo.claim(1,8).getFirst();
        jdbc.update("UPDATE delivery_schema.delivery_outcome_feedback SET available_at=now()-interval '1 second' WHERE delivery_job_id=?",id);
        var current=repo.claim(1,8).getFirst(); assertThat(processor.process(stale)).isFalse();
        repo.failed(stale,8); assertThat(state(id)).isEqualTo("PROCESSING");
        assertThat(processor.process(current)).isTrue();
        assertThat(jdbc.queryForObject("SELECT beta FROM delivery_schema.delivery_partner_bandit_state",Double.class)).isEqualTo(2);
    }
    @Test void unknownCancellationIsExcludedAndPoisonRowsAreBounded() {
        UUID cancelled=fixture("CANCELLED"); drain(); assertThat(state(cancelled)).isEqualTo("SKIPPED");
        assertThat(count("delivery_outcome_receipt")).isZero();
        UUID poison=fixture("DELIVERED"); jdbc.update("UPDATE delivery_schema.delivery_assignment SET request_context='{}' WHERE id=(SELECT assignment_id FROM delivery_schema.delivery_job WHERE id=?)",poison);
        var claim=repo.claim(1,1).getFirst(); assertThatThrownBy(()->processor.process(claim)).isInstanceOf(RuntimeException.class);
        repo.failed(claim,1); assertThat(state(poison)).isEqualTo("DEAD_LETTER");
        UUID crashed=fixture("FAILED"); repo.claim(1,1);
        jdbc.update("UPDATE delivery_schema.delivery_outcome_feedback SET available_at=now() WHERE delivery_job_id=?",crashed);
        assertThat(repo.claim(1,1)).isEmpty(); assertThat(state(crashed)).isEqualTo("DEAD_LETTER");
        UUID good=fixture("DELIVERED"); drain(); assertThat(state(good)).isEqualTo("RECORDED");
    }
    @Test void exactPickupEventIsUsedButInferredJobTimestampIsNot() {
        UUID id=fixture("DELIVERED");
        jdbc.update("UPDATE delivery_schema.delivery_job SET picked_up_at=booked_at+interval '30 minutes' WHERE id=?",id);
        drain();
        assertThat(jdbc.queryForObject("SELECT breakdown::text FROM delivery_schema.delivery_outcome_receipt WHERE delivery_id=?",String.class,id))
            .doesNotContain("pickup_timeliness");
    }
    @Test void realPidgeNormalizerAndStatusTransactionFeedLearningAndRejectLateRegression() {
        UUID id=fixture("IN_TRANSIT"), inbox=UUID.randomUUID();
        var mapper=app.getBean(ObjectMapper.class);
        var payload=mapper.createObjectNode().put("id",id.toString().replace("-",""))
            .put("status","FULFILLED").put("updated_at",Instant.now().plusSeconds(2).toString());
        payload.putObject("fulfillment").put("status","DELIVERED");
        jdbc.update("UPDATE delivery_schema.delivery_job SET provider_delivery_id=? WHERE id=?",payload.path("id").asText(),id);
        jdbc.update("INSERT INTO delivery_schema.delivery_webhook_inbox(id,provider_id,provider_event_id,raw_payload) VALUES (?,'pidge','terminal',?::jsonb)",inbox,payload.toString());
        var service=app.getBean(in.craves.integration.delivery.status.DeliveryStatusUpdateService.class);
        var item=new in.craves.integration.delivery.status.DeliveryStatusRepository.WebhookWorkItem(inbox,"pidge","terminal",payload,1);
        assertThat(service.processWebhook(item).applied()).isTrue();
        assertThat(count("delivery_outbox")).isEqualTo(1);
        assertThat(service.processWebhook(item).duplicate()).isTrue();
        drain(); assertThat(state(id)).isEqualTo("RECORDED"); assertThat(count("delivery_outcome_receipt")).isEqualTo(1);
        payload.put("updated_at",Instant.now().plusSeconds(5).toString());
        ((com.fasterxml.jackson.databind.node.ObjectNode)payload.path("fulfillment")).put("status","PICKED_UP");
        var regression=new in.craves.integration.delivery.status.DeliveryStatusRepository.WebhookWorkItem(inbox,"pidge","late-regression",payload,2);
        assertThat(service.processWebhook(regression).applied()).isFalse();
        assertThat(count("delivery_outbox")).isEqualTo(1); assertThat(count("delivery_outcome_receipt")).isEqualTo(1);
    }
    @Test void trackingReconciliationAlsoFeedsTheSameLearningQueue() {
        UUID id=fixture("IN_TRANSIT");
        var job=repo.evidence(id); Instant at=Instant.now().plusSeconds(2);
        var work=new in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem(id,job.orderId(),job.subOrderId(),"pidge",id.toString(),1);
        var delivery=new in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery("pidge",id.toString(),null,
            in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.DELIVERED,"DELIVERED",null,null,null,null,at);
        var snapshot=new in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot(delivery,null,at);
        assertThat(app.getBean(in.craves.integration.delivery.status.DeliveryStatusUpdateService.class).processTracking(work,snapshot).applied()).isTrue();
        drain(); assertThat(state(id)).isEqualTo("RECORDED");
    }
    @Test @Timeout(240) void tenThousandTerminalJobsAndFortyThousandDuplicatesAcrossEightWorkers() throws Exception {
        int jobs=10000;
        jdbc.update("""
            INSERT INTO delivery_schema.delivery_assignment(id,chef_sub_order_id,order_id,strategy,status,scoring_version,selected_provider_id,request_context)
            SELECT md5('a'||n)::uuid,md5('s'||n)::uuid,md5('o'||n)::uuid,'GREEDY','ASSIGNED','LOAD','pidge',
                jsonb_build_object('orderId',md5('o'||n)::uuid,'chefSubOrderId',md5('s'||n)::uuid,
                    'distanceKm',4,'area','Madhapur','orderHour',18,'dayOfWeek',5)
            FROM generate_series(1,?) n
            """,jobs);
        jdbc.update("""
            INSERT INTO delivery_schema.delivery_job(id,chef_sub_order_id,order_id,assignment_id,provider_id,provider_delivery_id,status,booked_at,last_status_observed_at)
            SELECT md5('j'||n)::uuid,md5('s'||n)::uuid,md5('o'||n)::uuid,md5('a'||n)::uuid,'pidge',n::text,
                CASE WHEN n%2=0 THEN 'DELIVERED' ELSE 'FAILED' END,now()-interval '1 hour',now()
            FROM generate_series(1,?) n
            """,jobs);
        long started=System.nanoTime();
        try(var executor=Executors.newFixedThreadPool(9)) {
            List<Callable<Void>> work=new ArrayList<>();
            for(int w=0;w<8;w++)work.add(()->{
                while(true) { var claims=repo.claim(1,8); if(claims.isEmpty())break; processor.process(claims.getFirst()); }
                return null;
            });
            work.add(()->{for(int n=0;n<4;n++)jdbc.update("UPDATE delivery_schema.delivery_job SET status=status");return null;});
            for(var future:executor.invokeAll(work))future.get();
        }
        assertThat(count("delivery_outcome_feedback")).isEqualTo(jobs);
        assertThat(count("delivery_outcome_receipt")).isEqualTo(jobs);
        assertThat(count("delivery_score_hot")).isEqualTo(jobs);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM delivery_schema.delivery_outcome_feedback WHERE status<>'RECORDED'",Long.class)).isZero();
        var state=jdbc.queryForMap("SELECT alpha,beta FROM delivery_schema.delivery_partner_bandit_state");
        assertThat(((Number)state.get("alpha")).doubleValue()).isEqualTo(5001);
        assertThat(((Number)state.get("beta")).doubleValue()).isEqualTo(5001);
        var learned=metrics.load("pidge",Instant.now(),new DeliveryIntelligenceProperties());
        assertThat(learned.liveCount()).isEqualTo(jobs); assertThat(learned.liveAverage()).isEqualTo(50);
        assertThat(new HeuristicDeliverySuccessPredictor().predict(4,18,5,learned)).isLessThan(0.51);
        System.out.printf("FEEDBACK_LOAD_VERIFIED jobs=%d duplicateUpdates=40000 workers=8 seconds=%.3f alpha=5001 beta=5001%n",jobs,(System.nanoTime()-started)/1e9);
    }
}
