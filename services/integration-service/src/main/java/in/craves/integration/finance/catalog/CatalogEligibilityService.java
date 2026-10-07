package in.craves.integration.finance.catalog;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.finance.source.ChefFinanceApprovalSource;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Publishing permission follows the existing admin approval in every state. */
@Service
public class CatalogEligibilityService {
    public record Snapshot(UUID requestId, Instant evaluatedAt, boolean complete, UUID policyId,
                           long revision, String hash, List<UUID> eligibleChefIds) {}
    private final FinancePolicyService policies;
    private final ChefFinanceApprovalSource approvals;
    public CatalogEligibilityService(FinancePolicyService policies, ChefFinanceApprovalSource approvals) {
        this.policies = policies; this.approvals = approvals;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 5)
    public Snapshot evaluate(UUID requestId) {
        Instant now = Instant.now();
        var view = policies.current();
        var fingerprint = new StringBuilder().append(view.policyId()).append('|').append(view.revision())
            .append('|').append(LocalDate.now(FinancePolicy.ZONE)).append('|');
        if (view.policyId() == null || !view.settings().ledgerEnabled() || !view.settings().inScope(now)) {
            return new Snapshot(requestId, now, true, view.policyId(), view.revision(),
                CatalogEligibilityProtocol.hash(fingerprint.toString()), List.of());
        }
        var authority = approvals.current();
        if (!authority.complete() || authority.approvals().size() > CatalogEligibilityProtocol.MAX_CHEFS) {
            return new Snapshot(requestId, now, false, view.policyId(), view.revision(),
                CatalogEligibilityProtocol.hash("INCOMPLETE"), List.of());
        }
        var approved = authority.approvals().stream()
            .sorted(java.util.Comparator.comparing(ChefFinanceApprovalSource.Approval::chefId)).toList();
        for (var chef : approved) {
            fingerprint.append(chef.chefId()).append(':').append(chef.applicationId())
                .append(':').append(chef.reviewedAt()).append('|');
        }
        return new Snapshot(requestId, now, true, view.policyId(), view.revision(),
            CatalogEligibilityProtocol.hash(fingerprint.toString()),
            approved.stream().map(ChefFinanceApprovalSource.Approval::chefId).toList());
    }
}
