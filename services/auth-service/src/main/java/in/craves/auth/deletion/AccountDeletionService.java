package in.craves.auth.deletion;

import in.craves.auth.api.IdentityResponse.PendingDeletion;
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
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The signed-in person's side of account deletion: ask, look, and keep the account. Each change is one short
 * transaction with no HTTP call inside (the Hikari pool is 3); notices go out after the commit, off this thread.
 */
@Service
public class AccountDeletionService {
    private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);
    private static final List<String> RELEASE_SERVICES = List.of("subscription", "catalog");

    /** {@code created} is false when the person already had this open request. */
    public record Created(DeletionView view, boolean created) {}

    private record Outcome(DeletionRequest request, boolean created, boolean needsReview) {}

    private final AccountDeletionRepository deletions;
    private final AuthIdentityRepository identities;
    private final AuthIdentityRoleRepository roles;
    private final DeletionNotices notices;
    private final AccountDeletionProperties properties;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final Executor noticeExecutor;

    public AccountDeletionService(AccountDeletionRepository deletions, AuthIdentityRepository identities,
                                  AuthIdentityRoleRepository roles, DeletionNotices notices,
                                  AccountDeletionProperties properties, PlatformTransactionManager transactions, Clock clock,
                                  @Qualifier(DeletionNoticeExecutorConfiguration.NAME) Executor noticeExecutor) {
        this.deletions = deletions;
        this.identities = identities;
        this.roles = roles;
        this.notices = notices;
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
        if (outcome.created()) sendRequestedNotice(outcome.request(), outcome.needsReview());
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
            if (open.scope() != Scope.CUSTOMER) deletions.insertSteps(open.id(), Phase.RELEASE, RELEASE_SERVICES, now);
            identities.incrementTokenVersion(identityId);
            return DeletionView.of(deletions.find(open.id()).orElseThrow());
        });
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

    private void sendRequestedNotice(DeletionRequest request, boolean needsReview) {
        try {
            noticeExecutor.execute(() -> notices.requested(request, needsReview));
        } catch (RejectedExecutionException full) {
            log.warn("Deletion notice dropped, queue full: requestId={}", request.id());
        }
    }

    private static AuthException noRequest() {
        return new AuthException(HttpStatus.NOT_FOUND, "NO_DELETION_REQUEST", "There is no account deletion request");
    }
}
