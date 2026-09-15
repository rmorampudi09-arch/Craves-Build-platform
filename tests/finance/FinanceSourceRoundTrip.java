package in.craves.financetest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.finance.source.*;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.*;
import in.craves.integration.web.InternalOrderFinanceController;
import in.craves.integration.web.ChefDocumentSourceController;
import in.craves.order.finance.*;
import in.craves.order.config.NotificationClientProperties;
import in.craves.order.delivery.*;
import in.craves.order.delivery.DeliveryStatusModels.*;
import in.craves.order.service.*;
import in.craves.order.service.CatalogClient.*;
import in.craves.order.service.CustomerAddressClient.CustomerAddress;
import in.craves.order.web.ApiDtos.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.*;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import static org.mockito.Mockito.*;

/** Actual Order and Integration classes, separate transactions, signed wire payloads and disposable PostgreSQL.
 * Catalog/address, notification delivery, Razorpay network and capture confirmation are explicit test boundaries.
 * This does not call a merchant account, bank, APIM or deployed Azure application.
 */
public final class FinanceSourceRoundTrip {
    @Configuration @EnableAspectJAutoProxy(proxyTargetClass=true) @EnableTransactionManagement
    static class Config {}
    private static final List<String> CHECKS=new ArrayList<>();
    private static final String KEY="TEST_ONLY_DEDICATED_FINANCE_SIGNING_KEY_20260914";
    private static void check(boolean condition,String label){if(!condition)throw new AssertionError(label);CHECKS.add(label);}
    private static MockHttpServletRequest signed(byte[] bytes){var request=new MockHttpServletRequest();request.setContent(bytes);request.addHeader("X-Craves-Finance-Signature",FinanceSourceClient.sign(bytes,KEY));return request;}
    public static void main(String[] args)throws Exception{
        if(args.length>1 || (args.length==1 && !"--manual".equals(args[0])))throw new IllegalArgumentException("Unsupported connected test mode");
        boolean manualMode=args.length==1;
        if(!"true".equals(System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE")))throw new IllegalArgumentException("Explicit disposable database acknowledgement is required");
        String url=System.getenv("LEDGER_TEST_JDBC_URL");
        if(url==null || !url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"))throw new IllegalArgumentException("Only disposable local chef_ledger_test is allowed");
        var dataSource=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        var jdbc=new JdbcTemplate(dataSource);var manager=new DataSourceTransactionManager(dataSource);
        var transaction=new TransactionTemplate(manager);var remoteTransaction=new TransactionTemplate(manager);
        remoteTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        var json=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        UUID customer=UUID.randomUUID(),chef=UUID.randomUUID(),kitchen=UUID.randomUUID(),menu=UUID.randomUUID(),address=UUID.randomUUID();
        for(String schema:List.of("order_schema","payment_schema","delivery_schema"))jdbc.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        jdbc.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id,identity_id) VALUES (?,?)",kitchen,chef);
        for(var pair:List.of(new String[]{"order-service","order_schema"},new String[]{"integration-service","payment_schema"})){
            var flyway=Flyway.configure().dataSource(dataSource).schemas(pair[1]).defaultSchema(pair[1])
                .locations("filesystem:services/"+pair[0]+"/src/main/resources/db/migration").load();
            flyway.migrate();flyway.validate();check(flyway.migrate().migrationsExecuted==0,pair[0]+" full migration chain is repeatable");
        }
        jdbc.update("UPDATE order_schema.charge_policy SET delivery_fee_flat=39 WHERE is_active=true");
        var catalog=mock(CatalogClient.class);var addresses=mock(CustomerAddressClient.class);
        var transport=mock(FinanceSourceClient.class);var notificationOutbox=mock(NotificationOutboxService.class);
        var provider=mock(RazorpayXPayoutClient.class);when(provider.ready()).thenReturn(!manualMode);
        when(catalog.getActiveMenuItem(menu)).thenReturn(new CatalogMenuItem(menu,kitchen,"Round-trip meal","Test only","MEAL","VEG",new BigDecimal("369.00"),"INR",1,20,"MILD",500,false,true,"ACTIVE"));
        when(catalog.getKitchen(kitchen)).thenReturn(new CatalogKitchen(kitchen,chef,"Round-trip kitchen","Test chef","Test", "9000000000","test@example.invalid","Test pickup",null,null,"Test area","Hyderabad","Telangana","500001",new BigDecimal("17.40"),new BigDecimal("78.40"),"ACTIVE"));
        when(addresses.getActiveOwnedAddress(customer,address)).thenReturn(new CustomerAddress(address,customer,"Home","Test customer","9000000001","Test dropoff",null,null,"Test area","Hyderabad","Telangana","500001",new BigDecimal("17.41"),new BigDecimal("78.41"),true,true,Instant.now(),Instant.now()));
        try(var context=new AnnotationConfigApplicationContext()){
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("isolated-finance-test",Map.of(
                "CRAVES_FINANCE_SOURCE_ENABLED","true","CRAVES_FINANCE_FINALIZATION_ENABLED","true",
                "CRAVES_FINANCE_INTERNAL_KEY",KEY,"craves.finance.authoritative-source-ready","true",
                "craves.ledger.posting-enabled","true","craves.razorpayx.production-approved",Boolean.toString(!manualMode),
                "CRAVES_MANUAL_SETTLEMENT_ENABLED",Boolean.toString(manualMode))));
            context.register(Config.class);context.registerBean(JdbcTemplate.class,()->jdbc);context.registerBean(ObjectMapper.class,()->json);
            context.registerBean(DataSourceTransactionManager.class,()->manager);context.registerBean(CatalogClient.class,()->catalog);
            context.registerBean(CustomerAddressClient.class,()->addresses);context.registerBean(FinanceSourceClient.class,()->transport);
            context.registerBean(RazorpayXPayoutClient.class,()->provider);context.registerBean(CheckoutSnapshotFactory.class,CheckoutSnapshotFactory::new);
            context.registerBean(NotificationInternalClient.class,()->new NotificationInternalClient(new NotificationClientProperties(),RestClient.builder(),notificationOutbox));
            context.register(OrderService.class,OrderFinancialBindingService.class,FinancialCheckoutTransactionAspect.class,
                FinancePolicyService.class,ChefTaxProfileService.class,OrderFinancialQuoteService.class,LedgerPostingService.class,
                ChefPayoutService.class,ManualChefSettlementService.class,OrderFinancialFinalizationService.class,InternalOrderFinanceController.class,FinanceSourceOutboxService.class);
            context.refresh();
            var controller=context.getBean(InternalOrderFinanceController.class);
            doAnswer(invocation->remoteTransaction.execute(status->{try{return json.valueToTree(controller.quote(signed(json.writeValueAsBytes(invocation.getArgument(0)))));}catch(Exception e){throw new IllegalStateException(e);}})).when(transport).quote(any());
            doAnswer(invocation->remoteTransaction.execute(status->{try{return json.valueToTree(controller.accept(signed(((String)invocation.getArgument(0)).getBytes(StandardCharsets.UTF_8))));}catch(Exception e){throw new IllegalStateException(e);}})).when(transport).event(anyString());
            var admin=new in.craves.integration.security.CravesPrincipal(UUID.randomUUID(),"",Set.of("PAYMENTS_ADMIN"));
            var chefActor=new in.craves.integration.security.CravesPrincipal(chef,"",Set.of("CHEF"));
            var customerActor=new in.craves.order.security.CravesPrincipal(customer,"",Set.of("CUSTOMER"));
            var policies=context.getBean(FinancePolicyService.class);var profiles=context.getBean(ChefTaxProfileService.class);
            var policy=new FinancePolicy(LocalDate.now(FinancePolicy.ZONE),true,!manualMode,true,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0.00",false,"TEST_ONLY_CLASSIFICATION");
            var draft=policies.draft(admin,new FinancePolicyService.DraftRequest(policy,"Test-only reviewed policy"));
            policies.activate(admin,draft.id(),new FinancePolicyService.ActivateRequest(0,draft.contentHash(),"Test-only certification, not merchant approval"));
            LocalDate today=LocalDate.now(FinancePolicy.ZONE);int start=today.getMonthValue()<4?today.getYear()-1:today.getYear();
            profiles.save(admin,chef,new ChefTaxProfileService.Profile("36","RESTAURANT_ECO_9_5","UNREGISTERED",null,"800000.00",
                start+"-"+String.format("%02d",(start+1)%100),today,"0","TEST_WITHHOLDING_ASSESSMENT","TEST_RESTAURANT_ASSESSMENT","TEST_ACCEPTED_FEE_PLUS_GST"),"Test profile");
            var orders=context.getBean(OrderService.class);orders.addCartItem(customerActor,new AddCartItemRequest(menu,1));
            var checkout=orders.checkout(customerActor,new CheckoutRequest(address,"Round-trip test only"));UUID order=checkout.orders().getFirst().id();
            check(checkout.grandTotal().compareTo(new BigDecimal("433.47"))==0,"Actual checkout returns the bound customer total including component taxes");
            check(jdbc.queryForObject("SELECT count(*) FROM order_schema.order_financial_snapshot",Integer.class)==1,"Order snapshot committed with checkout");
            check(jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_issued_snapshot",Integer.class)==1,"Integration quote persisted in its independent transaction");
            UUID payment=UUID.randomUUID();
            jdbc.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,amount,currency,status,provider,provider_status,provider_payment_id) VALUES (?,?,?,?,?,'INR','PAID','RAZORPAY','captured',?)",
                payment,checkout.id(),customer,"ROUNDTRIP/"+payment,checkout.grandTotal(),"pay_"+payment.toString().replace("-",""));
            var outbox=context.getBean(FinanceSourceOutboxService.class);var bound=outbox.claim();outbox.complete(bound,transport.event(bound.payload()));
            check(jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_capture",Integer.class)==1,"Verified matching capture recognized once");
            check(jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_payable",Integer.class)==0,"Captured but undelivered checkout creates no chef payable");
            var replacement=new FinancePolicy(policy.ledgerStartDate(),true,!manualMode,true,48,0,60,"20","5","18","18","18",FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0.00",false,"TEST_ONLY_CLASSIFICATION");
            var changed=policies.draft(admin,new FinancePolicyService.DraftRequest(replacement,"Test fee changed after checkout"));
            policies.activate(admin,changed.id(),new FinancePolicyService.ActivateRequest(1,changed.contentHash(),"Old order must keep its original fee"));
            jdbc.update("UPDATE order_schema.customer_order SET status='READY_FOR_PICKUP',accepted_at=now() WHERE id=?",order);
            Instant observed=Instant.now();UUID job=UUID.randomUUID();
            var delivered=new EventEnvelope<>(UUID.randomUUID(),"DELIVERY_STATUS_CHANGED","1.0",observed,checkout.id(),null,"integration-service","delivery-job/"+job,
                new DeliveryStatusChangedData(job,checkout.id(),order,"PIDGE","TEST_PROVIDER_DELIVERY","DELIVERED",null,observed));
            var deliveryConsumer=new DeliveryStatusUpdateService(jdbc,new DeliveryStatusEventValidator(),new DeliveryStatusTransitionPolicy(),mock(DeliveryStatusCustomerNotificationService.class));
            String deliveredPayload=json.writeValueAsString(delivered);
            transaction.execute(status->deliveryConsumer.accept(delivered,deliveredPayload));
            var work=outbox.claim();check(work!=null,"Authoritative delivery transaction emitted its financial outbox event");
            var posted=transport.event(work.payload());outbox.complete(work,posted);
            check("POSTED".equals(posted.path("result").asText()),"Actual saved Order event was accepted and finalized by Integration");
            check(jdbc.queryForObject("SELECT payable FROM payment_schema.finance_earning_projection",BigDecimal.class).compareTo(new BigDecimal("338.52"))==0,"Frozen 7 percent plus fee GST survived later 20 percent policy activation");
            check(jdbc.queryForObject("SELECT sum(credit_amount-debit_amount) FROM payment_schema.ledger_line WHERE account_code='CUSTOMER_FUNDS'",BigDecimal.class).signum()==0,"Captured customer funds released exactly once");
            var payouts=context.getBean(ChefPayoutService.class);
            if(!manualMode) {
                payouts.bindVerifiedBeneficiary(admin,chef,new ChefPayoutService.Binding("fa_roundtrip","cont_roundtrip","TEST_BANK_OWNERSHIP","Test binding"));
                payouts.hold(admin,chef,new ChefPayoutService.Hold(false,"Test verified beneficiary release"));
            } else {
                check(jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_beneficiary_version",Integer.class)==0,"Manual source accounting did not invent a provider beneficiary");
                check(jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_bank_request",Integer.class)==0,"Manual mode did not queue bank validation");
                check("CRAVES_MANUAL".equals(payouts.balance(chefActor).payoutMode()),"Chef balance selects the explicitly enabled manual channel");
            }
            check("338.52".equals(payouts.balance(chefActor).available()),"Delivered posted net is available to the correct chef");
            check(payouts.dueChefs().isEmpty(),manualMode?"Automatic provider payouts remain disabled in manual mode":"Automatic 48-hour delay has not matured immediately after delivery");
            check(Boolean.TRUE.equals(jdbc.queryForObject("SELECT automatic_due_at=delivered_at+interval '48 hours' FROM payment_schema.finance_payable",Boolean.class)),"Original delivery-plus-48-hour eligibility timestamp is preserved");
            var withdrawal=payouts.withdraw(chefActor,new ChefPayoutService.Withdrawal(UUID.randomUUID(),"338.52"));
            check("RESERVED".equals(withdrawal.status()) && "0.00".equals(payouts.balance(chefActor).available()),"Manual request atomically reserves the available balance");
            var worker=new ChefPayoutWorker(payouts,provider);
            if(!manualMode) {
                when(provider.submit(any())).thenReturn(new RazorpayXPayoutClient.Receipt("pout_roundtrip","processing",null));
                when(provider.fetch(any())).thenReturn(new RazorpayXPayoutClient.Receipt("pout_roundtrip","processed","TEST_UTR"));
                worker.tick();
                check("PROCESSING".equals(payouts.balance(chefActor).recentPayouts().getFirst().status()),"Actual payout worker records provider processing, not premature PAID");
                jdbc.update("UPDATE payment_schema.finance_payout_instruction SET next_attempt_at=now() WHERE id=?",withdrawal.id());worker.tick();
                check("PAID".equals(payouts.balance(chefActor).recentPayouts().getFirst().status()),"Original payout GET confirmation clears the chef liability");
            } else {
                var manual=context.getBean(ManualChefSettlementService.class);
                var reserved=manual.list(admin).getFirst();
                var authorized=manual.change(admin,reserved.id(),new ManualChefSettlementService.Change(UUID.randomUUID(),reserved.version(),ManualChefSettlementService.Action.AUTHORIZE_TRANSFER,"TEST external destination review","TEST_SECURED_DESTINATION",null,null,null,null));
                worker.tick();
                check("SUBMITTING".equals(manual.list(admin).getFirst().status()),"Provider worker cannot claim a manually authorized transfer");
                var confirmation=new ManualChefSettlementService.Change(UUID.randomUUID(),authorized.version(),ManualChefSettlementService.Action.CONFIRM_PAID,"TEST synthetic bank proof",null,"TEST_BANK_EVIDENCE","TEST_MANUAL_UTR",authorized.amount(),Instant.now());
                var confirmed=manual.change(admin,authorized.id(),confirmation);
                check("PAID".equals(confirmed.status()),"Real manual settlement service confirms the source-earned payable");
                check(confirmed.id().equals(manual.change(admin,authorized.id(),confirmation).id()),"Identical manual bank confirmation replays without another journal");
                check(jdbc.queryForObject("SELECT sum(credit_amount-debit_amount) FROM payment_schema.ledger_line WHERE account_code='BANK'",BigDecimal.class).compareTo(new BigDecimal("338.52"))==0,"Manual payment posts the exact BANK credit");
                check(jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_payout_instruction WHERE provider_id IS NOT NULL OR beneficiary_id IS NOT NULL",Integer.class)==0,"Manual payment retains no fabricated provider or beneficiary identity");
                var manualStatement=new ChefDocumentSourceController(jdbc,true).settlements(chefActor,Instant.now().minusSeconds(3600),Instant.now().plusSeconds(10),"INR","Asia/Kolkata").getBody();
                check(manualStatement.toString().contains("Craves manual") && manualStatement.toString().contains("TEST_MANUAL_UTR"),"Chef settlement PDF source includes the actual manual channel and recorded bank reference");
            }
            check("0.00".equals(payouts.balance(chefActor).outstanding()),"Confirmed payout reconciles outstanding to zero");
            transaction.execute(status->deliveryConsumer.accept(delivered,deliveredPayload));transport.event(work.payload());worker.tick();
            if(manualMode){verify(provider,never()).submit(any());verify(provider,never()).fetch(any());}
            else verify(provider,times(1)).submit(any());
            check(jdbc.queryForObject("SELECT count(*) FROM payment_schema.ledger_transaction",Integer.class)==3,"Capture, earning and payout remain exactly three journals after all replays");
            var statement=new ChefDocumentSourceController(jdbc,true).earnings(chefActor,Instant.now().minusSeconds(3600),Instant.now().plusSeconds(10),"INR","Asia/Kolkata").getBody();
            check(statement.toString().contains("4.65") && statement.toString().contains("Closing recorded outstanding"),"Existing PDF source includes the new earning fee GST and reconciled liability");
            check(!statement.toString().contains(customer.toString()),"Chef statement excludes unrelated customer identity");
            check(payouts.balance(chefActor).manualRequestUsedToday(),"Daily manual quota survives processing and successful payment");
            Files.createDirectories(Path.of("target/finance-roundtrip"));
            json.writerWithDefaultPrettyPrinter().writeValue(Path.of("target/finance-roundtrip/report-"+(manualMode?"manual":"provider")+".json").toFile(),Map.of(
                "status","PASS","scope","actual Order and Integration code, signed in-process transport, disposable PostgreSQL",
                "externalBoundaries","Catalog/address, notifications, Razorpay network and initial capture are controlled fixtures; no bank or production test",
                "checks",CHECKS,"checkCount",CHECKS.size(),"checkoutTotal","433.47","chefGross","369.00","fee","25.83","feeGst","4.65","net","338.52"));
            System.out.println("FINANCE_ROUNDTRIP_PASS mode="+(manualMode?"manual":"provider")+" checks="+CHECKS.size());
        }
    }
}
