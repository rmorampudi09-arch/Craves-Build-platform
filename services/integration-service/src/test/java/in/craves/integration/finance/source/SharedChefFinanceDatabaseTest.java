package in.craves.integration.finance.source;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.catalog.CatalogEligibilityService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real migrations, quotes, capture, journals and payable SQL; approval authority is an explicit signed-source boundary. */
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class SharedChefFinanceDatabaseTest {
    OrderFinancialFinalizationDatabaseTest f;
    ChefFinanceApprovalSource source;
    ChefTaxProfileService profiles;
    CatalogEligibilityService catalog;
    final List<ChefFinanceApprovalSource.Approval> approved=new ArrayList<>();
    UUID sharedId;
    @BeforeEach void setup() {
        f=new OrderFinancialFinalizationDatabaseTest();f.setup();
        source=mock(ChefFinanceApprovalSource.class);
        when(source.current()).thenAnswer(i->new ChefFinanceApprovalSource.Snapshot(UUID.randomUUID(),Instant.now(),true,List.copyOf(approved)));
        profiles=new ChefTaxProfileService(f.jdbc,f.json,source);catalog=new CatalogEligibilityService(f.policies,source);
        f.quotes=new OrderFinancialQuoteService(f.jdbc,f.json,f.policies,profiles);
        approve(f.chef,"36");sharedId=UUID.randomUUID();
        UUID original=f.jdbc.queryForObject("SELECT version_id FROM payment_schema.finance_chef_tax_head WHERE chef_identity_id=?",UUID.class,f.chef);
        f.jdbc.update("INSERT INTO payment_schema.finance_shared_chef_terms_version(id,withholding_rate,source_profile_ids,reason) VALUES (?,0,CAST(? AS jsonb),'Disposable shared reviewed terms')",sharedId,"[\""+original+"\"]");
        f.jdbc.update("UPDATE payment_schema.finance_shared_chef_terms_head SET version_id=? WHERE singleton=true",sharedId);
    }
    void approve(UUID chef,String state) {approved.add(new ChefFinanceApprovalSource.Approval(chef,UUID.randomUUID(),state,Instant.now().minusSeconds(300)));}
    OrderFinancialQuoteService.Request request(UUID chef) {
        return new OrderFinancialQuoteService.Request(UUID.randomUUID(),f.customer,f.pricedAt,List.of(f.input(UUID.randomUUID(),chef)));
    }
    OrderFinancialQuoteService.Response quote(UUID chef) {return f.tx.execute(s->f.quotes.quote(request(chef)));}
    @Test void newlyApprovedChefSellsAndChecksOutWithoutAnIndividualFinanceRecord() {
        UUID chef=UUID.randomUUID();approve(chef,"36");
        var eligibility=catalog.evaluate(UUID.randomUUID());assertTrue(eligibility.eligibleChefIds().contains(chef));
        var version=profiles.resolved(chef);assertEquals("ADMIN_APPROVAL_SHARED_POLICY",version.profile().financeBasis());
        assertNull(version.profile().declaredAggregateTurnover());assertNull(version.profile().financialYear());
        assertNull(version.profile().declarationDate());assertEquals("NOT_RECORDED",version.profile().registrationStatus());
        var snapshot=quote(chef).snapshots().getFirst();assertEquals("338.52",snapshot.path("chefPayable").asText());
        assertEquals("ADMIN_APPROVAL_SHARED_POLICY",snapshot.path("chefFinanceBasis").asText());
        assertFalse(snapshot.has("chefTaxProfileId"));assertTrue(snapshot.path("chefWithholdingReference").asText().endsWith(sharedId.toString()));
        assertEquals(0,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_chef_tax_head WHERE chef_identity_id=?",Integer.class,chef));
        assertEquals(0,f.count("finance_payable"));
    }
    @Test void pendingRejectedAndRemovedChefsCannotObtainPublishingEligibility() {
        UUID chef=UUID.randomUUID();assertFalse(catalog.evaluate(UUID.randomUUID()).eligibleChefIds().contains(chef));
        assertThrows(ResponseStatusException.class,()->quote(chef));
        approve(chef,"36");String hash=catalog.evaluate(UUID.randomUUID()).hash();assertDoesNotThrow(()->quote(chef));
        approved.removeIf(a->a.chefId().equals(chef));
        assertFalse(catalog.evaluate(UUID.randomUUID()).eligibleChefIds().contains(chef));
        assertNotEquals(hash,catalog.evaluate(UUID.randomUUID()).hash());assertThrows(ResponseStatusException.class,()->quote(chef));
        approve(chef,"UNSUPPORTED");assertTrue(catalog.evaluate(UUID.randomUUID()).eligibleChefIds().contains(chef));
        assertThrows(ResponseStatusException.class,()->quote(chef)); // Existing checkout jurisdiction remains accurate.
    }
    @Test void recordedWithholdingIsPreservedAndRegistrationFlagsDoNotBlockApprovedChefs() {
        var original=f.profiles.resolved(f.chef).profile();
        f.profiles.save(f.admin,f.chef,new ChefTaxProfileService.Profile(original.stateCode(),original.supplyRegime(),
            original.registrationStatus(),original.gstin(),original.declaredAggregateTurnover(),original.financialYear(),
            original.declarationDate(),"1","TEST_SPECIFIC_WITHHOLDING",original.classificationEvidence(),original.feeTermsEvidence()),"Test actual individual assessment");
        var snapshot=quote(f.chef).snapshots().getFirst();assertEquals("3.69",snapshot.path("withholding").asText());
        assertEquals("334.83",snapshot.path("chefPayable").asText());assertTrue(snapshot.has("chefTaxProfileId"));
        f.taxProfile(f.chef,"UNREGISTERED","2100000.00");assertDoesNotThrow(()->quote(f.chef));
        assertTrue(catalog.evaluate(UUID.randomUUID()).eligibleChefIds().contains(f.chef));
    }
    @Test void missingGlobalTermsAndApprovalOutageCannotInventFinancialTerms() {
        UUID chef=UUID.randomUUID();approve(chef,"36");
        f.jdbc.update("UPDATE payment_schema.finance_shared_chef_terms_head SET version_id=NULL WHERE singleton=true");
        assertThrows(IllegalStateException.class,()->quote(chef));assertEquals(1,f.count("finance_checkout_quote"));
        assertTrue(catalog.evaluate(UUID.randomUUID()).eligibleChefIds().contains(chef)); // Publishing does not require separate tax terms.
        when(source.current()).thenThrow(new IllegalStateException("Synthetic source outage"));
        assertThrows(IllegalStateException.class,()->catalog.evaluate(UUID.randomUUID()));
        assertThrows(IllegalStateException.class,()->quote(f.chef));assertEquals(0,f.count("finance_payable"));
    }
    @Test void incompleteApprovalAuthorityNeverReturnsPartialSellingOrQuotes() {
        when(source.current()).thenReturn(new ChefFinanceApprovalSource.Snapshot(UUID.randomUUID(),Instant.now(),false,List.of()));
        assertFalse(catalog.evaluate(UUID.randomUUID()).complete());assertThrows(IllegalStateException.class,()->quote(f.chef));
    }
    @Test void commonTermsAreReadOnlyAndDoNotAssertBankVerification() {
        UUID chef=UUID.randomUUID();approve(chef,"36");
        long versions=f.count("finance_chef_tax_version");
        var one=profiles.resolved(chef);var two=profiles.resolved(chef);assertEquals(one,two);
        assertEquals(versions,f.count("finance_chef_tax_version"));assertEquals(1,f.count("finance_shared_chef_terms_version"));
        assertEquals(0,f.count("finance_payout_instruction"));
        assertThrows(IllegalArgumentException.class,()->profiles.save(f.admin,chef,one.profile(),"Cannot pretend approval is a declaration"));
        assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_shared_chef_terms_version SET withholding_rate=2 WHERE id=?",sharedId));
    }
    @Test void deliveredCapturedOrderForChefWithOnlyAdminApprovalPostsOnce() {
        UUID chef=UUID.randomUUID();approve(chef,"36");f.quote=quote(chef);var snapshot=f.quote.snapshots().getFirst();
        UUID payment=UUID.randomUUID();
        f.jdbc.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,amount,currency,status,provider,provider_status,provider_payment_id) VALUES (?,?,?,?,?,'INR','PAID','RAZORPAY','captured',?)",
            payment,f.quote.checkoutId(),f.customer,"shared-test/"+payment,new BigDecimal(f.quote.total()),"pay_"+payment.toString().replace("-",""));
        var delivered=f.event(snapshot,"DELIVERED");
        assertEquals("POSTED",f.accept(delivered).result());assertEquals("POSTED",f.accept(delivered).result());
        assertEquals(new BigDecimal("338.52"),f.jdbc.queryForObject("SELECT amount FROM payment_schema.finance_payable WHERE chef_identity_id=?",BigDecimal.class,chef));
        assertEquals(1,f.count("finance_earning_projection"));assertEquals(1,f.count("finance_payable"));
        assertEquals(2,f.count("ledger_transaction"));assertEquals(0,f.count("finance_payout_instruction"));
    }
    @Test void sharedQuoteReplayKeepsOriginalTermsAfterGlobalTermsChangeAndApprovalRemoval() {
        UUID chef=UUID.randomUUID();approve(chef,"36");var request=request(chef);var first=f.tx.execute(s->f.quotes.quote(request));
        UUID next=UUID.randomUUID();f.jdbc.update("INSERT INTO payment_schema.finance_shared_chef_terms_version(id,withholding_rate,source_profile_ids,reason) VALUES (?,1,'[\"00000000-0000-0000-0000-000000000001\"]','Test subsequent common terms')",next);
        f.jdbc.update("UPDATE payment_schema.finance_shared_chef_terms_head SET version_id=?",next);
        assertEquals("334.83",quote(chef).snapshots().getFirst().path("chefPayable").asText());
        approved.removeIf(a->a.chefId().equals(chef));var replay=f.tx.execute(s->f.quotes.quote(request));
        assertEquals(FinancialJson.hash(f.json.valueToTree(first),f.json),FinancialJson.hash(f.json.valueToTree(replay),f.json));
        assertEquals(0,f.count("finance_payout_instruction"));
    }
}
