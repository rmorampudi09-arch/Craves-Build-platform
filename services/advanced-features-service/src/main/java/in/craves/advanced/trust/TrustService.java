package in.craves.advanced.trust;

import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.trust.TrustDtos.ChefDisputeStatement;
import in.craves.advanced.trust.TrustDtos.DisputePolicyView;
import in.craves.advanced.trust.TrustDtos.DisputeStatus;
import in.craves.advanced.trust.TrustDtos.NewOrderDispute;
import in.craves.advanced.trust.TrustDtos.NewRiskFlag;
import in.craves.advanced.trust.TrustDtos.NewTrustReport;
import in.craves.advanced.trust.TrustDtos.OrderDisputeDecision;
import in.craves.advanced.trust.TrustDtos.OrderDisputeView;
import in.craves.advanced.trust.TrustDtos.ReportStatus;
import in.craves.advanced.trust.TrustDtos.ReportTarget;
import in.craves.advanced.trust.TrustDtos.RiskFlagView;
import in.craves.advanced.trust.TrustDtos.RiskSubject;
import in.craves.advanced.trust.TrustDtos.RiskSummary;
import in.craves.advanced.trust.TrustDtos.StaffOrderDispute;
import in.craves.advanced.trust.TrustDtos.StaffTrustReport;
import in.craves.advanced.trust.TrustDtos.TrustReportDecision;
import in.craves.advanced.trust.TrustDtos.TrustReportView;
import in.craves.advanced.trust.TrustRepository.Dispute;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Reports for moderation, order disputes and staff risk flags. Order service and Catalog are read with the caller's own token
 * before any database transaction; every outcome is a staff decision, no staff member decides their own case, and money decided
 * here is paid by Order service (M24).
 */
@Service
public class TrustService implements PersonalDataContributor {
    static final UUID ERASED = new UUID(0, 0);
    /** Reports one person may file in 24 hours, so nobody can flood the moderation queue. */
    static final int MAX_REPORTS_PER_DAY = 20;
    /** Disputes one order may have in all (a withdrawn one can be opened again, up to this). */
    static final int MAX_DISPUTES_PER_ORDER = 3;
    /** shortcut: lists return 100 rows (queues oldest first, own lists newest first); add cursor paging when queues grow past that. */
    static final int LIST_LIMIT = 100;
    private final TrustRepository repository;
    private final OrderGateway orders;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final Clock clock;
    private final TransactionTemplate tx;

