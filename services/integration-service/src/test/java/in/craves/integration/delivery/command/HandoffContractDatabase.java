package in.craves.integration.delivery.command;

import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Only the separately named, explicitly opted-in disposable PostgreSQL 16 database is permitted. */
final class HandoffContractDatabase {
    final JdbcTemplate db;
    final TransactionTemplate tx;
    HandoffContractDatabase() {
        String url=System.getenv("OF02_TEST_JDBC_URL");
        assertNotNull(url);
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/of02_handoff_test"));
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        var ds=new DriverManagerDataSource(url,System.getenv("OF02_TEST_DB_USER"),System.getenv("OF02_TEST_DB_PASSWORD"));
        db=new JdbcTemplate(ds); tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        guard(db);
        assertTrue(db.queryForObject("SHOW server_version",String.class).startsWith("16."));
        db.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        db.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).schemas("payment_schema").defaultSchema("payment_schema")
            .locations("classpath:db/migration").load().migrate();
    }
    @SuppressWarnings("unchecked")
    static <T> T transactional(T target, org.springframework.transaction.PlatformTransactionManager manager) {
        var proxy=new org.springframework.aop.framework.ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(manager,
            new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
        T result=(T)proxy.getProxy(target.getClass().getClassLoader());
        assertTrue(org.springframework.aop.support.AopUtils.isAopProxy(result));
        return result;
    }
    static void guard(JdbcTemplate db) {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        assertEquals("of02_handoff_test",db.queryForObject("SELECT current_database()",String.class));
    }
}
