package in.craves.integration.payout;

import in.craves.integration.payout.bank.BankOnboardingService;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static in.craves.integration.payout.bank.BankOnboardingModels.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class BankAutomationSafetyDatabaseTest {
    BankOnboardingDatabaseTest b;
    @BeforeEach void setup() throws Exception {b=new BankOnboardingDatabaseTest();b.setup();}
    @Test void identityOutageBeforeProviderPostIsSafelyRetryable() {
        var request=b.submit();
        when(b.identities.fetch(b.f.chef.identityId())).thenThrow(new IllegalStateException("source timeout"));
        b.banks.processOne();assertEquals("QUEUED",b.banks.status(b.f.chef).state());verify(b.provider,never()).create(any(),any());
        when(b.identities.fetch(b.f.chef.identityId())).thenReturn(b.identity("APPROVED"));
        when(b.provider.create(any(),any())).thenReturn(b.success("resumed"));b.due();b.banks.processOne();
        assertEquals("VERIFIED",b.banks.status(b.f.chef).state());verify(b.provider,times(1)).create(eq(request.id()),any());
    }
    @Test void expiredVerificationBlocksBalanceButCanBeRefreshedUsingGet() {
        var request=b.verified();b.f.earning(Instant.now().minusSeconds(172900));
        b.f.jdbc.update("UPDATE payment_schema.finance_bank_request SET verified_at=now()-interval '25 hours' WHERE id=?",request.id());
        assertEquals("VALIDATING",b.banks.status(b.f.chef).state());assertTrue(b.f.service.balance(b.f.chef).onHold());
        assertEquals("0.00",b.f.service.balance(b.f.chef).available());assertTrue(b.f.service.dueChefs().isEmpty());
        when(b.provider.fetch(any(),any(),eq("fav_first"))).thenReturn(b.success("first"));b.due();b.banks.processOne();
        assertEquals("VERIFIED",b.banks.status(b.f.chef).state());assertEquals("343.17",b.f.service.balance(b.f.chef).available());
        verify(b.provider,times(1)).create(any(),any());verify(b.provider,times(1)).fetch(any(),any(),eq("fav_first"));
    }
    @Test void sameDetailsCanBeExplicitlyResubmittedAfterDefinitiveFailure() {
        var first=b.submit();when(b.provider.create(any(),any())).thenReturn(new Result("fav_failed","fa_failed","cont_failed","VALIDATION_FAILED","a".repeat(64)));
        b.banks.processOne();var second=b.banks.submit(b.f.chef,b.request(UUID.randomUUID(),first.id(),"001234567890"));
        assertNotEquals(first.id(),second.id());assertEquals("QUEUED",second.state());assertEquals(2,b.f.count("finance_bank_request"));
        assertEquals("SUPERSEDED",b.f.jdbc.queryForObject("SELECT state FROM payment_schema.finance_bank_request WHERE id=?",String.class,first.id()));
    }
    @Test void bankUnvalidatedMeansUnavailableNotMissingEarnings() {
        b.submit();b.f.earning(Instant.now().minusSeconds(172900));
        var balance=b.f.service.balance(b.f.chef);assertEquals("343.17",balance.outstanding());
        assertEquals("0.00",balance.available());assertTrue(balance.onHold());assertFalse(balance.executionEnabled());
        assertTrue(b.f.service.dueChefs().isEmpty());
    }
    @Test void adminCannotReplaceAutomaticallyManagedBeneficiary() {
        b.verified();
        assertThrows(RuntimeException.class,()->b.f.tx.execute(s->{b.f.service.bindVerifiedBeneficiary(b.f.admin,b.f.chef.identityId(),
                new ChefPayoutService.Binding("fa_override","cont_override","Human supplied evidence","Should be denied"));return null;}));
    }
    @Test void accountRecheckFailureDoesNotStopReconcilingPreviouslySubmittedPayout() {
        b.verified();b.f.earning(Instant.now().minusSeconds(30));var payout=b.f.withdraw(UUID.randomUUID(),"343.17");var work=b.f.claim();
        b.f.tx.execute(s->{b.f.service.recordOutcome(work,new RazorpayXPayoutClient.Receipt("pout_processing","processing",null));return null;});
        when(b.provider.fetch(any(),any(),eq("fav_first"))).thenReturn(new Result("fav_first","fa_first","cont_first","VALIDATION_FAILED","b".repeat(64)));
        b.due();b.banks.processOne();assertTrue(b.f.service.balance(b.f.chef).onHold());
        b.f.jdbc.update("UPDATE payment_schema.finance_payout_instruction SET next_attempt_at=now()-interval '1 second' WHERE id=?",payout.id());
        var reconcile=b.f.claim();assertNotNull(reconcile);assertEquals("pout_processing",reconcile.providerId());
        b.f.tx.execute(s->{b.f.service.recordOutcome(reconcile,new RazorpayXPayoutClient.Receipt("pout_processing","processed","TEST_UTR"));return null;});
        assertEquals("PAID",b.f.service.balance(b.f.chef).recentPayouts().getFirst().status());
    }
    @Test void invalidInitialVerifiedRowCannotForgeProviderApproval() {
        var request=b.verified();
        assertThrows(RuntimeException.class,()->b.f.jdbc.update("INSERT INTO payment_schema.finance_bank_request(id,chef_identity_id,encrypted_details,fingerprint,last_four,ifsc,consent_version,state,validation_id,fund_account_id,contact_id,beneficiary_id,bank_validated,application_approved,verified_at) SELECT ?,chef_identity_id,encrypted_details,fingerprint,last_four,ifsc,consent_version,'VERIFIED','fav_forged',fund_account_id,contact_id,beneficiary_id,true,true,now() FROM payment_schema.finance_bank_request WHERE id=?",UUID.randomUUID(),request.id()));
    }
    @Test void rollingLimitPreventsRepeatedChargeableResubmissions() {
        b.banks.configure(b.f.admin,new BankOnboardingService.ControlChange(1,true,true,1,"Limit test"));
        var first=b.submit();when(b.provider.create(any(),any())).thenReturn(new Result("fav_failed","fa_failed","cont_failed","VALIDATION_FAILED","a".repeat(64)));b.banks.processOne();
        assertThrows(RuntimeException.class,()->b.banks.submit(b.f.chef,b.request(UUID.randomUUID(),first.id(),"001234567891")));
        assertEquals(1,b.f.count("finance_bank_request"));
    }
    @Test void withdrawingAfterAutomaticValidationReachesOriginalPayoutAdapter() {
        b.verified();b.f.earning(Instant.now().minusSeconds(30));var payout=b.f.withdraw(UUID.randomUUID(),"343.17");var work=b.f.claim();
        assertEquals("fa_first",work.fundAccountId());assertEquals(payout.id(),work.id());
        b.f.tx.execute(s->{b.f.service.recordOutcome(work,new RazorpayXPayoutClient.Receipt("pout_auto_bank","processed","TEST_UTR"));return null;});
        assertEquals("0.00",b.f.service.balance(b.f.chef).outstanding());assertEquals("PAID",b.f.service.balance(b.f.chef).recentPayouts().getFirst().status());
    }
}
