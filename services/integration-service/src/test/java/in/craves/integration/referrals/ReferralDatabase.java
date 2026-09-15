package in.craves.integration.referrals;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
public final class ReferralDatabase {
 public final JdbcTemplate db;public final DataSourceTransactionManager manager;public final TransactionTemplate tx;
 public ReferralDatabase(){String url=System.getenv("LEDGER_TEST_JDBC_URL");assertNotNull(url);assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
 var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));db=new JdbcTemplate(ds);manager=new DataSourceTransactionManager(ds);tx=new TransactionTemplate(manager);
 db.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");db.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");Flyway.configure().dataSource(ds).schemas("payment_schema").defaultSchema("payment_schema").locations("classpath:db/migration").load().migrate();}
 public long count(String table){return db.queryForObject("SELECT count(*) FROM payment_schema."+table,Long.class);}
}
