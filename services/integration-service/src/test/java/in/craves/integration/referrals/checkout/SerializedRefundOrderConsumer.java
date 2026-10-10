package in.craves.integration.referrals.checkout;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationTargetException;
import java.net.URLClassLoader;
import java.nio.file.*;
import java.util.*;
import javax.tools.ToolProvider;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Compiles the actual adjacent Order consumer sources, never a copied contract or permissive stub. */
final class SerializedRefundOrderConsumer {
    static Path orderModule;
    static ClassLoader classes;
    private final ObjectMapper json;
    private final Object consumer;
    private final Class<?> envelope, data;
    private final TransactionTemplate tx;

    static synchronized void compile() throws Exception {
        if (classes != null) return;
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (root != null && !Files.isDirectory(root.resolve("services/order-service"))) root = root.getParent();
        assertNotNull(root, "Full repository is required for the cross-service source contract");
        orderModule = root.resolve("services/order-service");
        Path output = Files.createTempDirectory("of04-order-consumer-");
        List<String> args = new ArrayList<>(List.of("-classpath", System.getProperty("java.class.path"), "-d", output.toString()));
        for (String name : List.of("refund/RefundStatusModels", "refund/RefundStatusEventValidator",
            "refund/RefundStatusTransitionPolicy", "refund/RefundStatusUpdateService",
            "refund/RefundStatusCustomerNotificationService", "service/NotificationOutboxRepository", "service/NotificationOutboxEvent", "admin/AdminCustomerOrdersController", "security/CravesPrincipal"))
            args.add(orderModule.resolve("src/main/java/in/craves/order/" + name + ".java").toString());
        assertEquals(0, ToolProvider.getSystemJavaCompiler().run(null, null, null, args.toArray(String[]::new)),
            "Actual Order consumer sources must compile");
        classes = new URLClassLoader(new java.net.URL[]{output.toUri().toURL()}, SerializedRefundOrderConsumer.class.getClassLoader());
    }

    SerializedRefundOrderConsumer(JdbcTemplate db, ObjectMapper json, TransactionTemplate tx) throws Exception {
        compile();
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        assertTrue(System.getenv("LEDGER_TEST_JDBC_URL").matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        assertEquals("chef_ledger_test", db.queryForObject("SELECT current_database()", String.class));
        resetSchema(db,"latest");
        this.json=json; this.tx=tx;
        envelope=type("refund.RefundStatusModels$EventEnvelope"); data=type("refund.RefundStatusModels$RefundStatusChangedData");
        Class<?> repository=type("service.NotificationOutboxRepository"), notification=type("refund.RefundStatusCustomerNotificationService"),
            validator=type("refund.RefundStatusEventValidator"), policy=type("refund.RefundStatusTransitionPolicy");
        Object notifications=notification.getConstructor(repository).newInstance(repository.getConstructor(JdbcTemplate.class,ObjectMapper.class).newInstance(db,json));
        consumer=type("refund.RefundStatusUpdateService").getConstructor(JdbcTemplate.class,validator,policy,notification)
            .newInstance(db,validator.getConstructor().newInstance(),policy.getConstructor().newInstance(),notifications);
    }
    static void resetSchema(JdbcTemplate db,String target) {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        assertEquals("chef_ledger_test",db.queryForObject("SELECT current_database()",String.class));
        db.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        // V16 references the shared Catalog ownership table, even in an otherwise empty database.
        db.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        db.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        Flyway.configure().dataSource(db.getDataSource()).schemas("order_schema").defaultSchema("order_schema")
            .locations("filesystem:" + orderModule.resolve("src/main/resources/db/migration")).target(target).load().migrate();
    }
    static void upgradeSchema(JdbcTemplate db) {
        Flyway.configure().dataSource(db.getDataSource()).schemas("order_schema").defaultSchema("order_schema")
            .locations("filesystem:" + orderModule.resolve("src/main/resources/db/migration")).load().migrate();
    }
    com.fasterxml.jackson.databind.JsonNode readWithUnchangedAdminReader(JdbcTemplate db, UUID buyer) throws Exception {
        Object principal=type("security.CravesPrincipal").getConstructor(UUID.class,String.class,Set.class).newInstance(UUID.randomUUID(),null,Set.of("SUPPORT_ADMIN"));
        var auth=org.mockito.Mockito.mock(org.springframework.security.core.Authentication.class);
        org.mockito.Mockito.when(auth.getPrincipal()).thenReturn(principal);
        Class<?> reader=type("admin.AdminCustomerOrdersController");
        Object controller=reader.getConstructor(JdbcTemplate.class).newInstance(db);
        var method=Arrays.stream(reader.getMethods()).filter(m->m.getName().equals("orders")).findFirst().orElseThrow();
        Object response=method.invoke(controller,auth,buyer,"Offline refund regression",null,null,null,null,null,null,null,50);
        return json.copy().disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .valueToTree(((org.springframework.http.ResponseEntity<?>)response).getBody());
    }
    private static Class<?> type(String name) throws Exception {return classes.loadClass("in.craves.order."+name);}
    boolean accept(String raw) {
        return tx.execute(s -> {
            try {
                Object event=json.readValue(raw,json.getTypeFactory().constructParametricType(envelope,data));
                return (Boolean)consumer.getClass().getMethod("accept",envelope,String.class).invoke(consumer,event,raw);
            } catch (InvocationTargetException e) {
                if(e.getCause() instanceof RuntimeException runtime)throw runtime;
                throw new IllegalStateException(e.getCause());
            } catch (Exception e) {throw new IllegalStateException(e);}
        });
    }
}
