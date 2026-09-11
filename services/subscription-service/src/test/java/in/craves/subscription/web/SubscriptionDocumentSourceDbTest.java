package in.craves.subscription.web;

import static org.junit.jupiter.api.Assertions.*;
import in.craves.subscription.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

@EnabledIfEnvironmentVariable(named="DOCUMENT_TEST_JDBC_URL",matches=".+")
class SubscriptionDocumentSourceDbTest {
    final UUID owner=UUID.fromString("11111111-1111-4111-8111-111111111111");
    final UUID invoice=UUID.fromString("22222222-2222-4222-8222-222222222222");
    JdbcTemplate jdbc; SubscriptionDocumentSourceController api;
    @BeforeEach void setup() {
        String url=System.getenv("DOCUMENT_TEST_JDBC_URL");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") && url.endsWith("/pdf_module_test"));
        jdbc=new JdbcTemplate(new DriverManagerDataSource(url,System.getenv("DOCUMENT_TEST_DB_USER"),System.getenv("DOCUMENT_TEST_DB_PASSWORD")));
        jdbc.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE; CREATE SCHEMA subscription_schema");
        jdbc.execute("CREATE TABLE subscription_schema.subscription_invoice(id uuid,customer_identity_id uuid,subscription_id uuid,cycle_start date,cycle_end date,amount numeric,currency text,status text,paid_at timestamptz)");
        jdbc.update("INSERT INTO subscription_schema.subscription_invoice VALUES (?,?,?,'2026-09-01','2026-10-01',1234.56,'INR','PAID','2026-09-01T00:00Z')",invoice,owner,UUID.randomUUID());
        api=new SubscriptionDocumentSourceController(jdbc,true);
    }
    CurrentUser auth(UUID id) { return new CurrentUser(id,null,null,List.of("CUSTOMER")); }
    @Test void paidReceiptUsesStoredInvoiceAmountAndCycle() {
        var result=api.receipt(auth(owner),invoice,"INR","Asia/Kolkata");
        assertEquals("private, no-store, max-age=0",result.getHeaders().getCacheControl());
        assertEquals("SUBSCRIPTION_RECEIPT",result.getBody().get("type"));
        assertTrue(result.getBody().toString().contains("1234.56"));
        assertTrue(result.getBody().toString().contains("2026-10-01"));
    }
    @Test void crossCustomerLookupReturnsNotFound() {
        assertEquals(404,assertThrows(ResponseStatusException.class,()->api.receipt(auth(UUID.randomUUID()),invoice,"INR","Asia/Kolkata")).getStatusCode().value());
    }
    @Test void unpaidOrMissingPaidTimestampIsNotReceiptEligible() {
        jdbc.update("UPDATE subscription_schema.subscription_invoice SET status='PAYMENT_PENDING'");
        assertEquals(409,assertThrows(ResponseStatusException.class,()->api.receipt(auth(owner),invoice,"INR","Asia/Kolkata")).getStatusCode().value());
        jdbc.update("UPDATE subscription_schema.subscription_invoice SET status='PAID',paid_at=NULL");
        assertEquals(409,assertThrows(ResponseStatusException.class,()->api.receipt(auth(owner),invoice,"INR","Asia/Kolkata")).getStatusCode().value());
    }
    @Test void currencyAndTimezoneMustBeValid() {
        assertEquals(409,assertThrows(ResponseStatusException.class,()->api.receipt(auth(owner),invoice,"USD","Asia/Kolkata")).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->api.receipt(auth(owner),invoice,"INR","invalid-zone")).getStatusCode().value());
    }
    @Test void inactiveAdapterAndChefRoleAreDenied() {
        var chef=new CurrentUser(owner,null,null,List.of("CHEF"));
        assertEquals(403,assertThrows(ResponseStatusException.class,()->api.receipt(chef,invoice,"INR","Asia/Kolkata")).getStatusCode().value());
        api=new SubscriptionDocumentSourceController(jdbc,false);
        assertEquals(503,assertThrows(ResponseStatusException.class,()->api.receipt(auth(owner),invoice,"INR","Asia/Kolkata")).getStatusCode().value());
    }
}
