package in.craves.advanced.accountdeletion;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AccountDeletionDtos {
    private AccountDeletionDtos() { }

    public enum AccountDeletionStatus { REQUESTED, IN_PROGRESS, COMPLETED, REJECTED, WITHDRAWN }

    /** reason: optional, for staff. */
    public record AccountDeletionAsk(@Size(max = 500) String reason) { }

    /** The person's own request; messageToPerson is what staff wrote when they finished or refused it. */
    public record AccountDeletionView(UUID id, AccountDeletionStatus status, String reason, String messageToPerson, Instant requestedAt,
                                      Instant updatedAt, Instant closedAt) { }

    /** roles: the person's roles when they asked (CUSTOMER, CHEF, ...), so staff know which records to remove. */
    public record AccountDeletionCase(UUID id, UUID personId, List<String> roles, AccountDeletionStatus status, String reason, UUID staffId,
                                      String messageToPerson, Integer advancedRecordsErased, long version, Instant requestedAt,
                                      Instant updatedAt, Instant closedAt) { }

    public record AccountDeletionCasePage(List<AccountDeletionCase> items, String nextCursor) { }

    /** messageToPerson: shown to the person; required when refusing. */
    public record AccountDeletionStaffStep(@NotNull Long expectedVersion, @Size(max = 1000) String messageToPerson) { }
}
