package in.craves.integration.admin.deliveryexceptions;

import static org.assertj.core.api.Assertions.*;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.Action;
import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.Reason;
import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.Status;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.server.ResponseStatusException;

// Reuses the disposable database launch regression CI already provides for the delivery feedback tests.
@EnabledIfEnvironmentVariable(named = "DELIVERY_FEEDBACK_TEST_JDBC_URL", matches = ".+")
class DeliveryExceptionDatabaseTest {
    static HikariDataSource ds;
    static AnnotationConfigApplicationContext app;
    static JdbcTemplate jdbc;
    static DeliveryExceptionService service;
    static final UUID OPS = UUID.randomUUID();

    @Configuration @EnableTransactionManagement static class Transactions {}

    @BeforeAll static void connect() {
        String url = System.getenv("DELIVERY_FEEDBACK_TEST_JDBC_URL");
        assertThat(url).matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/delivery_feedback_test");
        var config = new HikariConfig(); config.setJdbcUrl(url); config.setUsername("postgres");
        config.setPassword(System.getenv("DELIVERY_FEEDBACK_TEST_DB_PASSWORD"));
        config.setMaximumPoolSize(8); config.setConnectionTimeout(5000);
        ds = new HikariDataSource(config); jdbc = new JdbcTemplate(ds);
        app = new AnnotationConfigApplicationContext(); app.register(Transactions.class);
        app.registerBean(JdbcTemplate.class, () -> jdbc);
        app.registerBean(DataSourceTransactionManager.class, () -> new DataSourceTransactionManager(ds));
        app.register(DeliveryExceptionService.class);
        app.refresh(); service = app.getBean(DeliveryExceptionService.class);
    }

    @AfterAll static void close() { if (app != null) app.close(); if (ds != null) ds.close(); }

