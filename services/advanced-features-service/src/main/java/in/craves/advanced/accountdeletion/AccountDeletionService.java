package in.craves.advanced.accountdeletion;

import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionCase;
import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionCasePage;
import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionStatus;
import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionView;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.tastedata.PersonalDataEraser;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Craves keeps a request until staff finish or refuse it. Finishing erases the person's data in every advanced module; staff remove the
 * core account (sign-in, profile, kitchen) with their own tools and say so in the message, so nothing here deletes another service's data.
 */
@Service
public class AccountDeletionService {
    static final String COLUMNS = "id, person_id, roles, reason, status, staff_id, message_to_person, advanced_records_erased, version, "
            + "created_at, updated_at, closed_at";
    private static final String OPEN = "status IN ('REQUESTED', 'IN_PROGRESS')";
    static final int ASKS_PER_DAY = 3;
    private final JdbcTemplate jdbc;
    private final PersonalDataEraser eraser;
    private final Audit audit;
    private final Clock clock;

    public AccountDeletionService(JdbcTemplate jdbc, PersonalDataEraser eraser, Audit audit, Clock clock) {
        this.jdbc = jdbc;
        this.eraser = eraser;
        this.audit = audit;
        this.clock = clock;
    }

    public record Asked(AccountDeletionView request, boolean created) { }

    /** Asking again while a request is open returns that request. */
    @Transactional
    public Asked request(UUID person, List<String> roles, String reason) {
        Optional<AccountDeletionCase> open = openOf(person);
        if (open.isPresent()) return new Asked(view(open.get()), false);
        String text = reason == null || reason.isBlank() ? null : reason.strip();
        if (text != null && hasControl(text)) throw ApiProblem.badRequest("INVALID_REASON", "The reason must not contain control characters");
        Instant now = clock.instant();
        // shortcut: a fixed bound against ask-and-withdraw loops filling the staff queue; make it staff-set if real people hit it.
        Integer recent = jdbc.queryForObject("SELECT count(*) FROM adv_account_deletion.request WHERE person_id = ? AND created_at > ?",
                Integer.class, person, Sql.ts(now.minus(Duration.ofHours(24))));
        if (recent != null && recent >= ASKS_PER_DAY) {
            throw new ApiProblem(429, "TOO_MANY_DELETION_REQUESTS", "You asked several times today; try again tomorrow or contact support");
        }
        UUID id = UUID.randomUUID();
        // A concurrent ask waits here for the other insert and then finds its row.
        int inserted = jdbc.update("INSERT INTO adv_account_deletion.request (id, person_id, roles, reason, status, version, created_at, updated_at) "
                + "VALUES (?,?,?,?,'REQUESTED',1,?,?) ON CONFLICT (person_id) WHERE " + OPEN + " DO NOTHING",
                id, person, String.join(",", roles), text, Sql.ts(now), Sql.ts(now));
        if (inserted == 0) {
            return new Asked(view(openOf(person).orElseThrow(() -> ApiProblem.conflict("DELETION_REQUEST_BUSY", "Try again in a moment"))), false);
        }
        audit.record(AccountDeletionModule.ID, person, "ACCOUNT_DELETION_REQUESTED", "account_deletion", id, Map.of("roles", roles));
        return new Asked(view(find(id, false)), true);
    }

