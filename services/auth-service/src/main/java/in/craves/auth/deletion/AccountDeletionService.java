package in.craves.auth.deletion;

import in.craves.auth.api.IdentityResponse.PendingDeletion;
import in.craves.auth.deletion.AccountErasureClient.Blocker;
import in.craves.auth.deletion.AccountErasureClient.ServiceCall;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.Phase;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.CurrentUser;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Account deletion, for the signed-in person (ask, look, keep the account) and for Craves staff (approve or reject a
 * request). Each change is one short transaction with no HTTP call inside (the Hikari pool is 3); notices go out after
 * the commit, off this thread.
 */
@Service
public class AccountDeletionService {
    private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);
    private static final List<String> RELEASE_SERVICES = List.of("subscription", "catalog");
    private static final Set<RequestStatus> APPROVABLE = EnumSet.of(RequestStatus.PENDING_REVIEW);
    private static final Set<RequestStatus> REJECTABLE =
        EnumSet.of(RequestStatus.PENDING_REVIEW, RequestStatus.SCHEDULED, RequestStatus.WAITING_ON_OPEN_ITEMS);

    /** 409 ACCOUNT_DELETION_HAS_OPEN_ITEMS. The admin controller answers with {@code blockers} too. */
    public static final class OpenItemsException extends AuthException {
        private final List<Blocker> blockers;

        OpenItemsException(List<Blocker> blockers) {
            super(HttpStatus.CONFLICT, "ACCOUNT_DELETION_HAS_OPEN_ITEMS", "The chef side still has open items");
            this.blockers = List.copyOf(blockers);
        }

        public List<Blocker> blockers() { return blockers; }
    }

    /** {@code created} is false when the person already had this open request. */
    public record Created(DeletionView view, boolean created) {}

    private record Outcome(DeletionRequest request, boolean created, boolean needsReview) {}

    private final AccountDeletionRepository deletions;
    private final AuthIdentityRepository identities;
    private final AuthIdentityRoleRepository roles;
    private final DeletionNotices notices;
    private final AccountErasureClient client;
    private final AccountDeletionProperties properties;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final Executor noticeExecutor;

    public AccountDeletionService(AccountDeletionRepository deletions, AuthIdentityRepository identities,
                                  AuthIdentityRoleRepository roles, DeletionNotices notices,
                                  AccountErasureClient client, AccountDeletionProperties properties,
                                  PlatformTransactionManager transactions, Clock clock,
                                  @Qualifier(DeletionNoticeExecutorConfiguration.NAME) Executor noticeExecutor) {
        this.deletions = deletions;
        this.identities = identities;
        this.roles = roles;
        this.notices = notices;
        this.client = client;
        this.properties = properties;
        this.tx = new TransactionTemplate(transactions);
        this.clock = clock;
        this.noticeExecutor = noticeExecutor;
    }

    public Created request(CurrentUser user, Scope scope, Via via) {
        requireEnabled();
        UUID identityId = user.identityId();
        Outcome outcome = tx.execute(ignored -> {
            Optional<DeletionRequest> open = deletions.lockOpen(identityId);
            if (open.isPresent()) {
                if (open.get().scope() != scope) {
                    throw AuthException.conflict("ACCOUNT_DELETION_ALREADY_REQUESTED", "A different account deletion request is already open");
                }
                return new Outcome(open.get(), false, false);
            }
            List<String> held = roles.findRoleCodesByIdentityId(identityId);
            boolean chef = held.contains("CHEF");
            if ((scope == Scope.CHEF && !chef) || (scope == Scope.ALL && held.contains("RIDER"))) {
                throw AuthException.conflict("ACCOUNT_DELETION_SCOPE_NOT_ALLOWED", "This account cannot ask for that kind of deletion");
            }
            boolean needsReview = scope == Scope.CHEF || (scope == Scope.ALL && chef);
            Instant now = clock.instant();
            DeletionRequest created = deletions.insert(identityId, scope,
                needsReview ? RequestStatus.PENDING_REVIEW : RequestStatus.SCHEDULED, via, now,
                needsReview ? null : now.plus(Duration.ofDays(properties.getWaitDays())));
            deletions.insertSteps(created.id(), Phase.PREPARE, AccountErasureClient.ERASE_ORDER, now);
            identities.incrementTokenVersion(identityId);
            return new Outcome(created, true, needsReview);
        });
        if (outcome.created()) queueNotice(outcome.request(), () -> notices.requested(outcome.request(), outcome.needsReview()));
        return new Created(DeletionView.of(outcome.request()), outcome.created());
    }

    public DeletionView current(UUID identityId) {
        requireEnabled();
        return deletions.findLatest(identityId).map(DeletionView::of).orElseThrow(AccountDeletionService::noRequest);
    }

    /** "Keep my account": cancels the open request. A chef request also queues the release of what PREPARE held back. */
    public DeletionView keep(CurrentUser user) {
        requireEnabled();
        UUID identityId = user.identityId();
        return tx.execute(ignored -> {
            DeletionRequest open = deletions.lockOpen(identityId).orElseThrow(AccountDeletionService::noRequest);
            if (open.status() == RequestStatus.ERASING) {
                throw AuthException.conflict("ACCOUNT_DELETION_IN_PROGRESS", "The account is already being erased");
            }
            Instant now = clock.instant();
            if (!deletions.transition(open.id(), open.status(), RequestStatus.CANCELLED, columns -> columns.put("cancelled_at", now))) {
                throw new IllegalStateException("Deletion request changed while locked: " + open.id());
            }
            endWithoutErasing(open, now);
            return DeletionView.of(deletions.find(open.id()).orElseThrow());
        });
    }

    /**
     * Craves staff approve a chef request: the chef side must have nothing open (a service that does not answer counts as
     * open), then the request is SCHEDULED for {@code waitDays} from now. The network calls come first, outside any
     * transaction; the transaction then re-reads the request under its lock.
     */
    public DeletionRequest approve(CurrentUser admin, UUID requestId, String reason, UUID correlationId) {
        requireEnabled();
        DeletionRequest request = reviewable(admin, requestId, APPROVABLE);
        List<Blocker> open = blockers(request.identityId(), Scope.CHEF);
        if (!open.isEmpty()) throw new OpenItemsException(open);
        DeletionRequest approved = tx.execute(ignored -> {
            DeletionRequest locked = lockedReviewable(request, APPROVABLE);
            Instant now = clock.instant();
            return move(locked, RequestStatus.SCHEDULED, reviewed(admin, now, reason)
                .andThen(columns -> columns.put("due_at", now.plus(Duration.ofDays(properties.getWaitDays())))), admin, correlationId);
        });
        queueNotice(approved, () -> notices.approved(approved));
        return approved;
    }

    /** Craves staff reject a request that has not started erasing. As with "keep", the release is queued and the person's tokens end. */
    public DeletionRequest reject(CurrentUser admin, UUID requestId, String reason, UUID correlationId) {
        requireEnabled();
        DeletionRequest request = reviewable(admin, requestId, REJECTABLE);
        DeletionRequest rejected = tx.execute(ignored -> {
            DeletionRequest locked = lockedReviewable(request, REJECTABLE);
            Instant now = clock.instant();
            DeletionRequest moved = move(locked, RequestStatus.REJECTED, reviewed(admin, now, reason), admin, correlationId);
            endWithoutErasing(locked, now);
            return moved;
        });
        queueNotice(rejected, () -> notices.rejected(rejected));
        return rejected;
    }

    /**
     * What each of the 8 services says is open for this person, in {@link AccountErasureClient#ERASE_ORDER}. A service that
     * did not answer shows as SERVICE_UNREACHABLE, as in the worker (a refusal that gives no reasons counts as no answer). The
     * services are asked together, so a hung one costs one timeout, not eight. Never call this inside a transaction.
     */
    public List<Blocker> blockers(UUID identityId, Scope scope) {
        List<String> services = AccountErasureClient.ERASE_ORDER;
        List<ServiceCall> answers;
        try (ExecutorService calls = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = services.stream()
                .map(service -> CompletableFuture.supplyAsync(() -> client.blockers(service, identityId, scope), calls)).toList();
            answers = pending.stream().map(CompletableFuture::join).toList();
        }
        List<Blocker> blockers = new ArrayList<>();
        for (int i = 0; i < services.size(); i++) {
            ServiceCall answer = answers.get(i);
            boolean answered = answer.outcome() == AccountErasureClient.Outcome.DONE
                || (answer.outcome() == AccountErasureClient.Outcome.BLOCKED && !answer.blockers().isEmpty());
            if (answered) blockers.addAll(answer.blockers());
            else blockers.add(new Blocker(services.get(i), "SERVICE_UNREACHABLE", Objects.requireNonNullElse(answer.error(), answer.outcome().name())));
        }
        return blockers;
    }

    /** The request, for a reviewer who is not its owner, while its status allows this review. */
    private DeletionRequest reviewable(CurrentUser admin, UUID requestId, Set<RequestStatus> allowed) {
        DeletionRequest request = deletions.find(requestId).orElseThrow(AccountDeletionService::noRequest);
        if (request.identityId().equals(admin.identityId())) {
            throw AuthException.forbidden("ACCOUNT_DELETION_OWN_REQUEST", "Nobody reviews their own account deletion request");
        }
        if (!allowed.contains(request.status())) throw notReviewable();
        return request;
    }

    /** In the transaction: the same request, locked and still in a status this review allows (a keep or the worker may have moved it). */
    private DeletionRequest lockedReviewable(DeletionRequest request, Set<RequestStatus> allowed) {
        return deletions.lockOpen(request.identityId())
            .filter(open -> open.id().equals(request.id()) && allowed.contains(open.status()))
            .orElseThrow(AccountDeletionService::notReviewable);
    }

    private static Consumer<Map<String, Object>> reviewed(CurrentUser admin, Instant now, String reason) {
        return columns -> {
            columns.put("reviewed_by", admin.identityId());
            columns.put("reviewed_at", now);
            columns.put("review_note", reason);
        };
    }

    /** The status change and its audit row, in the caller's transaction. The audit details hold ids and codes only. */
    private DeletionRequest move(DeletionRequest from, RequestStatus to, Consumer<Map<String, Object>> columns, CurrentUser admin,
                                 UUID correlationId) {
        if (!deletions.transition(from.id(), from.status(), to, columns)) throw notReviewable();
        deletions.audit(from.identityId(), to == RequestStatus.SCHEDULED ? "ACCOUNT_DELETION_APPROVED" : "ACCOUNT_DELETION_REJECTED",
            admin.identityId(), "requestId=" + from.id() + ";scope=" + from.scope() + ";from=" + from.status() + ";to=" + to, correlationId);
        return deletions.find(from.id()).orElseThrow();
    }

    /** A request that ends without erasing: a chef one queues the release of what PREPARE held back; the person's tokens end so the claim goes. */
    private void endWithoutErasing(DeletionRequest request, Instant now) {
        if (request.scope() != Scope.CUSTOMER) deletions.insertSteps(request.id(), Phase.RELEASE, RELEASE_SERVICES, now);
        identities.incrementTokenVersion(request.identityId());
    }

    /** The open request, if any. Read from the database at every token issue, so a refresh after "keep" drops the claim. */
    public Optional<PendingDeletion> pending(UUID identityId) {
        return deletions.findOpen(identityId)
            .map(request -> new PendingDeletion(request.id(), request.scope().name(), request.status().name(), request.dueAt()));
    }

    /** True while this person's customer side is being erased. Read whether or not the switch is on: the worker may be. */
    public boolean erasingCustomerSide(UUID identityId) {
        return deletions.hasErasingCustomerSide(identityId);
    }

    void requireEnabled() {
        if (!properties.isEnabled()) {
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_DELETION_NOT_ENABLED", "Account deletion is not available yet");
        }
    }

    private void queueNotice(DeletionRequest request, Runnable notice) {
        try {
            noticeExecutor.execute(notice);
        } catch (RejectedExecutionException full) {
            log.warn("Deletion notice dropped, queue full: requestId={}", request.id());
        }
    }

    static AuthException noRequest() {
        return new AuthException(HttpStatus.NOT_FOUND, "NO_DELETION_REQUEST", "There is no account deletion request");
    }

    private static AuthException notReviewable() {
        return AuthException.conflict("ACCOUNT_DELETION_NOT_REVIEWABLE", "This request can no longer be reviewed this way");
    }
}
