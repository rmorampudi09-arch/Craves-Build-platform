package in.craves.integration.operations;

import in.craves.integration.operations.AdminOperationsModels.AddCaseNoteRequest;
import in.craves.integration.operations.AdminOperationsModels.CaseDetails;
import in.craves.integration.operations.AdminOperationsModels.CaseResponse;
import in.craves.integration.operations.AdminOperationsModels.CreateCaseRequest;
import in.craves.integration.operations.AdminOperationsModels.InvestigationSnapshot;
import in.craves.integration.operations.AdminOperationsModels.RetryReleaseRequest;
import in.craves.integration.operations.AdminOperationsModels.RetryReleaseResponse;
import in.craves.integration.operations.AdminOperationsModels.UpdateCaseRequest;
import in.craves.integration.security.CravesPrincipal;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminOperationsService {
    private static final Set<String> CATEGORIES = Set.of(
        "ORDER", "PAYMENT", "REFUND", "DELIVERY", "SUBSCRIPTION", "CUSTOMER", "CHEF",
        "NOTIFICATION", "SECURITY", "OTHER"
    );
    private static final Set<String> PRIORITIES = Set.of("LOW", "MEDIUM", "HIGH", "CRITICAL");
    private static final Set<String> CASE_STATUSES = Set.of(
        "OPEN", "IN_PROGRESS", "WAITING_EXTERNAL", "RESOLVED", "CLOSED"
    );
    private static final Set<String> SUBJECT_TYPES = Set.of(
        "ORDER", "CHECKOUT", "PAYMENT_ORDER", "REFUND", "DELIVERY_JOB", "SUBSCRIPTION",
        "CUSTOMER", "CHEF", "NOTIFICATION", "OTHER"
    );
    private static final Set<String> NOTE_TYPES = Set.of(
        "INTERNAL", "CUSTOMER_CONTACT", "CHEF_CONTACT", "PROVIDER_CONTACT", "SYSTEM"
    );
    private static final Set<String> SNAPSHOT_TYPES = Set.of(
        "PAYMENT_ORDER", "REFUND", "DELIVERY_JOB", "SUBSCRIPTION_PAYMENT", "CHEF_EARNING", "CHEF_SETTLEMENT"
    );
    private static final Set<String> RETRY_DOMAINS = Set.of(
        "PAYMENT_WEBHOOK", "REFUND", "REFUND_STATUS_OUTBOX", "DELIVERY_WEBHOOK",
        "DELIVERY_TRACKING", "SUBSCRIPTION_PAYMENT_STATUS_OUTBOX"
    );

    private final AdminOperationsRepository repository;
    private final AdminOperationsProperties properties;

    public AdminOperationsService(
        AdminOperationsRepository repository,
        AdminOperationsProperties properties
    ) {
        this.repository = repository;
        this.properties = properties;
    }

    public CaseResponse create(CravesPrincipal principal, CreateCaseRequest request) {
        requireAdmin(principal);
        CreateCaseRequest normalized = new CreateCaseRequest(
            allowed(request.category(), CATEGORIES, "category"),
            allowed(request.priority(), PRIORITIES, "priority"),
            allowed(request.subjectType(), SUBJECT_TYPES, "subjectType"),
            request.subjectId(), request.orderId(), request.checkoutId(), request.paymentOrderId(),
            request.refundId(), request.deliveryJobId(), request.subscriptionId(),
            request.customerIdentityId(), request.chefIdentityId(),
            request.summary().trim(), request.description().trim()
        );
        return translate(() -> repository.create(normalized, principal.identityId()));
    }

    public List<CaseResponse> list(CravesPrincipal principal, String status, int limit) {
        requireAdmin(principal);
        String normalized = StringUtils.hasText(status)
            ? allowed(status, CASE_STATUSES, "status")
            : null;
        return repository.list(normalized, Math.max(1, Math.min(limit, properties.getListLimit())));
    }

    public CaseDetails details(CravesPrincipal principal, UUID caseId) {
        requireAdmin(principal);
        return translate(() -> repository.details(caseId));
    }

    public CaseResponse update(
        CravesPrincipal principal,
        UUID caseId,
        UpdateCaseRequest request
    ) {
        requireAdmin(principal);
        UpdateCaseRequest normalized = new UpdateCaseRequest(
            allowed(request.status(), CASE_STATUSES, "status"),
            request.assignedAdminIdentityId(),
            required(request.reason(), "reason")
        );
        return translate(() -> repository.update(caseId, normalized, principal.identityId()));
    }

    public AdminOperationsModels.CaseNoteResponse addNote(
        CravesPrincipal principal,
        UUID caseId,
        AddCaseNoteRequest request
    ) {
        requireAdmin(principal);
        AddCaseNoteRequest normalized = new AddCaseNoteRequest(
            allowed(request.noteType(), NOTE_TYPES, "noteType"),
            required(request.body(), "body")
        );
        return translate(() -> repository.addNote(caseId, normalized, principal.identityId()));
    }

    public InvestigationSnapshot snapshot(
        CravesPrincipal principal,
        String entityType,
        UUID entityId
    ) {
        requireAdmin(principal);
        String normalized = allowed(entityType, SNAPSHOT_TYPES, "entityType");
        return translate(() -> repository.snapshot(normalized, entityId));
    }

    public RetryReleaseResponse releaseRetry(
        CravesPrincipal principal,
        UUID caseId,
        RetryReleaseRequest request
    ) {
        requireAdmin(principal);
        if (!properties.isRetryReleaseEnabled()) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Admin retry release is disabled"
            );
        }
        String domain = allowed(request.domain(), RETRY_DOMAINS, "domain");
        return translate(() -> repository.releaseRetry(
            caseId, domain, request.recordId(), principal.identityId(), required(request.reason(), "reason")
        ));
    }

    private static void requireAdmin(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "ADMIN role is required");
        }
    }

    private static String allowed(String value, Set<String> allowed, String field) {
        String normalized = required(value, field).toUpperCase(Locale.ROOT);
        if (!allowed.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported " + field);
        }
        return normalized;
    }

    private static String required(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required");
        }
        return value.trim();
    }

    private static <T> T translate(Operation<T> operation) {
        try {
            return operation.run();
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    @FunctionalInterface
    private interface Operation<T> {
        T run();
    }
}
