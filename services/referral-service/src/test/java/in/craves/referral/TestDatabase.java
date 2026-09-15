package in.craves.referral;

import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import javax.sql.DataSource;

/** Destructive tests require an explicitly named, local, disposable database. Never use a production tunnel. */
public final class TestDatabase {
    private TestDatabase() { }
    public static DataSource reset() {
        String url=System.getenv("REFERRAL_TEST_JDBC_URL");
        if(!"YES_DISPOSABLE_REFERRAL_TEST_ONLY".equals(System.getenv("REFERRAL_TEST_CONFIRM"))
                || url==null || !url.matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/referral_test"))
            throw new IllegalStateException("Refusing destructive tests without explicit local referral_test database confirmation");
        DriverManagerDataSource ds=new DriverManagerDataSource(url,System.getenv("REFERRAL_TEST_DB_USER"),System.getenv("REFERRAL_TEST_DB_PASSWORD"));
        JdbcTemplate jdbc=new JdbcTemplate(ds);
        if(!"referral_test".equals(jdbc.queryForObject("SELECT current_database()",String.class))) throw new IllegalStateException("Wrong test database");
        jdbc.execute("DROP SCHEMA IF EXISTS referral_schema CASCADE");
        Flyway.configure().dataSource(ds).schemas("referral_schema").defaultSchema("referral_schema")
            .table("referral_flyway_history").locations("classpath:db/referral_migration").cleanDisabled(true).load().migrate();
        return ds;
    }
}
