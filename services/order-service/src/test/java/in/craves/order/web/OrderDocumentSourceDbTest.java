package in.craves.order.web;

import static org.junit.jupiter.api.Assertions.*;
import in.craves.order.security.CravesPrincipal;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

@EnabledIfEnvironmentVariable(named="DOCUMENT_TEST_JDBC_URL",matches=".+")
class OrderDocumentSourceDbTest {
    final UUID customer=UUID.fromString("11111111-1111-4111-8111-111111111111");
    final UUID chef=UUID.fromString("22222222-2222-4222-8222-222222222222");
    final UUID order=UUID.fromString("33333333-3333-4333-8333-333333333333");
    final UUID checkout=UUID.fromString("44444444-4444-4444-8444-444444444444");
    JdbcTemplate jdbc; OrderDocumentSourceController api;
    @BeforeEach void setup() {
        String url=System.getenv("DOCUMENT_TEST_JDBC_URL");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") && url.endsWith("/pdf_module_test"));
        jdbc=new JdbcTemplate(new DriverManagerDataSource(url,System.getenv("DOCUMENT_TEST_DB_USER"),System.getenv("DOCUMENT_TEST_DB_PASSWORD")));
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE; CREATE SCHEMA order_schema");
        jdbc.execute("CREATE TABLE order_schema.checkout(id uuid primary key,customer_identity_id uuid,status text)");
        jdbc.execute("CREATE TABLE order_schema.customer_order(id uuid primary key,checkout_id uuid,customer_identity_id uuid,chef_identity_id uuid,"+
            "order_source text,kitchen_name_snapshot text,status text,currency text,created_at timestamptz,updated_at timestamptz,"+
            "food_subtotal numeric,platform_fee numeric,tax_amount numeric,delivery_fee numeric,grand_total numeric,"+
            "dropoff_recipient_name text,dropoff_address_line1 text,dropoff_address_line2 text,dropoff_city text,dropoff_postal_code text)");
        jdbc.execute("CREATE TABLE order_schema.order_item(id uuid,order_id uuid,item_name_snapshot text,quantity integer,unit_price_snapshot numeric,line_total numeric,created_at timestamptz)");
        jdbc.update("INSERT INTO order_schema.checkout VALUES (?,?,'PAID')",checkout,customer);
        jdbc.update("INSERT INTO order_schema.customer_order VALUES (?,?,?,?, 'ON_DEMAND','Demo kitchen','PAID','INR','2026-09-05T00:00Z','2026-09-05T00:00Z',241.00,0,0,25,266.00,'Demo customer','Demo road',NULL,'Hyderabad','500000')",order,checkout,customer,chef);
        jdbc.update("INSERT INTO order_schema.order_item VALUES (?,?, 'Demo meal',2,120.50,241.00,'2026-09-05T00:00Z')",UUID.randomUUID(),order);
        api=new OrderDocumentSourceController(jdbc,true);
    }
    CravesPrincipal principal(UUID id,String role) { return new CravesPrincipal(id,null,Set.of(role)); }
    Map<String,Object> receipt() { return api.order(principal(customer,"CUSTOMER"),order,true,"INR","Asia/Kolkata").getBody(); }
    @Test void receiptCopiesExactSavedAmountsNotCurrentPrices() {
        Map<String,Object> data=receipt();
        assertEquals("PAYMENT_RECEIPT",data.get("type")); assertEquals(customer,data.get("ownerIdentityId"));
        assertTrue(data.get("tables").toString().contains("266.00")); assertTrue(data.get("tables").toString().contains("120.50"));
    }
    @Test void otherCustomerCannotSeeOrderOrAddress() {
        var ex=assertThrows(ResponseStatusException.class,()->api.order(principal(UUID.randomUUID(),"CUSTOMER"),order,true,"INR","Asia/Kolkata"));
        assertEquals(404,ex.getStatusCode().value());
    }
    @Test void unpaidAndSubscriptionOrdersCannotMasqueradeAsPaidReceipts() {
        jdbc.update("UPDATE order_schema.checkout SET status='PAYMENT_PENDING'");
        assertEquals(409,assertThrows(ResponseStatusException.class,this::receipt).getStatusCode().value());
        assertEquals("ORDER_SUMMARY",api.order(principal(customer,"CUSTOMER"),order,false,"INR","Asia/Kolkata").getBody().get("type"));
        jdbc.update("UPDATE order_schema.checkout SET status='PAID'");
        jdbc.update("UPDATE order_schema.customer_order SET order_source='SUBSCRIPTION'");
        assertEquals(409,assertThrows(ResponseStatusException.class,this::receipt).getStatusCode().value());
    }
    @Test void chefActivityUsesFrozenChefOwnershipAndEndExclusiveDates() {
        var from=Instant.parse("2026-09-01T00:00:00Z"); var to=Instant.parse("2026-09-06T00:00:00Z");
        var owned=api.chef(principal(chef,"CHEF"),from,to,"INR","Asia/Kolkata").getBody();
        assertTrue(owned.get("tables").toString().contains(order.toString()));
        assertFalse(owned.toString().contains("Demo road"));
        var other=api.chef(principal(UUID.randomUUID(),"CHEF"),from,to,"INR","Asia/Kolkata").getBody();
        assertFalse(other.get("tables").toString().contains(order.toString()));
        var boundary=api.chef(principal(chef,"CHEF"),from,Instant.parse("2026-09-05T00:00:00Z"),"INR","Asia/Kolkata").getBody();
        assertFalse(boundary.get("tables").toString().contains(order.toString()));
    }
    @Test void roleCurrencyAndDormantFlagFailClosed() {
        assertEquals(403,assertThrows(ResponseStatusException.class,()->api.order(principal(customer,"CHEF"),order,false,"INR","Asia/Kolkata")).getStatusCode().value());
        assertEquals(409,assertThrows(ResponseStatusException.class,()->api.order(principal(customer,"CUSTOMER"),order,false,"USD","Asia/Kolkata")).getStatusCode().value());
        api=new OrderDocumentSourceController(jdbc,false);
        assertEquals(503,assertThrows(ResponseStatusException.class,this::receipt).getStatusCode().value());
    }
}
