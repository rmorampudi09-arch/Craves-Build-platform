package in.craves.auth.deletion;

import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import java.time.Instant;
import java.util.UUID;

/** What the person sees of a deletion request. {@code reviewNote} is Craves' reason, shown only when the request was rejected. */
public record DeletionView(UUID requestId, String scope, String status, Instant requestedAt, Instant dueAt, String reviewNote) {
    public static DeletionView of(DeletionRequest request) {
        return new DeletionView(request.id(), request.scope().name(), request.status().name(), request.requestedAt(),
            request.dueAt(), request.status() == RequestStatus.REJECTED ? request.reviewNote() : null);
    }
}
