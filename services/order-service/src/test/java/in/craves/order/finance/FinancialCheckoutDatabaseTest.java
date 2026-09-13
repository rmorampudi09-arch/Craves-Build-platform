package in.craves.order.finance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.order.config.NotificationClientProperties;
import in.craves.order.delivery.*;
import in.craves.order.delivery.DeliveryStatusModels.*;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.*;
import in.craves.order.service.CatalogClient.*;
import in.craves.order.service.CustomerAddressClient.CustomerAddress;
import in.craves.order.web.ApiDtos.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.*;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class FinancialCheckoutDatabaseTest {
    @Configuration @EnableAspectJAutoProxy(proxyTargetClass=true) @EnableTransactionManagement static class Config {}
    AnnotationConfigApplicationContext context;JdbcTemplate jdbc;TransactionTemplate tx;OrderService orders;
    FinanceSourceClient finance;CatalogClient catalog;NotificationOutboxService notifications;
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    final UUID customer=UUID.randomUUID(),chef=UUID.randomUUID(),kitchen=UUID.randomUUID(),menu=UUID.randomUUID(),address=UUID.randomUUID();
    final CravesPrincipal actor=new CravesPrincipal(customer,"",Set.of("CUSTOMER"));
    @BeforeEach void setup(){
        String url=System.getenv("LEDGER_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);var manager=new DataSourceTransactionManager(ds);tx=new TransactionTemplate(manager);
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        var flyway=Flyway.configure().dataSource(ds).defaultSchema("order_schema").schemas("order_schema").locations("classpath:db/migration").load();flyway.migrate();flyway.validate();assertEquals(0,flyway.migrate().migrationsExecuted);
        jdbc.update("UPDATE order_schema.charge_policy SET delivery_fee_flat=39 WHERE is_active=true");
        catalog=mock(CatalogClient.class);var addresses=mock(CustomerAddressClient.class);finance=mock(FinanceSourceClient.class);notifications=mock(NotificationOutboxService.class);
        when(catalog.getActiveMenuItem(menu)).thenReturn(new CatalogMenuItem(menu,kitchen,"Test meal","Test meal","MEAL","VEG",new BigDecimal("369.00"),"INR",1,20,"MILD",500,false,true,"ACTIVE"));
        when(catalog.getKitchen(kitchen)).thenReturn(new CatalogKitchen(kitchen,chef,"Test kitchen","Test chef","Test", "9000000000","test@example.invalid","Test pickup",null,null,"Test area","Hyderabad","Telangana","500001",new BigDecimal("17.40"),new BigDecimal("78.40"),"ACTIVE"));
        when(addresses.getActiveOwnedAddress(customer,address)).thenReturn(new CustomerAddress(address,customer,"Home","Test customer","9000000001","Test dropoff",null,null,"Test area","Hyderabad","Telangana","500001",new BigDecimal("17.41"),new BigDecimal("78.41"),true,true,Instant.now(),Instant.now()));
        when(finance.quote(any())).thenAnswer(invocation->quote(invocation.getArgument(0)));
        context=new AnnotationConfigApplicationContext();context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("finance-test",Map.of("CRAVES_FINANCE_SOURCE_ENABLED","true")));
        context.register(Config.class);context.registerBean(JdbcTemplate.class,()->jdbc);context.registerBean(ObjectMapper.class,()->json);
        context.registerBean(DataSourceTransactionManager.class,()->manager);context.registerBean(CatalogClient.class,()->catalog);context.registerBean(CustomerAddressClient.class,()->addresses);
        context.registerBean(FinanceSourceClient.class,()->finance);context.registerBean(CheckoutSnapshotFactory.class,CheckoutSnapshotFactory::new);
        context.registerBean(NotificationInternalClient.class,()->new NotificationInternalClient(new NotificationClientProperties(),RestClient.builder(),notifications));
        context.registerBean(OrderService.class);context.registerBean(OrderFinancialBindingService.class);context.registerBean(FinancialCheckoutTransactionAspect.class);context.refresh();
        orders=context.getBean(OrderService.class);orders.addCartItem(actor,new AddCartItemRequest(menu,1));
    }
    @AfterEach void close(){if(context!=null)context.close();}
    CheckoutResponse checkout(){return orders.checkout(actor,new CheckoutRequest(address,"Finance integration test"));}
    ObjectNode quote(JsonNode request){
        ObjectNode response=json.createObjectNode().put("checkoutId",request.path("checkoutId").asText()).put("requestHash",hash(request));
        var snapshots=response.putArray("snapshots");BigDecimal total=BigDecimal.ZERO;
        for(JsonNode order:request.path("orders")){
            BigDecimal base=BigDecimal.ZERO;for(JsonNode item:order.path("items"))base=base.add(new BigDecimal(item.path("customerUnit").asText()).multiply(BigDecimal.valueOf(item.path("quantity").asInt())));
            BigDecimal delivery=new BigDecimal(order.path("deliveryBeforeTax").asText());BigDecimal tax=base.multiply(new BigDecimal("0.05")).setScale(2,RoundingMode.HALF_UP).add(delivery.multiply(new BigDecimal("0.18")).setScale(2,RoundingMode.HALF_UP));
            var snap=snapshots.addObject().put("snapshotId",UUID.randomUUID().toString()).put("schemaVersion","1.0").put("chefOrderId",order.path("chefOrderId").asText())
                .put("checkoutId",request.path("checkoutId").asText()).put("customerIdentityId",request.path("customerIdentityId").asText())
                .put("chefIdentityId",order.path("chefIdentityId").asText()).put("kitchenId",order.path("kitchenId").asText()).put("currency","INR").put("orderSource","ON_DEMAND")
                .put("chefGross",base.toPlainString()).put("customerFood",base.toPlainString()).put("platform","0.00").put("delivery",delivery.toPlainString()).put("customerTax",tax.toPlainString())
                .put("customerTotal",base.add(delivery).add(tax).toPlainString()).put("pricedAt",request.path("pricedAt").asText());
            snap.set("items",order.path("items").deepCopy());snap.put("hash",hash(snap));total=total.add(base).add(delivery).add(tax);
        }
        response.put("total",total.toPlainString());return response;
    }
    String hash(JsonNode value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical(value).toString().getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    JsonNode canonical(JsonNode value){if(value.isObject()){var result=json.createObjectNode();var keys=new TreeSet<String>();value.fieldNames().forEachRemaining(keys::add);for(String key:keys)result.set(key,canonical(value.get(key)));return result;}if(value.isArray()){var result=json.createArrayNode();for(var item:value)result.add(canonical(item));return result;}return value;}
    long count(String table){return jdbc.queryForObject("SELECT count(*) FROM order_schema."+table,Long.class);}
    @Test void actualCheckoutCommitsBoundTaxTotalsAndDurableEvent(){
        var checkout=checkout();assertEquals(new BigDecimal("433.47"),checkout.grandTotal());assertEquals(new BigDecimal("25.47"),checkout.taxAmount());
        assertEquals(1,count("order_financial_snapshot"));assertEquals(1,count("finance_source_outbox"));assertEquals(0,count("cart_item"));
        assertEquals(chef,jdbc.queryForObject("SELECT chef_identity_id FROM order_schema.customer_order",UUID.class));
        verify(notifications).recordOrderCreated(argThat(value->value.grandTotal().compareTo(new BigDecimal("433.47"))==0));
    }
    @Test void quoteFailureRollsBackOrdersAndPreservesCart(){
        when(finance.quote(any())).thenThrow(new IllegalStateException("Finance not reachable"));assertThrows(RuntimeException.class,this::checkout);
        assertEquals(0,count("customer_order"));assertEquals(0,count("checkout"));assertEquals(0,count("finance_source_outbox"));assertEquals(1,count("cart_item"));verifyNoInteractions(notifications);
    }
    @Test void changedQuoteIdentityRollsBackInsteadOfChargingWrongMoney(){
        when(finance.quote(any())).thenAnswer(invocation->{var result=quote(invocation.getArgument(0));result.put("checkoutId",UUID.randomUUID().toString());return result;});
        assertThrows(RuntimeException.class,this::checkout);assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));
    }
    @Test void acceptedMoneyAndSnapshotCannotBeRewritten(){
        checkout();assertThrows(RuntimeException.class,()->jdbc.execute("UPDATE order_schema.customer_order SET grand_total=1"));
        assertThrows(RuntimeException.class,()->jdbc.execute("UPDATE order_schema.checkout SET tax_amount=0"));
        assertThrows(RuntimeException.class,()->jdbc.execute("UPDATE order_schema.order_financial_snapshot SET snapshot_hash=repeat('a',64)"));
    }
    EventEnvelope<DeliveryStatusChangedData> delivered(CheckoutResponse checkout){
        UUID job=UUID.randomUUID(),id=checkout.orders().getFirst().id();Instant now=Instant.now();
        return new EventEnvelope<>(UUID.randomUUID(),"DELIVERY_STATUS_CHANGED","1.0",now,checkout.id(),null,"integration-service","delivery-job/"+job,
            new DeliveryStatusChangedData(job,checkout.id(),id,"PIDGE","TEST_PROVIDER_DELIVERY","DELIVERED",null,now));
    }
    DeliveryStatusUpdateService deliveryService(){return new DeliveryStatusUpdateService(jdbc,new DeliveryStatusEventValidator(),new DeliveryStatusTransitionPolicy(),mock(DeliveryStatusCustomerNotificationService.class));}
    @Test void actualDeliveryConsumerCreatesOneAuthoritativeFinanceEvent()throws Exception{
        var checkout=checkout();jdbc.update("UPDATE order_schema.customer_order SET status='READY_FOR_PICKUP',accepted_at=now() WHERE id=?",checkout.orders().getFirst().id());
        var event=delivered(checkout);String payload=json.writeValueAsString(event);var service=deliveryService();
        tx.execute(s->service.accept(event,payload));tx.execute(s->service.accept(event,payload));
        assertEquals("DELIVERED",jdbc.queryForObject("SELECT status FROM order_schema.customer_order",String.class));assertEquals(2,count("finance_source_outbox"));
        JsonNode source=json.readTree(jdbc.queryForObject("SELECT payload::text FROM order_schema.finance_source_outbox WHERE kind='DELIVERED'",String.class));
        assertEquals(checkout.id().toString(),source.path("checkoutId").asText());assertEquals(checkout.orders().getFirst().id().toString(),source.path("chefOrderId").asText());
        assertEquals("433.47",source.path("checkoutTotal").asText());assertEquals(event.data().deliveryJobId().toString(),source.path("deliveryJobId").asText());assertEquals(2,source.path("sourceVersion").asInt());
    }
    @Test void deliveryRollbackCannotLeaveAnEligibleFinancialEvent()throws Exception{
        var checkout=checkout();jdbc.update("UPDATE order_schema.customer_order SET status='READY_FOR_PICKUP',accepted_at=now() WHERE id=?",checkout.orders().getFirst().id());
        var event=delivered(checkout);String payload=json.writeValueAsString(event);var service=deliveryService();
        assertThrows(RuntimeException.class,()->tx.execute(s->{service.accept(event,payload);throw new IllegalStateException("Crash before commit");}));
        assertEquals("READY_FOR_PICKUP",jdbc.queryForObject("SELECT status FROM order_schema.customer_order",String.class));assertEquals(1,count("finance_source_outbox"));assertEquals(0,count("delivery_status_inbox"));
    }
    @Test void outboxRetryUsesOriginalPayloadAndFencesStaleWorkers(){
        checkout();var outbox=new FinanceSourceOutboxService(jdbc);var work=tx.execute(s->outbox.claim());assertNotNull(work);assertNull(tx.execute(s->outbox.claim()));
        tx.execute(s->{outbox.retry(work);return null;});assertEquals(work.payload(),jdbc.queryForObject("SELECT payload::text FROM order_schema.finance_source_outbox WHERE event_id=?",String.class,work.eventId()));
        assertThrows(RuntimeException.class,()->jdbc.execute("UPDATE order_schema.finance_source_outbox SET payload='{}'::jsonb"));
    }
}
