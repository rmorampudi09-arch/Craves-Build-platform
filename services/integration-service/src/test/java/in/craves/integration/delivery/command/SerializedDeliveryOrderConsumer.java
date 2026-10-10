package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationTargetException;
import java.net.URLClassLoader;
import java.nio.file.*;
import java.util.*;
import javax.tools.ToolProvider;
import org.flywaydb.core.Flyway;
import org.springframework.web.client.RestClient;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.response.MockRestResponseCreators;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import in.craves.integration.delivery.InternalRequestAuthorizer;
import in.craves.integration.web.DeliveryHandoffProofController;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** The adjacent Order consumer is compiled from production sources, never copied or mocked. */
final class SerializedDeliveryOrderConsumer {
    static Path orderModule;
    static ClassLoader classes;
    private final ObjectMapper json;
    private final Object consumer;
    private final Class<?> envelope, data;

    final AtomicInteger proofRequests=new AtomicInteger();
    final AtomicInteger proofResponseStatus=new AtomicInteger(200);
    final java.util.concurrent.atomic.AtomicReference<String> releasedProofStatementTimeout=new java.util.concurrent.atomic.AtomicReference<>();
    private static final String TEST_KEY="TEST_ONLY_OF02_INTERNAL_KEY";

    static synchronized void compile() throws Exception {
        if (classes != null) return;
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (root != null && !Files.isDirectory(root.resolve("services/order-service"))) root = root.getParent();
        assertNotNull(root, "Full repository required for the cross-service source contract");
        orderModule = root.resolve("services/order-service");
        Path output = Files.createTempDirectory("of02-order-consumer-");
        List<String> args = new ArrayList<>(List.of("-classpath", System.getProperty("java.class.path"), "-d", output.toString()));
        for (String name : List.of("delivery/DeliveryStatusModels", "delivery/DeliveryStatusEventValidator",
            "delivery/DeliveryStatusTransitionPolicy", "delivery/DeliveryStatusUpdateService",
            "delivery/DeliveryStatusCustomerNotificationService", "delivery/DeliveryHandoffProofClient", "service/NotificationOutboxRepository", "service/NotificationOutboxEvent"))
            args.add(orderModule.resolve("src/main/java/in/craves/order/" + name + ".java").toString());
        assertEquals(0, ToolProvider.getSystemJavaCompiler().run(null, null, null, args.toArray(String[]::new)), "Actual Order sources must compile");
        classes = new URLClassLoader(new java.net.URL[]{output.toUri().toURL()}, SerializedDeliveryOrderConsumer.class.getClassLoader());
    }

