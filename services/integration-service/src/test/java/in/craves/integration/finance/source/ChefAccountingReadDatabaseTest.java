package in.craves.integration.finance.source;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.ManualChefSettlementService;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.settlement.ChefAccountingSummary;
import in.craves.integration.settlement.ChefFinancialModels.CreateEarningRequest;
import in.craves.integration.settlement.ChefFinancialRepository;
import in.craves.integration.settlement.ChefFinancialService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ChefAccountingReadDatabaseTest {
    OrderFinancialFinalizationDatabaseTest f;
    ChefFinancialRepository repository;
    ManualChefSettlementService manual;
    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        f=new OrderFinancialFinalizationDatabaseTest() {
            @Override void activate(String rate) {
                var policy=new FinancePolicy(LocalDate.of(2026,9,14),true,false,true,48,0,60,rate,"5","18","18","18",
                        FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0.00",false,"TEST owner inclusive fee");
                long revision=policies.current().revision();
                var draft=tx.execute(s->policies.draft(admin,new FinancePolicyService.DraftRequest(policy,"TEST inclusive commercial choice")));
                tx.execute(s->policies.activate(admin,draft.id(),new FinancePolicyService.ActivateRequest(revision,draft.contentHash(),"TEST only")));
            }
            @Override OrderFinancialQuoteService.OrderInput input(UUID id,UUID owner) {
                return new OrderFinancialQuoteService.OrderInput(id,owner,UUID.randomUUID(),"36","36","40.00",
                        List.of(new OrderFinancialQuoteService.Item(UUID.randomUUID(),1,"1000.00","1000.00")));
            }
        };
        f.setup(); repository=new ChefFinancialRepository(f.jdbc,f.json);
        manual=new ManualChefSettlementService(f.jdbc,f.json,f.policies,new LedgerPostingService(f.jdbc,f.json,true),true);
    }
    void deliver(){f.payment(f.quote.total(),"PAID",f.customer);assertEquals("POSTED",f.accept(f.event(f.snapshot,"DELIVERED")).result());}
    ChefAccountingSummary summary(){return ChefAccountingSummary.read(f.jdbc,f.chef);}
    ManualChefSettlementService.Instruction reserve(){return f.tx.execute(s->manual.reserveAdmin(f.admin,f.chef,
            new ManualChefSettlementService.Reservation(UUID.randomUUID(),"930.00","TEST reservation")));}
    ManualChefSettlementService.Instruction act(ManualChefSettlementService.Instruction i,ManualChefSettlementService.Action action) {
        boolean money=action==ManualChefSettlementService.Action.CONFIRM_PAID || action==ManualChefSettlementService.Action.CONFIRM_REVERSED;
        return f.tx.execute(s->manual.change(f.admin,i.id(),new ManualChefSettlementService.Change(UUID.randomUUID(),i.version(),action,"TEST evidence",
                action==ManualChefSettlementService.Action.AUTHORIZE_TRANSFER?"TEST destination":null,
                money?"TEST bank evidence":null,money?"TEST UTR":null,money?i.amount():null,money?Instant.now():null)));
    }
    @Test void quoteOrUncapturedDeliveryNeverLooksLikeEarnings(){
        assertEquals(0,summary().recordedOrders());assertEquals(List.of(),repository.listForChef(f.chef,100));
        f.accept(f.event(f.snapshot,"DELIVERED"));assertEquals(0,summary().recordedOrders());assertEquals("0.00",summary().outstanding());
    }
    @Test void capturedButNotDeliveredIsNotChefEarnings(){
        f.payment(f.quote.total(),"PAID",f.customer);f.accept(f.event(f.snapshot,"BOUND"));
        assertEquals(List.of(),repository.listForChef(f.chef,100));assertEquals("0.00",summary().originalNetEarnings());
    }
    @Test void inclusiveSevenPercentFlowsToExistingEarningsEndpoint(){
        deliver();var rows=repository.listForChef(f.chef,100);assertEquals(1,rows.size());var e=rows.getFirst();
        assertEquals(f.order,e.orderId());assertEquals("APPROVED",e.status());assertEquals(new BigDecimal("70.00"),e.commissionAmount());
        assertEquals(new BigDecimal("930.00"),e.netPayable());assertEquals(new BigDecimal("0.00"),e.taxWithheldAmount());
        assertEquals("59.32",summary().feeBeforeGst());assertEquals("10.68",summary().feeGst());assertEquals("70.00",summary().totalServiceFee());
        assertEquals("1000.00",summary().grossFood());assertEquals("930.00",summary().outstanding());assertEquals("0.00",summary().otherLedgerMovements());
        assertEquals("50.00",f.snapshot.path("foodGst").asText());assertEquals(0,f.count("chef_earning_entry"));
    }
    @Test void replayCannotDuplicateDisplayOrSummary(){
        deliver();f.tx.execute(s->f.finalizer.finish(f.order));assertEquals(1,repository.listForChef(f.chef,100).size());
        assertEquals(1,summary().recordedOrders());assertEquals("930.00",summary().originalNetEarnings());
    }
    @Test void reversedEarningsCarryConsistentDatesForTheInstalledApp(){
        deliver();var original=repository.listForChef(f.chef,100).getFirst();
        var lines=f.jdbc.query("SELECT * FROM payment_schema.ledger_line WHERE transaction_id=? ORDER BY sequence",
                (rs,n)->new in.craves.integration.ledger.LedgerJournal.Line(rs.getString("account_code"),"INR",
                    rs.getBigDecimal("credit_amount").toPlainString(),rs.getBigDecimal("debit_amount").toPlainString(),
                    rs.getObject("chef_identity_id",UUID.class),rs.getObject("delivery_attempt_id",UUID.class),rs.getString("provider_id"),
                    rs.getObject("payment_id",UUID.class),rs.getObject("refund_id",UUID.class),rs.getObject("payout_instruction_id",UUID.class)),original.id());
        UUID checkout=f.jdbc.queryForObject("SELECT checkout_id FROM payment_schema.ledger_transaction WHERE id=?",UUID.class,original.id());
        var entry=new in.craves.integration.ledger.LedgerJournal.Entry("TEST/full-reversal/"+original.id(),UUID.randomUUID(),"TEST","FULL_REVERSAL",
                checkout,f.order,"INR",Instant.now(),"TEST isolated reversal",original.id(),"SERVICE","TEST",lines);
        f.tx.execute(s->new LedgerPostingService(f.jdbc,f.json,true).post(entry));
        var reversed=repository.listForChef(f.chef,100).getFirst();
        assertEquals("REVERSED",reversed.status());assertNotNull(reversed.reversedAt());
        assertFalse(reversed.reversedAt().isBefore(reversed.approvedAt()));
        assertFalse(reversed.updatedAt().isBefore(reversed.reversedAt()));
        assertEquals("0.00",summary().outstanding());assertEquals("-930.00",summary().otherLedgerMovements());
    }
    @Test void anotherChefAndCustomerCannotReadThisChefEarnings(){
        deliver();assertTrue(repository.listForChef(UUID.randomUUID(),100).isEmpty());
        var service=new ChefFinancialService(repository);
        assertThrows(RuntimeException.class,()->service.listChef(new CravesPrincipal(f.customer,"",Set.of("CUSTOMER")),100));
        assertTrue(service.listChef(new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF")),100).isEmpty());
    }
    @Test void holdHidesAvailabilityButNotActualEarnings(){
        deliver();f.jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=true,hold_kind='OPERATIONAL',hold_reason='TEST hold' WHERE chef_identity_id=?",f.chef);
        var balance=manual.balance(f.admin,f.chef);assertEquals("0.00",balance.available());assertTrue(balance.onHold());
        assertEquals("930.00",balance.accounting().outstanding());assertEquals("930.00",balance.accounting().originalNetEarnings());
        assertThrows(RuntimeException.class,this::reserve);
    }
    @Test void reservationIsNotPaidAndConfirmationReconcilesExactly(){
        deliver();var reserved=reserve();assertEquals("SETTLEMENT_PENDING",repository.listForChef(f.chef,100).getFirst().status());
        assertEquals("0.00",summary().recordedPayments());assertEquals("930.00",summary().outstanding());
        var submitting=act(reserved,ManualChefSettlementService.Action.AUTHORIZE_TRANSFER);
        act(submitting,ManualChefSettlementService.Action.CONFIRM_PAID);
        assertEquals("SETTLED",repository.listForChef(f.chef,100).getFirst().status());assertEquals("930.00",summary().recordedPayments());
        assertEquals("0.00",summary().outstanding());assertEquals("0.00",summary().otherLedgerMovements());assertEquals("70.00",summary().totalServiceFee());
    }
    @Test void returnedBankPaymentRestoresOutstandingNotNewEarnings(){
        deliver();var paid=act(act(reserve(),ManualChefSettlementService.Action.AUTHORIZE_TRANSFER),ManualChefSettlementService.Action.CONFIRM_PAID);
        act(paid,ManualChefSettlementService.Action.CONFIRM_REVERSED);
        assertEquals("APPROVED",repository.listForChef(f.chef,100).getFirst().status());assertEquals("0.00",summary().recordedPayments());
        assertEquals("930.00",summary().outstanding());assertEquals(1,summary().recordedOrders());assertTrue(manual.balance(f.admin,f.chef).onHold());
    }
    @Test void legacyRecordsStayVisibleButCannotBecomeNewWithdrawableMoney(){
        deliver();repository.create(new CreateEarningRequest(UUID.randomUUID(),f.chef,"ON_DEMAND","INR",new BigDecimal("100.00"),
                new BigDecimal("7.00"),BigDecimal.ZERO,BigDecimal.ZERO,new BigDecimal("93.00"),"TEST legacy","TEST old entry"),f.admin.identityId());
        assertEquals(2,repository.listForChef(f.chef,100).size());assertEquals(1,repository.listForChef(f.chef,1).size());
        assertEquals(1,summary().recordedOrders());assertEquals(1,summary().legacyRecords());assertEquals("930.00",summary().outstanding());
    }
    @Test void refundsRequireReviewAndDoNotPretendMoneyWasRepaid(){
        deliver();UUID payment=f.jdbc.queryForObject("SELECT id FROM payment_schema.payment_order",UUID.class);
        f.jdbc.update("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,chef_sub_order_id) VALUES (?,?,?,100,'INR','REQUESTED',?)",
                UUID.randomUUID(),payment,"TEST refund",f.order);
        assertTrue(manual.balance(f.admin,f.chef).onHold());assertEquals("0.00",manual.balance(f.admin,f.chef).available());
        assertEquals("930.00",summary().outstanding());assertEquals("0.00",summary().recordedPayments());assertThrows(RuntimeException.class,this::reserve);
    }
}
