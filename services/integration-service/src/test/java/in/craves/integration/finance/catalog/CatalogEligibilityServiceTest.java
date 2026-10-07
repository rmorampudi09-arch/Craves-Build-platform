package in.craves.integration.finance.catalog;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.finance.source.ChefFinanceApprovalSource;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatalogEligibilityServiceTest {
    private final FinancePolicyService policies = mock(FinancePolicyService.class);
    private final ChefFinanceApprovalSource approvals = mock(ChefFinanceApprovalSource.class);
    private final CatalogEligibilityService service = new CatalogEligibilityService(policies, approvals);
    private final UUID policy = UUID.randomUUID();
    private FinancePolicy enabled(LocalDate start) {
        return new FinancePolicy(start,true,false,false,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0",false,"TEST-ONLY");
    }
    private void policy(FinancePolicy value, UUID id) {
        when(policies.current()).thenReturn(new FinancePolicyService.View(1,id,value,List.of(),"TEST",1));
    }
    private void approved(List<ChefFinanceApprovalSource.Approval> rows) {
        when(approvals.current()).thenReturn(new ChefFinanceApprovalSource.Snapshot(UUID.randomUUID(),Instant.now(),true,rows));
    }
    private ChefFinanceApprovalSource.Approval chef(String state) {
        return new ChefFinanceApprovalSource.Approval(UUID.randomUUID(),UUID.randomUUID(),state,Instant.now().minusSeconds(30));
    }
    @Test void missingDisabledOrFuturePolicyReturnsCompleteEmptyWithoutApprovalReads() {
        policy(FinancePolicy.launchDraft(),null); assertTrue(service.evaluate(UUID.randomUUID()).eligibleChefIds().isEmpty());
        policy(FinancePolicy.launchDraft(),policy); assertTrue(service.evaluate(UUID.randomUUID()).eligibleChefIds().isEmpty());
        policy(enabled(LocalDate.now(FinancePolicy.ZONE).plusDays(1)),policy); assertTrue(service.evaluate(UUID.randomUUID()).eligibleChefIds().isEmpty());
        verifyNoInteractions(approvals);
    }
    @Test void everyApprovedChefCanPublishRegardlessOfStateWithoutTaxOrBankProfile() {
        policy(enabled(LocalDate.now(FinancePolicy.ZONE)),policy);
        var telangana=chef("36"); var otherState=chef("UNSUPPORTED");
        approved(List.of(otherState,telangana));
        var first=service.evaluate(UUID.randomUUID());
        assertTrue(first.complete());
        assertEquals(java.util.Set.of(telangana.chefId(),otherState.chefId()),java.util.Set.copyOf(first.eligibleChefIds()));
        approved(List.of(telangana,otherState));
        assertEquals(first.hash(),service.evaluate(UUID.randomUUID()).hash());
    }
    @Test void approvingAndRevokingAChefTakesEffectOnTheNextRead() {
        policy(enabled(LocalDate.now(FinancePolicy.ZONE)),policy); var chef=chef("UNSUPPORTED");
        approved(List.of()); var before=service.evaluate(UUID.randomUUID());
        approved(List.of(chef)); var after=service.evaluate(UUID.randomUUID());
        assertEquals(List.of(chef.chefId()),after.eligibleChefIds()); assertNotEquals(before.hash(),after.hash());
        approved(List.of()); var revoked=service.evaluate(UUID.randomUUID());
        assertTrue(revoked.eligibleChefIds().isEmpty()); assertEquals(before.hash(),revoked.hash());
    }
    @Test void incompleteAuthorityAndOutageNeverBecomeSuccessfulPartialApproval() {
        policy(enabled(LocalDate.now(FinancePolicy.ZONE)),policy);
        when(approvals.current()).thenReturn(new ChefFinanceApprovalSource.Snapshot(UUID.randomUUID(),Instant.now(),false,List.of()));
        var result=service.evaluate(UUID.randomUUID()); assertFalse(result.complete()); assertTrue(result.eligibleChefIds().isEmpty());
        when(approvals.current()).thenThrow(new IllegalStateException("approval source unavailable"));
        assertThrows(IllegalStateException.class,()->service.evaluate(UUID.randomUUID()));
    }
    @Test void oversizedAuthorityCannotReturnPartialPermissions() {
        policy(enabled(LocalDate.now(FinancePolicy.ZONE)),policy);
        approved(java.util.stream.IntStream.range(0,1001).mapToObj(i->chef("UNSUPPORTED")).toList());
        var result=service.evaluate(UUID.randomUUID()); assertFalse(result.complete()); assertTrue(result.eligibleChefIds().isEmpty());
    }
}