    SerializedDeliveryOrderConsumer(JdbcTemplate db, ObjectMapper json, TransactionTemplate tx) throws Exception {
        compile();
        this.json=json;
        envelope=type("delivery.DeliveryStatusModels$EventEnvelope"); data=type("delivery.DeliveryStatusModels$DeliveryStatusChangedData");
        Class<?> repository=type("service.NotificationOutboxRepository"), notification=type("delivery.DeliveryStatusCustomerNotificationService"),
            validator=type("delivery.DeliveryStatusEventValidator"), policy=type("delivery.DeliveryStatusTransitionPolicy");
        Object notifications=notification.getConstructor(repository).newInstance(repository.getConstructor(JdbcTemplate.class,ObjectMapper.class).newInstance(db,json));
        // HTTP transport alone is stubbed. Authentication, controller, persisted proof lookup,
        // response serialization, real client decoding, and actual Order acceptance all run.
        var observedDataSource=new org.springframework.jdbc.datasource.DelegatingDataSource(db.getDataSource()) {
            @Override public java.sql.Connection getConnection() throws java.sql.SQLException {
                java.sql.Connection physical=super.getConnection();
                return (java.sql.Connection)java.lang.reflect.Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{java.sql.Connection.class},(proxy,method,args)->{
                        if(method.getName().equals("close")) {
                            try(var statement=physical.createStatement();var result=statement.executeQuery("SHOW statement_timeout")) {
                                result.next();releasedProofStatementTimeout.set(result.getString(1));
                            }
                        }
                        try{return method.invoke(physical,args);}catch(InvocationTargetException error){throw error.getCause();}
                    });
            }
        };
        var controller=new DeliveryHandoffProofController(new InternalRequestAuthorizer(TEST_KEY),
            new DeliveryHandoffProofRepository(new JdbcTemplate(observedDataSource),json));
        var builder=RestClient.builder();
        var transport=MockRestServiceServer.bindTo(builder).build();
        transport.expect(ExpectedCount.manyTimes(),request->{
            assertEquals(HttpMethod.GET,request.getMethod());
            assertEquals("https://integration.test.invalid",request.getURI().getScheme()+"://"+request.getURI().getHost());
            assertTrue(request.getURI().getPath().startsWith("/internal/v1/delivery-handoff-proof/"));
            assertEquals(TEST_KEY,request.getHeaders().getFirst("X-Craves-Internal-Secret"));
        }).andRespond(request->{
            proofRequests.incrementAndGet();
            if(proofResponseStatus.get()!=200) return MockRestResponseCreators.withStatus(HttpStatus.valueOf(proofResponseStatus.get())).createResponse(request);
            String[] segments=request.getURI().getPath().split("/");
            // Separate request thread/connection prevents the fake HTTP transport from
            // accidentally seeing the consumer transaction's uncommitted writes.
            org.springframework.http.ResponseEntity<DeliveryHandoffProofController.Proof> proof;
            try {
                proof=java.util.concurrent.CompletableFuture.supplyAsync(()->controller.find(
                    request.getHeaders().getFirst("X-Craves-Internal-Secret"),UUID.fromString(segments[4]),UUID.fromString(segments[6]))).join();
            } catch(java.util.concurrent.CompletionException error) {
                if(error.getCause() instanceof org.springframework.dao.DataAccessException)
                    return MockRestResponseCreators.withServerError().createResponse(request);
                throw error;
            }
            assertEquals("no-store",proof.getHeaders().getCacheControl());
            return MockRestResponseCreators.withStatus(proof.getStatusCode()).contentType(MediaType.APPLICATION_JSON)
                .body(json.writeValueAsString(proof.getBody())).createResponse(request);
        });
        Class<?> proofType=type("delivery.DeliveryHandoffProofClient");
        var constructor=proofType.getDeclaredConstructor(RestClient.class,ObjectMapper.class,String.class,String.class);
        constructor.setAccessible(true);
        Object proof=constructor.newInstance(builder.build(),json,"https://integration.test.invalid",TEST_KEY);
        Object target=type("delivery.DeliveryStatusUpdateService").getConstructor(JdbcTemplate.class,validator,policy,notification,proofType)
            .newInstance(db,validator.getConstructor().newInstance(),policy.getConstructor().newInstance(),notifications,proof);
        consumer=HandoffContractDatabase.transactional(target,tx.getTransactionManager());
        // Public eight-argument DTO construction remains source/binary compatible.
        assertNotNull(data.getConstructor(UUID.class,UUID.class,UUID.class,String.class,String.class,String.class,String.class,java.time.Instant.class));
    }
    static void migrate(JdbcTemplate db) {
        HandoffContractDatabase.guard(db);
        db.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        db.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        db.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        Flyway.configure().dataSource(db.getDataSource()).schemas("order_schema").defaultSchema("order_schema")
            .locations("filesystem:"+orderModule.resolve("src/main/resources/db/migration")).load().migrate();
    }
    private static Class<?> type(String name) throws Exception {return classes.loadClass("in.craves.order."+name);}
    Result accept(String raw) {
        try {
                Object event=json.readValue(raw,json.getTypeFactory().constructParametricType(envelope,data));
                Object result=consumer.getClass().getMethod("accept",envelope,String.class).invoke(consumer,event,raw);
                return new Result((Boolean)result.getClass().getMethod("applied").invoke(result),
                    (Boolean)result.getClass().getMethod("duplicate").invoke(result),
                    (String)result.getClass().getMethod("result").invoke(result));
            } catch (InvocationTargetException e) {
                if(e.getCause() instanceof RuntimeException runtime)throw runtime;
                throw new IllegalStateException(e.getCause());
        } catch (Exception e) {throw new IllegalStateException(e);}
    }
    record Result(boolean applied, boolean duplicate, String result) {}
}
