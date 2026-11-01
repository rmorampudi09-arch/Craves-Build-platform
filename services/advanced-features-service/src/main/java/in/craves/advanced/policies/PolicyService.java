package in.craves.advanced.policies;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.policies.PolicyDtos.CancellationCheck;
import in.craves.advanced.policies.PolicyDtos.CancellationPolicy;
import in.craves.advanced.policies.PolicyDtos.CancellationVerdict;
import in.craves.advanced.policies.PolicyDtos.NotificationCheck;
import in.craves.advanced.policies.PolicyDtos.NotificationFrequencyPolicy;
import in.craves.advanced.policies.PolicyDtos.NotificationVerdict;
import in.craves.advanced.policies.PolicyDtos.PolicyDraftRequest;
import in.craves.advanced.policies.PolicyDtos.PolicyStatus;
import in.craves.advanced.policies.PolicyDtos.PolicyType;
import in.craves.advanced.policies.PolicyDtos.PolicyVersionView;
import in.craves.advanced.policies.PolicyDtos.ProviderRankingCheck;
import in.craves.advanced.policies.PolicyDtos.ProviderRankingPolicy;
import in.craves.advanced.policies.PolicyDtos.ProviderRankingVerdict;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityCheck;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityPolicy;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityVerdict;
import java.time.Clock;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class PolicyService {
    /** Per-replica copy of each active policy; an activation on this replica refreshes it at once, other replicas within 30 s. */
    static final long CACHE_NANOS = 30_000_000_000L;
    private record Cached(PolicyVersionView view, Object document, long readAt) { }

    private final Map<PolicyType, Cached> cache = new ConcurrentHashMap<>();
    private final PolicyRepository repository;
    private final Audit audit;
    private final Clock clock;
    private final ObjectMapper strict;

    public PolicyService(PolicyRepository repository, Audit audit, Clock clock, ObjectMapper json) {
        this.repository = repository;
        this.audit = audit;
        this.clock = clock;
        this.strict = json.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES);
    }

    static PolicyType type(String slug) {
        return Arrays.stream(PolicyType.values()).filter(t -> t.slug.equals(slug)).findFirst()
                .orElseThrow(() -> ApiProblem.notFound("POLICY_TYPE_NOT_FOUND", "No such policy type"));
    }

    @Transactional(readOnly = true)
    public List<PolicyVersionView> versions(PolicyType type) {
        return repository.versions(type);
    }

    @Transactional
    public PolicyVersionView draft(UUID staff, PolicyType type, PolicyDraftRequest request) {
        String document;
        try {
            document = strict.writeValueAsString(normalized(type, request.document()));
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
            throw ApiProblem.badRequest("INVALID_POLICY", "The policy document cannot be written");
        }
        String note = request.note() == null || request.note().isBlank() ? null : request.note().strip();
        if (note != null && note.chars().anyMatch(c -> Character.isISOControl(c) && c != '\n')) throw ApiProblem.badRequest("INVALID_POLICY", "note has control characters");
        repository.lockType(type);
        int version = repository.insertDraft(type, document, note, staff, clock.instant());
        audit.record(PoliciesModule.ID, staff, "POLICY_DRAFTED", "policy", type.name() + ":" + version, Map.of());
        return repository.version(type, version).orElseThrow();
    }

    /** Cancellation and refund rules move money: someone other than the drafter must switch them on. */
    @Transactional
    public PolicyVersionView activate(UUID staff, PolicyType type, int version) {
        repository.lockType(type);
        PolicyVersionView draft = repository.version(type, version).orElseThrow(() -> ApiProblem.notFound("POLICY_VERSION_NOT_FOUND", "No such policy version"));
        if (draft.status() != PolicyStatus.DRAFT) throw ApiProblem.conflict("POLICY_NOT_DRAFT", "Only a draft can be switched on; draft a new version instead");
        if (repository.active(type).filter(active -> active.version() > version).isPresent()) {
            throw ApiProblem.conflict("POLICY_OUTDATED", "A newer version is already on; draft a new version instead of switching on an older one");
        }
        if (type == PolicyType.CANCELLATION && staff.equals(draft.createdBy())) {
            throw ApiProblem.forbidden("SECOND_PERSON_REQUIRED", "Another admin must switch on refund rules you drafted");
        }
        repository.activate(type, version, staff, clock.instant());
        audit.record(PoliciesModule.ID, staff, "POLICY_ACTIVATED", "policy", type.name() + ":" + version, Map.of());
        // Evict after commit, so a read in between cannot cache the old version again.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                cache.remove(type);
            }
        });
        return repository.version(type, version).orElseThrow();
    }

    public PolicyVersionView active(PolicyType type) {
        return cached(type).view();
    }

    public ServiceabilityVerdict serviceability(ServiceabilityCheck check) {
        Cached c = cached(PolicyType.SERVICEABILITY);
        return PolicyRules.serviceability((ServiceabilityPolicy) c.document(), c.view().version(), check);
    }

    public CancellationVerdict cancellation(CancellationCheck check) {
        Cached c = cached(PolicyType.CANCELLATION);
        return PolicyRules.cancellation((CancellationPolicy) c.document(), c.view().version(), check);
    }

    public ProviderRankingVerdict providerRanking(ProviderRankingCheck check) {
        Cached c = cached(PolicyType.PROVIDER_RANKING);
        return PolicyRules.rank((ProviderRankingPolicy) c.document(), c.view().version(), check.candidates());
    }

    public NotificationVerdict notification(NotificationCheck check) {
        Cached c = cached(PolicyType.NOTIFICATION_FREQUENCY);
        return PolicyRules.notification((NotificationFrequencyPolicy) c.document(), c.view().version(), check, clock.instant());
    }

    /** No active version answers 503 POLICY_NOT_SET: nothing is assumed in its place. */
    private Cached cached(PolicyType type) {
        Cached hit = cache.get(type);
        if (hit != null && System.nanoTime() - hit.readAt() < CACHE_NANOS) return hit;
        PolicyVersionView view = repository.active(type)
                .orElseThrow(() -> new ApiProblem(503, "POLICY_NOT_SET", "Staff have not switched on a " + type.slug + " policy yet"));
        Cached fresh = new Cached(view, normalized(type, view.document()), System.nanoTime());
        cache.put(type, fresh);
        return fresh;
    }

    private Object normalized(PolicyType type, JsonNode document) {
        if (document == null || !document.isObject()) throw ApiProblem.badRequest("INVALID_POLICY", "document must be a JSON object");
        try {
            return switch (type) {
                case SERVICEABILITY -> PolicyRules.check(strict.treeToValue(document, ServiceabilityPolicy.class));
                case CANCELLATION -> PolicyRules.check(strict.treeToValue(document, CancellationPolicy.class));
                case PROVIDER_RANKING -> PolicyRules.check(strict.treeToValue(document, ProviderRankingPolicy.class));
                case NOTIFICATION_FREQUENCY -> PolicyRules.check(strict.treeToValue(document, NotificationFrequencyPolicy.class));
            };
        } catch (com.fasterxml.jackson.core.JsonProcessingException | IllegalArgumentException ex) {
            throw new ApiProblem(400, "INVALID_POLICY", "The policy document does not match the " + type.slug + " shape", List.of(where(ex)));
        }
    }

    /** The JSON path of the problem only (Jackson's own message names internal classes). */
    private static String where(Exception ex) {
        if (ex instanceof com.fasterxml.jackson.databind.JsonMappingException mapping && !mapping.getPath().isEmpty()) {
            StringBuilder path = new StringBuilder("problem at ");
            for (var ref : mapping.getPath()) path.append(ref.getFieldName() != null ? "/" + ref.getFieldName() : "/" + ref.getIndex());
            return path.toString();
        }
        return "unreadable document";
    }
}