    @BeforeEach void schema() throws Exception {
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        for (String file : List.of("V2__delivery_intelligence_foundation.sql", "V175__delivery_exception_cases.sql")) {
            try (var in = getClass().getResourceAsStream("/db/migration/" + file)) {
                jdbc.execute(new String(Objects.requireNonNull(in).readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        jdbc.update("INSERT INTO delivery_schema.delivery_provider(provider_id,display_name,adapter_type,is_active) VALUES ('borzo','Borzo','BORZO_V1',true),('pidge','Pidge','PIDGE_VENDOR_V1',true),('old','Old','OLD',false)");
    }

    UUID job() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO delivery_schema.delivery_job(id,chef_sub_order_id,order_id,provider_id,status) VALUES (?,?,?,'borzo','SEARCHING_AGENT')",
            id, UUID.randomUUID(), UUID.randomUUID());
        return id;
    }

    int status(Throwable e) { return ((ResponseStatusException) e).getStatusCode().value(); }

    @Test void fullLifecycleIsRecordedAndClosedCasesAcceptNothing() {
        UUID job = job();
        var opened = service.open(OPS, job, Reason.RIDER_NOT_ASSIGNED, "  no rider for 20 min ").exceptionCase();
        assertThat(opened.status()).isEqualTo(Status.OPEN);
        assertThat(opened.currentProviderId()).isEqualTo("borzo");
        assertThat(opened.deliveryStatus()).isEqualTo("SEARCHING_AGENT");
        UUID assignee = UUID.randomUUID();
        service.act(OPS, opened.id(), Action.ACKNOWLEDGE, 0, null, null, null);
        service.act(OPS, opened.id(), Action.ASSIGN, 1, null, assignee, null);
        var asked = service.act(OPS, opened.id(), Action.REQUEST_REASSIGNMENT, 2, "move to pidge", null, " Pidge ").exceptionCase();
        assertThat(asked.status()).isEqualTo(Status.REASSIGNMENT_REQUESTED);
        assertThat(asked.reassignToProviderId()).isEqualTo("pidge");
        assertThat(asked.assigneeId()).isEqualTo(assignee);
        assertThat(service.act(OPS, opened.id(), Action.ACKNOWLEDGE, 3, "withdrawn", null, null).exceptionCase().reassignToProviderId()).isNull();
        service.act(OPS, opened.id(), Action.REQUEST_REASSIGNMENT, 4, null, null, "pidge");
        var done = service.act(OPS, opened.id(), Action.RESOLVE, 5, "rebooked on Pidge by ops", null, null);
        assertThat(done.exceptionCase().status()).isEqualTo(Status.RESOLVED);
        assertThat(done.exceptionCase().closedAt()).isNotNull();
        assertThat(done.exceptionCase().resolutionNote()).isEqualTo("rebooked on Pidge by ops");
        assertThat(done.events()).extracting(e -> e.action()).containsExactly("OPEN", "ACKNOWLEDGE", "ASSIGN", "REQUEST_REASSIGNMENT", "ACKNOWLEDGE", "REQUEST_REASSIGNMENT", "RESOLVE");
        assertThat(done.exceptionCase().reassignToProviderId()).isEqualTo("pidge");
        assertThat(done.events().get(0).note()).isEqualTo("no rider for 20 min");
        assertThatThrownBy(() -> service.act(OPS, opened.id(), Action.DISMISS, 6, "x", null, null)).satisfies(e -> assertThat(status(e)).isEqualTo(409));
        // The delivery itself is never touched.
        assertThat(jdbc.queryForObject("SELECT provider_id FROM delivery_schema.delivery_job WHERE id=?", String.class, job)).isEqualTo("borzo");
        // Closed, so a new case may be opened for the same job.
        assertThat(service.open(OPS, job, Reason.OTHER, "again").exceptionCase().status()).isEqualTo(Status.OPEN);
    }

    @Test void oneActiveCasePerJobEvenUnderConcurrency() throws Exception {
        UUID job = job();
        var pool = Executors.newFixedThreadPool(4);
        try {
            Callable<Integer> attempt = () -> { try { service.open(OPS, job, Reason.PICKUP_DELAYED, null); return 201; } catch (ResponseStatusException e) { return e.getStatusCode().value(); } };
            var results = pool.invokeAll(List.of(attempt, attempt, attempt, attempt));
            long created = results.stream().filter(f -> { try { return f.get() == 201; } catch (Exception e) { throw new IllegalStateException(e); } }).count();
            assertThat(created).isEqualTo(1);
        } finally { pool.shutdown(); }
        assertThat(service.list(null, null, 10, 0).items()).hasSize(1);
    }

    @Test void refusesStaleVersionsBadProvidersAndUnknownJobs() {
        UUID job = job();
        var c = service.open(OPS, job, Reason.ADDRESS_ISSUE, null).exceptionCase();
        assertThatThrownBy(() -> service.act(OPS, c.id(), Action.ACKNOWLEDGE, 5, null, null, null)).satisfies(e -> assertThat(status(e)).isEqualTo(409));
        assertThatThrownBy(() -> service.act(OPS, c.id(), Action.REQUEST_REASSIGNMENT, 0, null, null, "borzo")).satisfies(e -> assertThat(status(e)).isEqualTo(400));
        assertThatThrownBy(() -> service.act(OPS, c.id(), Action.REQUEST_REASSIGNMENT, 0, null, null, "old")).satisfies(e -> assertThat(status(e)).isEqualTo(400));
        assertThatThrownBy(() -> service.act(OPS, c.id(), Action.REQUEST_REASSIGNMENT, 0, null, null, "nope")).satisfies(e -> assertThat(status(e)).isEqualTo(400));
        assertThatThrownBy(() -> service.act(OPS, c.id(), Action.RESOLVE, 0, " ", null, null)).satisfies(e -> assertThat(status(e)).isEqualTo(400));
        assertThatThrownBy(() -> service.open(OPS, UUID.randomUUID(), Reason.OTHER, "x")).satisfies(e -> assertThat(status(e)).isEqualTo(404));
        assertThatThrownBy(() -> service.detail(UUID.randomUUID())).satisfies(e -> assertThat(status(e)).isEqualTo(404));
        assertThat(service.detail(c.id()).exceptionCase().version()).isZero();
    }

    @Test void listFiltersAndPages() {
        for (int i = 0; i < 3; i++) service.open(OPS, job(), Reason.FOOD_DAMAGED, null);
        var dismissed = service.open(OPS, job(), Reason.OTHER, "dup").exceptionCase();
        service.act(OPS, dismissed.id(), Action.DISMISS, 0, "duplicate report", null, null);
        var page = service.list(null, null, 2, 0);
        assertThat(page.items()).hasSize(2); assertThat(page.hasMore()).isTrue();
        assertThat(service.list(null, null, 2, 2).items()).hasSize(1);
        assertThat(service.list(Status.DISMISSED, null, 10, 0).items()).extracting(v -> v.id()).containsExactly(dismissed.id());
        assertThat(service.list(null, dismissed.orderId(), 10, 0).items()).isEmpty();
    }
}
