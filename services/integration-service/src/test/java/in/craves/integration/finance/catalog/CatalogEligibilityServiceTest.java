package in.craves.integration.finance.catalog;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.finance.source.ChefTaxProfileService;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class CatalogEligibilityServiceTest {
    private final FinancePolicyService policies = mock(FinancePolicyService.class);
    private final ChefTaxProfileService profiles = mock(ChefTaxProfileService.class);
    private final CatalogEligibilityService service = new CatalogEligibilityService(policies, profiles);
    private final UUID policy = UUID.randomUUID();
    private FinancePolicy enabled(LocalDate start) {
        return new FinancePolicy(start,true,false,false,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0",false,"TEST-ONLY");
    }
    private void policy(FinancePolicy value, UUID id) {
        when(policies.current()).thenReturn(new FinancePolicyService.View(1,id,value,List.of(),"TEST",1));
    }
    private void versions(List<ChefTaxProfileService.Version> versions) {
        when(profiles.resolvedBatch(1000)).thenReturn(new ChefTaxProfileService.ResolvedBatch(true,versions));
    }
    private ChefTaxProfileService.Version profile(UUID chef, String review, UUID version) {
        LocalDate today=LocalDate.now(FinancePolicy.ZONE); int year=today.getMonthValue()<4?today.getYear()-1:today.getYear();
        var profile = new ChefTaxProfileService.Profile("36","RESTAURANT_ECO_9_5","UNREGISTERED",null,"100.00",year+"-"+String.format("%02d",(year+1)%100),today,"0","TEST-ONLY","TEST-ONLY","TEST-ONLY");
        return new ChefTaxProfileService.Version(version,chef,profile,review,"0.00","0.00");
    }
    @Test void missingDisabledOrFuturePolicyReturnsCompleteEmptyWithoutProfileReads() {
        policy(FinancePolicy.launchDraft(),null); assertTrue(service.evaluate(UUID.randomUUID()).eligibleChefIds().isEmpty());
        policy(FinancePolicy.launchDraft(),policy); assertTrue(service.evaluate(UUID.randomUUID()).eligibleChefIds().isEmpty());
        policy(enabled(LocalDate.now(FinancePolicy.ZONE).plusDays(1)),policy); assertTrue(service.evaluate(UUID.randomUUID()).eligibleChefIds().isEmpty());
        verifyNoInteractions(profiles);
    }
    @Test void eligibleCurrentReviewedChefRequiresNoBankOrProviderAndHashChangesWithTaxVersion() {
        policy(enabled(LocalDate.now(FinancePolicy.ZONE)),policy); UUID chef=UUID.randomUUID();
        versions(List.of(profile(chef,"DECLARATION_RECORDED_NOT_GOVERNMENT_VERIFICATION",UUID.randomUUID())));
        var first=service.evaluate(UUID.randomUUID()); assertEquals(List.of(chef),first.eligibleChefIds()); assertTrue(first.complete());
        versions(List.of(profile(chef,"DECLARATION_RECORDED_NOT_GOVERNMENT_VERIFICATION",UUID.randomUUID())));
        assertNotEquals(first.hash(),service.evaluate(UUID.randomUUID()).hash());
    }
    @Test void missingCurrentYearAndRegistrationReviewRemainIndividualSellingHolds() {
        policy(enabled(LocalDate.now(FinancePolicy.ZONE)),policy); UUID second=UUID.randomUUID();
        versions(List.of(profile(second,"REGISTRATION_REVIEW_REQUIRED",UUID.randomUUID())));
        assertTrue(service.evaluate(UUID.randomUUID()).eligibleChefIds().isEmpty());
    }
    @Test void overflowNeverReturnsAPartialEligibleListAndOutageDoesNotBecomeAnEmptySuccess() {
        policy(enabled(LocalDate.now(FinancePolicy.ZONE)),policy);
        when(profiles.resolvedBatch(1000)).thenReturn(new ChefTaxProfileService.ResolvedBatch(false,List.of()));
        var result=service.evaluate(UUID.randomUUID()); assertFalse(result.complete());assertTrue(result.eligibleChefIds().isEmpty());verify(profiles,never()).resolved(any());
        when(profiles.resolvedBatch(1000)).thenThrow(new IllegalStateException("database unavailable"));
        assertThrows(IllegalStateException.class,()->service.evaluate(UUID.randomUUID()));
    }
}