    public TrustService(TrustRepository repository, OrderGateway orders, CatalogGateway catalog, Audit audit, Clock clock,
                        PlatformTransactionManager transactions) {
        this.repository = repository;
        this.orders = orders;
        this.catalog = catalog;
        this.audit = audit;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    // Reports

    public TrustReportView report(UUID reporter, NewTrustReport request) {
        String details = TrustRules.text(request.details(), "details");
        UUID id = tx.execute(status -> {
            repository.lockPerson(reporter);
            Instant now = clock.instant();
            if (repository.reportsSince(reporter, now.minus(Duration.ofHours(24))) >= MAX_REPORTS_PER_DAY) {
                throw ApiProblem.conflict("TOO_MANY_REPORTS", "You have sent many reports today; our team is looking at them");
            }
            StaffTrustReport report = new StaffTrustReport(UUID.randomUUID(), reporter, request.targetType(), request.targetId(), request.reason(),
                    details, request.orderId(), ReportStatus.OPEN, null, null, null, now);
            try {
                repository.insertReport(report, now);
            } catch (DuplicateKeyException open) {
                throw ApiProblem.conflict("REPORT_EXISTS", "You already reported this; our team is looking at it");
            }
            return report.id();
        });
        return reporterView(repository.report(id).orElseThrow());
    }

    public List<TrustReportView> myReports(UUID reporter) {
        return repository.reportsOf(reporter, LIST_LIMIT).stream().map(TrustService::reporterView).toList();
    }

    public List<StaffTrustReport> reportQueue(ReportStatus status) {
        return repository.reportQueue(status == null ? ReportStatus.OPEN : status, LIST_LIMIT);
    }

    public List<StaffTrustReport> reportsAbout(ReportTarget type, UUID target) {
        return repository.reportsAbout(type, target, LIST_LIMIT);
    }

    /** Records the decision; acting on it (removing a review, pausing a kitchen) happens in the service that owns that content. */
    @Transactional
    public StaffTrustReport decideReport(UUID staff, UUID id, TrustReportDecision decision) {
        if (decision.outcome() == ReportStatus.OPEN) throw ApiProblem.badRequest("INVALID_OUTCOME", "A report is decided UPHELD or DISMISSED");
        StaffTrustReport report = repository.report(id).orElseThrow(() -> ApiProblem.notFound("REPORT_NOT_FOUND", "No such report"));
        if (staff.equals(report.reporterId()) || (report.targetType() == ReportTarget.PERSON && staff.equals(report.targetId()))) throw ownCase();
        if (!repository.decideReport(id, decision.outcome(), TrustRules.text(decision.note(), "note"), staff, clock.instant())) {
            throw ApiProblem.conflict("REPORT_DECIDED", "This report was already decided");
        }
        audit.record(TrustModule.ID, staff, "REPORT_" + decision.outcome().name(), "report", id,
                Map.of("targetType", report.targetType().name(), "targetId", report.targetId(), "reason", report.reason().name()));
        return repository.report(id).orElseThrow();
    }

    // Disputes

    public DisputePolicyView disputePolicy() {
        return repository.policy().orElseThrow(() -> ApiProblem.notFound("DISPUTE_POLICY_NOT_SET", "Disputes are not open yet"));
    }

    @Transactional
    public DisputePolicyView setDisputePolicy(UUID staff, int windowHours) {
        long version;
        try {
            version = repository.insertPolicy(windowHours, staff, clock.instant());
        } catch (DuplicateKeyException concurrent) {
            throw ApiProblem.conflict("POLICY_CHANGED", "The rules changed just now; reload and try again");
        }
        audit.record(TrustModule.ID, staff, "DISPUTE_POLICY_SET", "dispute_policy", version, Map.of("windowHours", windowHours));
        return disputePolicy();
    }

    /** The customer's own order, read with their token before anything is stored; one live dispute per order. */
    public OrderDisputeView openDispute(UUID customer, String customerToken, NewOrderDispute request) {
        DisputePolicyView policy = repository.policy()
                .orElseThrow(() -> ApiProblem.unavailable("DISPUTES_NOT_CONFIGURED", "Disputes are not open yet"));
        String description = TrustRules.text(request.description(), "description");
        Order order = orders.customerOrder(customerToken, request.orderId()).filter(found -> found.customerId().equals(customer))
                .orElseThrow(() -> ApiProblem.notFound("ORDER_NOT_FOUND", "No such order"));
        Instant now = clock.instant();
        String problem = TrustRules.disputeProblem(order, policy.windowHours(), now);
        if ("ORDER_NOT_DISPUTABLE".equals(problem)) {
            throw new ApiProblem(409, problem, "This order can be disputed once it is delivered, rejected or refunded", List.of("status: " + order.status()));
        }
        if (problem != null) {
            throw new ApiProblem(409, problem, "Disputes are opened within " + policy.windowHours() + " hours of the order finishing; contact support",
                    List.of("windowHours: " + policy.windowHours()));
        }
        if (order.grandTotalPaise() == null) throw ApiProblem.unavailable("ORDER_TOTAL_UNAVAILABLE", "Order service did not give this order's total; retry shortly");
        long refundable = TrustRules.refundable(order, order.grandTotalPaise());
        if (request.claimedPaise() != null && request.claimedPaise() > refundable) {
            throw new ApiProblem(422, "CLAIM_ABOVE_REFUNDABLE", "You can claim at most what can still be refunded for this order",
                    List.of("refundablePaise: " + refundable));
        }
        UUID id = tx.execute(status -> {
            repository.lockPerson(customer);
            if (repository.disputesOfOrder(order.id()) >= MAX_DISPUTES_PER_ORDER) {
                throw ApiProblem.conflict("TOO_MANY_DISPUTES", "This order has been disputed too often; contact support");
            }
            Dispute dispute = new Dispute(UUID.randomUUID(), order.id(), customer, order.kitchenId(), request.category(), description,
                    request.claimedPaise(), order.grandTotalPaise(), refundable, null, null, null, DisputeStatus.OPEN, null, null, null, null, 1, now);
            try {
                repository.insertDispute(dispute, policy.version(), now);
            } catch (DuplicateKeyException live) {
                throw ApiProblem.conflict("DISPUTE_EXISTS", "This order already has a dispute");
            }
            audit.record(TrustModule.ID, customer, "DISPUTE_OPENED", "dispute", dispute.id(),
                    Map.of("orderId", order.id(), "category", request.category().name()));
            return dispute.id();
        });
        return view(repository.dispute(id, false).orElseThrow());
    }

    public List<OrderDisputeView> myDisputes(UUID customer) {
        return repository.disputesOf(customer, LIST_LIMIT).stream().map(TrustService::view).toList();
    }

    /** Withdrawing is harmless to repeat; a decided dispute stays decided. */
    public OrderDisputeView withdrawDispute(UUID customer, UUID id) {
        Dispute dispute = repository.dispute(id, false).filter(found -> found.customerId().equals(customer)).orElseThrow(TrustService::disputeNotFound);
        if (!repository.withdrawDispute(id, customer, clock.instant()) && dispute.status() != DisputeStatus.WITHDRAWN) {
            throw ApiProblem.conflict("DISPUTE_DECIDED", "This dispute was already decided");
        }
        return view(repository.dispute(id, false).orElseThrow());
    }

    /** The disputes about the chef's kitchen, newest first, decided ones included, without who opened them. */
    public List<OrderDisputeView> chefDisputes(String chefToken) {
        return repository.disputesOfKitchens(kitchensOf(chefToken), LIST_LIMIT).stream().map(TrustService::view).toList();
    }

    /** The kitchen's side of the story, while the dispute is open; another kitchen's dispute answers like a missing one. */
    public OrderDisputeView chefStatement(UUID chef, String chefToken, UUID id, ChefDisputeStatement request) {
        Dispute dispute = repository.dispute(id, false).orElseThrow(TrustService::disputeNotFound);
        orders.chefOrder(chefToken, dispute.orderId()).orElseThrow(TrustService::disputeNotFound);
        if (!repository.chefStatement(id, TrustRules.text(request.statement(), "statement"), chef, clock.instant())) {
            throw ApiProblem.conflict("DISPUTE_DECIDED", "This dispute was already decided");
        }
        return view(repository.dispute(id, false).orElseThrow());
    }

    public List<StaffOrderDispute> disputeQueue(DisputeStatus status) {
        return repository.disputeQueue(status == null ? DisputeStatus.OPEN : status, LIST_LIMIT).stream()
                .map(dispute -> new StaffOrderDispute(view(dispute), dispute.customerId())).toList();
    }

    /**
     * Staff decide, never on their own order or kitchen (staffChefToken: the decider's token when they are also a chef, so their
     * kitchens are checked with Catalog first). A refund is at most what may be refunded, and Order service pays it (M24).
     */
    public StaffOrderDispute decideDispute(UUID staff, String staffChefToken, UUID id, OrderDisputeDecision decision) {
        Dispute found = repository.dispute(id, false).orElseThrow(TrustService::disputeNotFound);
        if (staff.equals(found.customerId()) || staff.equals(found.chefId())
                || (staffChefToken != null && kitchensOf(staffChefToken).contains(found.kitchenId()))) {
            throw ownCase();
        }
        tx.executeWithoutResult(status -> {
            Dispute dispute = repository.dispute(id, true).orElseThrow(TrustService::disputeNotFound);
            if (dispute.version() != decision.expectedVersion()) {
                throw new ApiProblem(412, "VERSION_MISMATCH", "This dispute changed since you loaded it; reload and try again");
            }
            if (dispute.status() != DisputeStatus.OPEN) throw ApiProblem.conflict("DISPUTE_DECIDED", "This dispute was already decided or withdrawn");
            String problem = TrustRules.decisionProblem(decision.outcome(), decision.refundPaise(), dispute.refundablePaise());
            if (problem != null) {
                throw new ApiProblem(422, problem, "This decision does not fit the dispute", List.of("refundablePaise: " + dispute.refundablePaise()));
            }
            repository.decideDispute(id, decision.outcome(), decision.refundPaise(), TrustRules.text(decision.note(), "note"), staff, clock.instant());
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("orderId", dispute.orderId());
            details.put("refundPaise", decision.refundPaise() == null ? 0 : decision.refundPaise());
            audit.record(TrustModule.ID, staff, "DISPUTE_" + decision.outcome().name(), "dispute", id, details);
        });
        Dispute decided = repository.dispute(id, false).orElseThrow();
        return new StaffOrderDispute(view(decided), decided.customerId());
    }

    // Risk flags

    @Transactional
    public RiskFlagView raiseFlag(UUID staff, NewRiskFlag request) {
        if (request.subjectType() == RiskSubject.PERSON && staff.equals(request.subjectId())) throw ownCase();
        RiskFlagView flag = new RiskFlagView(UUID.randomUUID(), request.subjectType(), request.subjectId(), request.severity(),
                TrustRules.text(request.reason(), "reason"), true, staff, clock.instant(), null, null, null);
        repository.insertFlag(flag);
        audit.record(TrustModule.ID, staff, "RISK_FLAG_RAISED", "risk_flag", flag.id(),
                Map.of("subjectType", flag.subjectType().name(), "subjectId", flag.subjectId(), "severity", flag.severity().name()));
        return repository.flag(flag.id()).orElseThrow();
    }

    @Transactional
    public RiskFlagView clearFlag(UUID staff, UUID id, String note) {
        RiskFlagView flag = repository.flag(id).orElseThrow(() -> ApiProblem.notFound("RISK_FLAG_NOT_FOUND", "No such risk flag"));
        if (flag.subjectType() == RiskSubject.PERSON && staff.equals(flag.subjectId())) throw ownCase();
        if (repository.clearFlag(id, staff, TrustRules.text(note, "note"), clock.instant())) {
            audit.record(TrustModule.ID, staff, "RISK_FLAG_CLEARED", "risk_flag", id, Map.of("subjectType", flag.subjectType().name(),
                    "subjectId", flag.subjectId()));
        } else if (flag.open()) {
            throw ApiProblem.conflict("RISK_FLAG_CHANGED", "This flag changed just now; reload and try again");
        }
        return repository.flag(id).orElseThrow();
    }

    public List<RiskFlagView> flags(RiskSubject type, UUID subject) {
        return repository.flagsOf(type, subject, false);
    }

    /** Counts only: what to do at which numbers stays a staff decision. */
    public RiskSummary summary(RiskSubject type, UUID subject) {
        Map<String, Object> reports = repository.reportCounts(type == RiskSubject.PERSON ? ReportTarget.PERSON : ReportTarget.KITCHEN, subject);
        Map<String, Object> disputes = repository.disputeCounts(type == RiskSubject.PERSON ? "customer_id" : "kitchen_id", subject);
        return new RiskSummary(type, subject, repository.flagsOf(type, subject, true), count(reports, "open"), count(reports, "upheld"),
                count(reports, "dismissed"), count(disputes, "open"), count(disputes, "resolved"), count(disputes, "rejected"),
                ((Number) disputes.get("refunds")).longValue());
    }

    @Override
    public String moduleId() {
        return TrustModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("reports", repository.reportsOf(person, Integer.MAX_VALUE).stream().map(TrustService::reporterView).toList());
        export.put("disputes", repository.disputesOf(person, Integer.MAX_VALUE).stream().map(TrustService::view).toList());
        export.put("chefStatements", repository.disputesWithStatementsBy(person).stream()
                .map(dispute -> Map.of("disputeId", dispute.id(), "orderId", dispute.orderId(), "statement", dispute.chefStatement())).toList());
        return export;
    }

    /** Waits for a filing being made at that moment (same person lock), so none escapes the erasure. */
    @Override
    public int erase(UUID person) {
        return tx.execute(status -> {
            repository.lockPerson(person);
            return repository.erase(person, ERASED, clock.instant());
        });
    }

    private Set<UUID> kitchensOf(String chefToken) {
        return catalog.chefMenuItems(chefToken).values().stream().map(MenuItem::kitchenId).filter(Objects::nonNull).collect(Collectors.toSet());
    }

    private static int count(Map<String, Object> row, String column) {
        return ((Number) row.get(column)).intValue();
    }

    private static TrustReportView reporterView(StaffTrustReport report) {
        return new TrustReportView(report.id(), report.targetType(), report.targetId(), report.reason(), report.details(), report.orderId(),
                report.status(), report.createdAt(), report.decidedAt());
    }

    private static OrderDisputeView view(Dispute d) {
        return new OrderDisputeView(d.id(), d.orderId(), d.kitchenId(), d.category(), d.description(), d.claimedPaise(), d.orderValuePaise(),
                d.refundablePaise(), d.chefStatement(), d.chefRespondedAt(), d.status(), d.refundPaise(), d.decisionNote(), d.decidedAt(), d.version(),
                d.createdAt());
    }

    private static ApiProblem ownCase() {
        return ApiProblem.forbidden("OWN_CASE", "Staff never decide their own case; ask another staff member");
    }

    private static ApiProblem disputeNotFound() {
        return ApiProblem.notFound("DISPUTE_NOT_FOUND", "No such dispute");
    }
}
