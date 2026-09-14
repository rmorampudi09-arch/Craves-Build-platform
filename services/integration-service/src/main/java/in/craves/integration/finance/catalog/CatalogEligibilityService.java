package in.craves.integration.finance.catalog;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.finance.source.ChefTaxProfileService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogEligibilityService {
    public record Snapshot(UUID requestId, Instant evaluatedAt, boolean complete, UUID policyId,
                           long revision, String hash, List<UUID> eligibleChefIds) {}
    private final FinancePolicyService policies;
    private final ChefTaxProfileService profiles;
    public CatalogEligibilityService(FinancePolicyService policies, ChefTaxProfileService profiles) {
        this.policies = policies; this.profiles = profiles;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 5)
    public Snapshot evaluate(UUID requestId) {
        Instant now = Instant.now();
        var view = policies.current();
        var eligible = new ArrayList<UUID>();
        var fingerprint = new StringBuilder().append(view.policyId()).append('|').append(view.revision())
            .append('|').append(LocalDate.now(FinancePolicy.ZONE)).append('|');
        if (view.policyId() != null && view.settings().ledgerEnabled() && view.settings().inScope(now)) {
            var batch = profiles.resolvedBatch(CatalogEligibilityProtocol.MAX_CHEFS);
            if (!batch.complete()) {
                return new Snapshot(requestId, now, false, view.policyId(), view.revision(),
                    CatalogEligibilityProtocol.hash("INCOMPLETE"), List.of());
            }
            for (var profile : batch.versions()) {
                if (!"REGISTRATION_REVIEW_REQUIRED".equals(profile.registrationReview())
                    && "36".equals(profile.profile().stateCode())) {
                    eligible.add(profile.chefIdentityId());
                    fingerprint.append(profile.chefIdentityId()).append(':').append(profile.id()).append('|');
                }
            }
        }
        return new Snapshot(requestId, now, true, view.policyId(), view.revision(),
            CatalogEligibilityProtocol.hash(fingerprint.toString()), List.copyOf(eligible));
    }
}
