package in.craves.integration.web;

import static org.junit.jupiter.api.Assertions.*;
import in.craves.integration.security.CravesPrincipal;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

@EnabledIfEnvironmentVariable(named="DOCUMENT_TEST_JDBC_URL",matches=".+")
class ChefDocumentSourceDbTest {
    final UUID chef=UUID.fromString("11111111-1111-4111-8111-111111111111");
    final UUID other=UUID.fromString("22222222-2222-4222-8222-222222222222");
    final UUID batch=UUID.fromString("33333333-3333-4333-8333-333333333333");
    final Instant from=Instant.parse("2026-09-01T00:00:00Z"), to=Instant.parse("2026-10-01T00:00:00Z");
    JdbcTemplate jdbc; ChefDocumentSourceController api;
    @BeforeEach void setup() {
        String url=System.getenv("DOCUMENT_TEST_JDBC_URL");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") && url.endsWith("/pdf_module_test"));
        jdbc=new JdbcTemplate(new DriverManagerDataSource(url,System.getenv("DOCUMENT_TEST_DB_USER"),System.getenv("DOCUMENT_TEST_DB_PASSWORD")));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE; CREATE SCHEMA payment_schema");
        jdbc.execute("CREATE TABLE payment_schema.chef_earning_entry(id uuid,order_id uuid,chef_identity_id uuid,created_at timestamptz,status text,currency text,gross_amount numeric,commission_amount numeric,tax_withheld_amount numeric,adjustment_amount numeric,net_payable numeric)");
        jdbc.execute("CREATE TABLE payment_schema.chef_settlement_batch(id uuid,batch_reference text,status text,currency text,total_amount numeric)");
        jdbc.execute("CREATE TABLE payment_schema.chef_settlement_item(batch_id uuid,earning_entry_id uuid,chef_identity_id uuid,created_at timestamptz,amount numeric)");
        jdbc.update("INSERT INTO payment_schema.chef_settlement_batch VALUES (?,'DEMO-SHARED-BATCH','SETTLED','INR',999999.99)",batch);
        jdbc.update("INSERT INTO payment_schema.chef_settlement_item VALUES (?,?,?,'2026-09-05T00:00Z',125.50)",batch,UUID.randomUUID(),chef);
        jdbc.update("INSERT INTO payment_schema.chef_settlement_item VALUES (?,?,?,'2026-09-05T00:00Z',888888.88)",batch,UUID.randomUUID(),other);
        earning(chef,"APPROVED","100.00"); earning(chef,"DRAFT","200.00"); earning(other,"APPROVED","777777.77");
        api=new ChefDocumentSourceController(jdbc,true);
    }
    void earning(UUID owner,String status,String net) {
        jdbc.update("INSERT INTO payment_schema.chef_earning_entry VALUES (?,?,?,'2026-09-05T00:00Z',?,'INR',100,0,0,0,?::numeric)",UUID.randomUUID(),UUID.randomUUID(),owner,status,net);
    }
    CravesPrincipal auth(UUID owner) { return new CravesPrincipal(owner,null,Set.of("CHEF")); }
    @Test void sharedSettlementIncludesOnlyOwnedAllocationNotBatchTotal() {
        String result=api.settlements(auth(chef),from,to,"INR","Asia/Kolkata").getBody().toString();
        assertTrue(result.contains("125.50")); assertFalse(result.contains("888888.88")); assertFalse(result.contains("999999.99"));
    }
    @Test void earningsNeverCombineDraftWithApprovedOrLeakOtherChef() {
        String result=api.earnings(auth(chef),from,to,"INR","Asia/Kolkata").getBody().toString();
        assertTrue(result.contains("APPROVED")); assertTrue(result.contains("DRAFT"));
        assertTrue(result.contains("100.00")); assertTrue(result.contains("200.00")); assertFalse(result.contains("777777.77"));
    }
    @Test void endBoundaryAndCurrencyFilterAreExact() {
        String result=api.settlements(auth(chef),from,Instant.parse("2026-09-05T00:00:00Z"),"INR","Asia/Kolkata").getBody().toString();
        assertFalse(result.contains("125.50"));
        assertFalse(api.settlements(auth(chef),from,to,"USD","Asia/Kolkata").getBody().toString().contains("125.50"));
    }
    @Test void oversizeStatementFailsInsteadOfTruncating() {
        jdbc.update("INSERT INTO payment_schema.chef_earning_entry SELECT md5(n::text)::uuid,md5((n+10000)::text)::uuid,?,'2026-09-05T00:00Z','APPROVED','INR',1,0,0,0,1 FROM generate_series(1,1001) AS n",chef);
        assertEquals(422,assertThrows(ResponseStatusException.class,()->api.earnings(auth(chef),from,to,"INR","Asia/Kolkata")).getStatusCode().value());
    }
    @Test void missingRoleAndDisabledAdapterCannotReadLedger() {
        var customer=new CravesPrincipal(chef,null,Set.of("CUSTOMER"));
        assertEquals(403,assertThrows(ResponseStatusException.class,()->api.earnings(customer,from,to,"INR","Asia/Kolkata")).getStatusCode().value());
        api=new ChefDocumentSourceController(jdbc,false);
        assertEquals(503,assertThrows(ResponseStatusException.class,()->api.earnings(auth(chef),from,to,"INR","Asia/Kolkata")).getStatusCode().value());
    }
}