    @Transactional(readOnly = true)
    public AccountDeletionView mine(UUID person) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_account_deletion.request WHERE person_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
                        AccountDeletionService::row, person).stream().findFirst().map(AccountDeletionService::view)
                .orElseThrow(() -> ApiProblem.notFound("NO_DELETION_REQUEST", "You have not asked to delete your account"));
    }

    @Transactional
    public AccountDeletionView withdraw(UUID person) {
        AccountDeletionCase open = jdbc.query("SELECT " + COLUMNS + " FROM adv_account_deletion.request WHERE person_id = ? AND " + OPEN
                        + " FOR UPDATE", AccountDeletionService::row, person).stream().findFirst()
                .orElseThrow(() -> ApiProblem.notFound("NO_OPEN_DELETION_REQUEST", "You have no open account deletion request"));
        if (open.status() == AccountDeletionStatus.IN_PROGRESS) {
            throw ApiProblem.conflict("DELETION_IN_PROGRESS", "Craves has started deleting your account; contact support to stop it");
        }
        close(open.id(), AccountDeletionStatus.WITHDRAWN, null, null, null);
        audit.record(AccountDeletionModule.ID, person, "ACCOUNT_DELETION_WITHDRAWN", "account_deletion", open.id(), Map.of());
        return view(find(open.id(), false));
    }

    /** Oldest first, so the queue is worked in the order people asked. */
    @Transactional(readOnly = true)
    public AccountDeletionCasePage list(AccountDeletionStatus status, String cursor, int limit) {
        Cursor position = Cursor.decode(cursor);
        StringBuilder sql = new StringBuilder("SELECT " + COLUMNS + " FROM adv_account_deletion.request WHERE TRUE");
        List<Object> args = new ArrayList<>();
        if (status != null) {
            sql.append(" AND status = ?");
            args.add(status.name());
        }
        if (position != null) {
            sql.append(" AND (created_at, id) > (?, ?)");
            args.add(Sql.ts(position.at()));
            args.add(position.id());
        }
        sql.append(" ORDER BY created_at, id LIMIT ?");
        args.add(limit + 1);
        List<AccountDeletionCase> rows = jdbc.query(sql.toString(), AccountDeletionService::row, args.toArray());
        List<AccountDeletionCase> items = rows.stream().limit(limit).toList();
        String next = rows.size() > limit ? new Cursor(items.get(limit - 1).requestedAt(), items.get(limit - 1).id()).encode() : null;
        return new AccountDeletionCasePage(items, next);
    }

    @Transactional(readOnly = true)
    public AccountDeletionCase get(UUID id) {
        return find(id, false);
    }

    @Transactional
    public AccountDeletionCase start(UUID staff, UUID id, long expectedVersion) {
        AccountDeletionCase current = forStaff(staff, id, expectedVersion, AccountDeletionStatus.REQUESTED);
        jdbc.update("UPDATE adv_account_deletion.request SET status = 'IN_PROGRESS', staff_id = ?, version = version + 1, updated_at = ? WHERE id = ?",
                staff, Sql.ts(clock.instant()), id);
        audit.record(AccountDeletionModule.ID, staff, "ACCOUNT_DELETION_STARTED", "account_deletion", id, Map.of("person", current.personId()));
        return find(id, false);
    }

    /** Erases the person's advanced-module data in the same transaction, then closes the request. */
    @Transactional
    public AccountDeletionCase complete(UUID staff, UUID id, long expectedVersion, String message) {
        AccountDeletionCase current = forStaff(staff, id, expectedVersion, AccountDeletionStatus.IN_PROGRESS);
        PersonalDataEraser.Erased erased = eraser.erase(current.personId());
        if (!erased.skipped().isEmpty()) {
            // Throwing rolls the partial erase back; the request stays IN_PROGRESS so staff can finish it when the modules are back.
            throw ApiProblem.unavailable("ERASE_INCOMPLETE", "These features are switched off or unavailable, so their data could not be erased: "
                    + String.join(", ", erased.skipped()) + ". The request stays in progress; complete it again when they are back.");
        }
        close(id, AccountDeletionStatus.COMPLETED, staff, cleanMessage(message), erased.records());
        audit.record(AccountDeletionModule.ID, staff, "ACCOUNT_DELETION_COMPLETED", "account_deletion", id,
                Map.of("person", current.personId(), "advancedRecordsErased", erased.records(), "modules", erased.modules()));
        return find(id, false);
    }

    @Transactional
    public AccountDeletionCase reject(UUID staff, UUID id, long expectedVersion, String message) {
        String text = cleanMessage(message);
        if (text == null) throw ApiProblem.badRequest("MESSAGE_REQUIRED", "Tell the person why their account cannot be deleted yet");
        AccountDeletionCase current = forStaff(staff, id, expectedVersion, AccountDeletionStatus.REQUESTED, AccountDeletionStatus.IN_PROGRESS);
        close(id, AccountDeletionStatus.REJECTED, staff, text, null);
        audit.record(AccountDeletionModule.ID, staff, "ACCOUNT_DELETION_REJECTED", "account_deletion", id, Map.of("person", current.personId()));
        return find(id, false);
    }

    List<AccountDeletionCase> allOf(UUID person) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_account_deletion.request WHERE person_id = ? ORDER BY created_at, id",
                AccountDeletionService::row, person);
    }

    private AccountDeletionCase forStaff(UUID staff, UUID id, long expectedVersion, AccountDeletionStatus... allowed) {
        AccountDeletionCase current = find(id, true);
        if (current.personId().equals(staff)) throw ApiProblem.forbidden("OWN_REQUEST", "Another staff member must handle your own request");
        if (current.version() != expectedVersion) {
            throw new ApiProblem(412, "VERSION_MISMATCH", "This changed since you loaded it; reload and try again");
        }
        if (!Arrays.asList(allowed).contains(current.status())) {
            throw ApiProblem.conflict("DELETION_STATUS", "The request is " + current.status());
        }
        return current;
    }

    private void close(UUID id, AccountDeletionStatus status, UUID staff, String message, Integer erased) {
        Instant now = clock.instant();
        jdbc.update("UPDATE adv_account_deletion.request SET status = ?, staff_id = COALESCE(?, staff_id), message_to_person = ?, "
                        + "advanced_records_erased = ?, version = version + 1, updated_at = ?, closed_at = ? WHERE id = ?",
                status.name(), staff, message, erased, Sql.ts(now), Sql.ts(now), id);
    }

    private Optional<AccountDeletionCase> openOf(UUID person) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_account_deletion.request WHERE person_id = ? AND " + OPEN,
                AccountDeletionService::row, person).stream().findFirst();
    }

    private AccountDeletionCase find(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_account_deletion.request WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                        AccountDeletionService::row, id).stream().findFirst()
                .orElseThrow(() -> ApiProblem.notFound("DELETION_REQUEST_NOT_FOUND", "No such account deletion request"));
    }

    private static String cleanMessage(String message) {
        if (message == null || message.isBlank()) return null;
        String text = message.strip();
        if (hasControl(text)) throw ApiProblem.badRequest("INVALID_MESSAGE", "The message must not contain control characters");
        return text;
    }

    /** Line breaks and tabs are fine; other control characters (NUL breaks PostgreSQL) are not. */
    static boolean hasControl(String text) {
        return text.chars().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t');
    }

    static AccountDeletionView view(AccountDeletionCase row) {
        return new AccountDeletionView(row.id(), row.status(), row.reason(), row.messageToPerson(), row.requestedAt(), row.updatedAt(), row.closedAt());
    }

    private static AccountDeletionCase row(ResultSet rs, int i) throws SQLException {
        return new AccountDeletionCase(rs.getObject("id", UUID.class), rs.getObject("person_id", UUID.class),
                Arrays.stream(rs.getString("roles").split(",")).filter(role -> !role.isEmpty()).toList(),
                AccountDeletionStatus.valueOf(rs.getString("status")), rs.getString("reason"), rs.getObject("staff_id", UUID.class),
                rs.getString("message_to_person"), rs.getObject("advanced_records_erased", Integer.class), rs.getLong("version"),
                Sql.instant(rs, "created_at"), Sql.instant(rs, "updated_at"), Sql.instant(rs, "closed_at"));
    }
}
