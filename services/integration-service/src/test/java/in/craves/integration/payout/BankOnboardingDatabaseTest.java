package in.craves.integration.payout;

import in.craves.integration.payout.bank.*;
import in.craves.integration.security.CravesPrincipal;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import static in.craves.integration.payout.bank.BankOnboardingModels.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class BankOnboardingDatabaseTest {
    ChefPayoutDatabaseTest f;
    BankOnboardingService banks;
    BankApplicantClient identities;
    RazorpayBankValidationClient provider;
    BankDataCipher cipher;
    UUID application=UUID.randomUUID();
    @BeforeEach void setup() throws Exception {
        f=new ChefPayoutDatabaseTest();f.setup();
        identities=mock(BankApplicantClient.class);provider=mock(RazorpayBankValidationClient.class);
        when(provider.ready()).thenReturn(true);
        when(identities.fetch(f.chef.identityId())).thenReturn(identity("APPROVED"));
        String key=Base64.getEncoder().encodeToString(new byte[32]);
        cipher=new BankDataCipher(f.json,"test","{\"test\":\""+key+"\"}");
        banks=new BankOnboardingService(f.jdbc,cipher,identities,provider,
                new DataSourceTransactionManager(f.jdbc.getDataSource()),true);
        banks.configure(f.admin,new BankOnboardingService.ControlChange(0,true,true,10,"Isolated test configuration only"));
    }
    Identity identity(String status) {return new Identity(f.chef.identityId(),application,"Test Chef","chef@example.invalid","+919000000001",status,Instant.now());}
    Submission request(UUID key,UUID expected,String account) {return new Submission(key,expected,"Test Chef",account,account,"HDFC0000053",true,CONSENT_VERSION);}
    Status submit() {return banks.submit(f.chef,request(UUID.randomUUID(),null,"001234567890"));}
    Result success(String id) {return new Result("fav_"+id,"fa_"+id,"cont_"+id,"BANK_VALIDATED","a".repeat(64));}
    void due() {f.jdbc.execute("UPDATE payment_schema.finance_bank_request SET next_attempt_at=now()-interval '1 second'");}
    Status verified() {
        var status=submit();when(provider.create(eq(status.id()),any())).thenReturn(success("first"));assertTrue(banks.processOne());return banks.status(f.chef);
    }
    @Test void submissionEncryptsBankAndReturnsOnlyMaskedReadModel() {
        var status=submit();assertEquals("QUEUED",status.state());assertEquals("7890",status.lastFour());
        String encrypted=f.jdbc.queryForObject("SELECT encrypted_details FROM payment_schema.finance_bank_request WHERE id=?",String.class,status.id());
        assertFalse(encrypted.contains("001234567890"));assertFalse(encrypted.contains("chef@example.invalid"));
        assertEquals("001234567890",cipher.decrypt(status.id(),f.chef.identityId(),encrypted).accountNumber());
        assertFalse(status.toString().contains("001234567890"));verify(provider,never()).create(any(),any());
    }
    @Test void identicalClientRetryAndNewAliasDoNotCreateAnotherBankValidation() {
        var request=request(UUID.randomUUID(),null,"001234567890");var first=banks.submit(f.chef,request);
        assertEquals(first.id(),banks.submit(f.chef,request).id());
        assertEquals(first.id(),banks.submit(f.chef,request(UUID.randomUUID(),first.id(),"001234567890")).id());
        assertEquals(1,f.count("finance_bank_request"));assertEquals(2,f.count("finance_bank_submission_receipt"));
    }
    @Test void changedPayloadUnderSameKeyAndStaleRevisionAreRejected() {
        UUID key=UUID.randomUUID();banks.submit(f.chef,request(key,null,"001234567890"));
        assertThrows(RuntimeException.class,()->banks.submit(f.chef,request(key,null,"001234567891")));
        assertThrows(RuntimeException.class,()->banks.submit(f.chef,request(UUID.randomUUID(),null,"001234567891")));
        assertEquals(1,f.count("finance_bank_request"));
    }
    @Test void providerSuccessAutomaticallyBindsWithoutHumanVerification() {
        var status=verified();assertEquals("VERIFIED",status.state());assertTrue(status.bankValidated());assertTrue(status.applicationApproved());
        assertEquals("RAZORPAY_VALIDATION",f.jdbc.queryForObject("SELECT verification_actor_type FROM payment_schema.finance_beneficiary_version b JOIN payment_schema.finance_bank_request r ON r.beneficiary_id=b.id WHERE r.id=?",String.class,status.id()));
        assertNull(f.jdbc.queryForObject("SELECT verified_by FROM payment_schema.finance_beneficiary_version b JOIN payment_schema.finance_bank_request r ON r.beneficiary_id=b.id WHERE r.id=?",UUID.class,status.id()));
        assertTrue(f.jdbc.queryForObject("SELECT payment_schema.finance_bank_ready(chef_identity_id,beneficiary_id) FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=?",Boolean.class,f.chef.identityId()));
    }
    @Test void pendingApplicantNeedsOnlyExistingChefApprovalNotABankApproval() {
        when(identities.fetch(f.chef.identityId())).thenReturn(identity("PENDING"));
        var status=submit();when(provider.create(any(),any())).thenReturn(success("pending"));banks.processOne();
        assertEquals("WAITING_APPROVAL",banks.status(f.chef).state());assertTrue(banks.status(f.chef).bankValidated());
        when(identities.fetch(f.chef.identityId())).thenReturn(identity("APPROVED"));
        when(provider.fetch(any(),any(),eq("fav_pending"))).thenReturn(success("pending"));due();banks.processOne();
        assertEquals("VERIFIED",banks.status(f.chef).state());verify(provider,times(1)).create(eq(status.id()),any());
    }
    @Test void automaticBankActivationNeverClearsRefundOrAdminHold() {
        f.service.hold(f.admin,f.chef.identityId(),new ChefPayoutService.Hold(true,"Refund responsibility unresolved"));verified();
        assertTrue(f.service.balance(f.chef).onHold());
        assertEquals("Refund responsibility unresolved",f.jdbc.queryForObject("SELECT hold_reason FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=?",String.class,f.chef.identityId()));
    }
    @Test void lostPostResponseUsesLookupAndNotASecondPost() {
        var status=submit();when(provider.create(any(),any())).thenThrow(new IllegalStateException("network"));
        banks.processOne();assertEquals("UNKNOWN",banks.status(f.chef).state());
        when(provider.find(any(),any(),any())).thenReturn(success("recovered"));due();banks.processOne();
        assertEquals("VERIFIED",banks.status(f.chef).state());verify(provider,times(1)).create(eq(status.id()),any());verify(provider,times(1)).find(eq(status.id()),any(),any());
    }
    @Test void completedValidationWithNameMismatchDoesNotActivate() {
        var status=submit();when(provider.create(any(),any())).thenReturn(new Result("fav_mismatch","fa_mismatch","cont_mismatch","NAME_MISMATCH","b".repeat(64)));
        banks.processOne();assertEquals("NAME_MISMATCH",banks.status(f.chef).state());assertFalse(banks.status(f.chef).bankValidated());
        assertFalse(f.jdbc.queryForObject("SELECT payment_schema.finance_bank_ready(chef_identity_id,beneficiary_id) FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=?",Boolean.class,f.chef.identityId()));
    }
    @Test void bankChangeCreatesNewVersionAndCannotRedirectExistingPayout() {
        var status=verified();f.earning(Instant.now().minusSeconds(30));f.withdraw(UUID.randomUUID(),"343.17");
        assertThrows(RuntimeException.class,()->banks.submit(f.chef,request(UUID.randomUUID(),status.id(),"001234567899")));
        assertEquals(status.id(),banks.status(f.chef).id());
    }
    @Test void supersededBankResponseCannotActivateOldAccount() {
        var first=submit();when(provider.create(eq(first.id()),any())).thenAnswer(call->{
            banks.submit(f.chef,request(UUID.randomUUID(),first.id(),"001234567899"));return success("old");});
        banks.processOne();assertNotEquals(first.id(),banks.status(f.chef).id());assertEquals("QUEUED",banks.status(f.chef).state());
        assertEquals("SUPERSEDED",f.jdbc.queryForObject("SELECT state FROM payment_schema.finance_bank_request WHERE id=?",String.class,first.id()));
    }
    @Test void concurrentWorkersSubmitOnlyOneValidation() throws Exception {
        submit();when(provider.create(any(),any())).thenReturn(success("concurrent"));
        try(var pool=Executors.newFixedThreadPool(6)) {
            Callable<Boolean> work=()->banks.processOne();for(var result:pool.invokeAll(java.util.Collections.nCopies(6,work)))result.get();
        }
        assertEquals("VERIFIED",banks.status(f.chef).state());verify(provider,times(1)).create(any(),any());
    }
    @Test void newEnrollmentBlocksRawPayoutReservationUntilVerified() {
        submit();f.earning(Instant.now().minusSeconds(30));
        assertThrows(RuntimeException.class,()->f.withdraw(UUID.randomUUID(),"343.17"));assertEquals(0,f.count("finance_payout_instruction"));
    }
    @Test void evidenceConsentAndOriginalDetailsCannotBeRewritten() {
        var status=verified();
        assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_bank_request SET encrypted_details='changed' WHERE id=?",status.id()));
        assertThrows(RuntimeException.class,()->f.jdbc.execute("DELETE FROM payment_schema.finance_bank_evidence"));
        assertThrows(RuntimeException.class,()->f.jdbc.execute("DELETE FROM payment_schema.finance_bank_submission_receipt"));
        assertThrows(RuntimeException.class,()->f.jdbc.execute("DELETE FROM payment_schema.finance_bank_head"));
    }
    @Test void rejectedOrDifferentApplicantCannotSubmitOrReadAnothersProfile() {
        var other=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CUSTOMER"));
        assertEquals("NOT_SUBMITTED",banks.status(other).state());assertThrows(RuntimeException.class,()->banks.submit(other,request(UUID.randomUUID(),null,"001234567890")));
        when(identities.fetch(f.chef.identityId())).thenReturn(identity("REJECTED"));
        assertThrows(RuntimeException.class,()->submit());assertEquals(0,f.count("finance_bank_request"));
    }
    @Test void onlyFinanceCanChangeControlsAndStaleEditsFail() {
        assertThrows(RuntimeException.class,()->banks.configure(f.chef,new BankOnboardingService.ControlChange(1,true,true,3,"Unauthorized")));
        assertThrows(RuntimeException.class,()->banks.configure(f.admin,new BankOnboardingService.ControlChange(0,true,true,3,"Stale")));
        assertEquals(1,banks.controls(f.admin).revision());
    }
    @Test void disablingValidationMakesNoProviderRequest() {
        submit();banks.configure(f.admin,new BankOnboardingService.ControlChange(1,true,false,3,"Pause automatic validation"));
        assertFalse(banks.processOne());verify(provider,never()).create(any(),any());assertEquals("QUEUED",banks.status(f.chef).state());
    }
}
