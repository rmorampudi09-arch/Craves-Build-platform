package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.support.SupportCaseCursor;
import in.craves.userchef.support.SupportCaseCursorCodec;
import in.craves.userchef.support.SupportCaseStatus;
import in.craves.userchef.web.SupportCaseDtos.AddBackofficeSupportMessageRequest;
import in.craves.userchef.web.SupportCaseDtos.AddSupportMessageRequest;
import in.craves.userchef.web.SupportCaseDtos.CreateSupportCaseRequest;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseDetailResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseMessageResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCasePageResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseStatusHistoryResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseSummaryResponse;
import in.craves.userchef.web.SupportCaseDtos.UpdateSupportCaseStatusRequest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class SupportCaseService {
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_CURSOR_LENGTH = 512;
    private static final int MAX_SUBJECT_LENGTH = 160;
    private static final int MAX_MESSAGE_LENGTH = 5000;
    private static final int MAX_STATUS_NOTE_LENGTH = 500;

    private final NamedParameterJdbcTemplate jdbc;

    public SupportCaseService(JdbcTemplate jdbcTemplate) {
        this(new NamedParameterJdbcTemplate(jdbcTemplate));
    }

    SupportCaseService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public SupportCaseDetailResponse create(CurrentUser user, CreateSupportCaseRequest request) {
        requireRequester(user);
        if (request == null) {
            throw ApiException.badRequest("SUPPORT_CASE_REQUIRED", "Support case request is required");
        }
        String requesterRole = requireContextRole(user, request.contextRole());
        String subject = requireText(request.subject(), "SUBJECT_REQUIRED", "Subject is required");
        String message = requireText(request.message(), "MESSAGE_REQUIRED", "Message is required");
        validateLength(subject, MAX_SUBJECT_LENGTH, "SUBJECT_TOO_LONG", "Subject must be 160 characters or fewer");
        validateLength(message, MAX_MESSAGE_LENGTH, "MESSAGE_TOO_LONG", "Message must be 5000 characters or fewer");

        UUID caseId = UUID.randomUUID();
        String caseNumber = caseNumber(caseId);
        jdbc.update(
            """
                INSERT INTO support_case(
                    id, case_number, requester_identity_id, requester_role, order_id,
                    subject, status, last_requester_message_at, created_at, updated_at
                )
                VALUES (
                    :id, :caseNumber, :requesterIdentityId, :requesterRole, :orderId,
                    :subject, 'OPEN', now(), now(), now()
                )
                """,
            new MapSqlParameterSource()
                .addValue("id", caseId)
                .addValue("caseNumber", caseNumber)
                .addValue("requesterIdentityId", user.identityId())
                .addValue("requesterRole", requesterRole)
                .addValue("orderId", request.orderId())
                .addValue("subject", subject)
        );
        insertMessage(caseId, user.identityId(), requesterRole, message, false);
        insertStatusHistory(caseId, null, SupportCaseStatus.OPEN, user.identityId(), requesterRole, null);
        return getMine(user, caseId);
    }

    public SupportCasePageResponse listMine(
        CurrentUser user,
        int limit,
        String encodedCursor,
        SupportCaseStatus status
    ) {
        requireRequester(user);
        return pageCases(user, false, limit, encodedCursor, status, false);
    }

    public SupportCaseDetailResponse getMine(CurrentUser user, UUID caseId) {
        requireRequester(user);
        SupportCaseSummaryResponse summary = requireOwnedCase(user.identityId(), caseId);
        return new SupportCaseDetailResponse(
            summary,
            listMessages(caseId, false),
            listStatusHistory(caseId, false)
        );
    }

    @Transactional
    public SupportCaseDetailResponse addRequesterMessage(
        CurrentUser user,
        UUID caseId,
        AddSupportMessageRequest request
    ) {
        requireRequester(user);
        SupportCaseSummaryResponse supportCase = requireOwnedCase(user.identityId(), caseId);
        ensureCaseAcceptsMessages(supportCase);
        String message = request == null ? null : request.message();
        message = requireText(message, "MESSAGE_REQUIRED", "Message is required");
        validateLength(message, MAX_MESSAGE_LENGTH, "MESSAGE_TOO_LONG", "Message must be 5000 characters or fewer");
        String senderRole = requireContextRole(user, supportCase.requesterRole());
        insertMessage(caseId, user.identityId(), senderRole, message, false);
        jdbc.update(
            "UPDATE support_case SET last_requester_message_at = now(), updated_at = now() WHERE id = :id",
            new MapSqlParameterSource("id", caseId)
        );
        return getMine(user, caseId);
    }

    public SupportCasePageResponse listBackoffice(
        CurrentUser user,
        int limit,
        String encodedCursor,
        SupportCaseStatus status,
        boolean assignedToMe
    ) {
        requireSupportAgent(user);
        return pageCases(user, true, limit, encodedCursor, status, assignedToMe);
    }

    public SupportCaseDetailResponse getBackoffice(CurrentUser user, UUID caseId) {
        requireSupportAgent(user);
        SupportCaseSummaryResponse summary = requireCase(caseId);
        return new SupportCaseDetailResponse(
            summary,
            listMessages(caseId, true),
            listStatusHistory(caseId, true)
        );
    }

    @Transactional
    public SupportCaseDetailResponse addBackofficeMessage(
        CurrentUser user,
        UUID caseId,
        AddBackofficeSupportMessageRequest request
    ) {
        requireSupportAgent(user);
        SupportCaseSummaryResponse supportCase = requireCase(caseId);
        ensureCaseAcceptsMessages(supportCase);
        String message = request == null ? null : request.message();
        message = requireText(message, "MESSAGE_REQUIRED", "Message is required");
        validateLength(message, MAX_MESSAGE_LENGTH, "MESSAGE_TOO_LONG", "Message must be 5000 characters or fewer");
        String senderRole = supportRole(user);
        boolean internalNote = request != null && request.internalNote();
        UUID messageId = insertMessage(caseId, user.identityId(), senderRole, message, internalNote);
        jdbc.update(
            "UPDATE support_case SET last_support_message_at = now(), updated_at = now() WHERE id = :id",
            new MapSqlParameterSource("id", caseId)
        );
        if (!internalNote) {
            insertRequesterNotification(
                "support-reply-" + messageId,
                "SUPPORT_CASE_REPLY",
                "SUPPORT_CASE_REPLY_IN_APP",
                supportCase,
                "Craves Support replied",
                "Craves Support replied to case " + supportCase.caseNumber() + ".",
                supportCase.status()
            );
        }
        return getBackoffice(user, caseId);
    }

    @Transactional
    public SupportCaseDetailResponse updateStatus(
        CurrentUser user,
        UUID caseId,
        UpdateSupportCaseStatusRequest request
    ) {
        requireSupportAgent(user);
        SupportCaseSummaryResponse current = requireCase(caseId);
        if (request == null || request.status() == null) {
            throw ApiException.badRequest("SUPPORT_STATUS_REQUIRED", "Support case status is required");
        }
        String note = trimToNull(request.note());
        if (note != null) {
            validateLength(note, MAX_STATUS_NOTE_LENGTH, "STATUS_NOTE_TOO_LONG", "Status note must be 500 characters or fewer");
        }
        SupportCaseStatus next = request.status();
        if (next == current.status()) {
            return getBackoffice(user, caseId);
        }

        jdbc.update(
            """
                UPDATE support_case
                   SET status = :status,
                       resolved_at = CASE
                           WHEN :status = 'RESOLVED' THEN now()
                           WHEN :status IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER') THEN NULL
                           ELSE resolved_at
                       END,
                       closed_at = CASE WHEN :status = 'CLOSED' THEN now() ELSE NULL END,
                       updated_at = now()
                 WHERE id = :id
                """,
            new MapSqlParameterSource()
                .addValue("status", next.name())
                .addValue("id", caseId)
        );
        UUID historyId = insertStatusHistory(
            caseId,
            current.status(),
            next,
            user.identityId(),
            supportRole(user),
            note
        );
        insertRequesterNotification(
            "support-status-" + historyId,
            "SUPPORT_CASE_STATUS_CHANGED",
            "SUPPORT_CASE_STATUS_CHANGED_IN_APP",
            current,
            "Support case updated",
            statusNotificationBody(current.caseNumber(), next),
            next
        );
        return getBackoffice(user, caseId);
    }

    @Transactional
    public SupportCaseDetailResponse assignToMe(CurrentUser user, UUID caseId) {
        requireSupportAgent(user);
        SupportCaseSummaryResponse current = requireCase(caseId);
        if (user.identityId().equals(current.assignedToIdentityId())) {
            return getBackoffice(user, caseId);
        }
        jdbc.update(
            "UPDATE support_case SET assigned_to_identity_id = :assignee, updated_at = now() WHERE id = :id",
            new MapSqlParameterSource()
                .addValue("assignee", user.identityId())
                .addValue("id", caseId)
        );
        jdbc.update(
            """
                INSERT INTO support_case_assignment_history(
                    id, case_id, old_assignee_identity_id, new_assignee_identity_id,
                    actor_identity_id, actor_role, created_at
                )
                VALUES (:historyId, :caseId, :oldAssignee, :newAssignee, :actor, :actorRole, now())
                """,
            new MapSqlParameterSource()
                .addValue("historyId", UUID.randomUUID())
                .addValue("caseId", caseId)
                .addValue("oldAssignee", current.assignedToIdentityId())
                .addValue("newAssignee", user.identityId())
                .addValue("actor", user.identityId())
                .addValue("actorRole", supportRole(user))
        );
        return getBackoffice(user, caseId);
    }

    private SupportCasePageResponse pageCases(
        CurrentUser user,
        boolean backoffice,
        int limit,
        String encodedCursor,
        SupportCaseStatus status,
        boolean assignedToMe
    ) {
        validatePageSize(limit);
        SupportCaseCursor cursor = decodeCursor(encodedCursor);
        StringBuilder sql = new StringBuilder("SELECT * FROM support_case WHERE 1=1\n");
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("fetchLimit", limit + 1);
        if (backoffice) {
            if (assignedToMe) {
                sql.append(" AND assigned_to_identity_id = :identityId\n");
                params.addValue("identityId", user.identityId());
            }
        } else {
            sql.append(" AND requester_identity_id = :identityId\n");
            params.addValue("identityId", user.identityId());
        }
        if (status != null) {
            sql.append(" AND status = :status\n");
            params.addValue("status", status.name());
        }
        if (cursor != null) {
            sql.append(" AND (updated_at < :cursorUpdatedAt OR (updated_at = :cursorUpdatedAt AND id < :cursorId))\n");
            params.addValue("cursorUpdatedAt", cursor.updatedAt());
            params.addValue("cursorId", cursor.id());
        }
        sql.append(" ORDER BY updated_at DESC, id DESC LIMIT :fetchLimit");

        List<SupportCaseSummaryResponse> fetched = jdbc.query(sql.toString(), params, this::mapSummary);
        boolean hasMore = fetched.size() > limit;
        List<SupportCaseSummaryResponse> cases = hasMore
            ? List.copyOf(fetched.subList(0, limit))
            : List.copyOf(fetched);
        String nextCursor = null;
        if (hasMore && !cases.isEmpty()) {
            SupportCaseSummaryResponse last = cases.get(cases.size() - 1);
            nextCursor = SupportCaseCursorCodec.encode(new SupportCaseCursor(last.updatedAt(), last.id()));
        }
        return new SupportCasePageResponse(cases, nextCursor, hasMore);
    }

    private SupportCaseSummaryResponse requireOwnedCase(UUID requesterIdentityId, UUID caseId) {
        if (caseId == null) {
            throw ApiException.badRequest("SUPPORT_CASE_ID_REQUIRED", "Support case id is required");
        }
        List<SupportCaseSummaryResponse> rows = jdbc.query(
            "SELECT * FROM support_case WHERE id = :id AND requester_identity_id = :requesterIdentityId",
            new MapSqlParameterSource()
                .addValue("id", caseId)
                .addValue("requesterIdentityId", requesterIdentityId),
            this::mapSummary
        );
        if (rows.isEmpty()) {
            throw ApiException.notFound("SUPPORT_CASE_NOT_FOUND", "Support case was not found");
        }
        return rows.getFirst();
    }

    private SupportCaseSummaryResponse requireCase(UUID caseId) {
        if (caseId == null) {
            throw ApiException.badRequest("SUPPORT_CASE_ID_REQUIRED", "Support case id is required");
        }
        List<SupportCaseSummaryResponse> rows = jdbc.query(
            "SELECT * FROM support_case WHERE id = :id",
            new MapSqlParameterSource("id", caseId),
            this::mapSummary
        );
        if (rows.isEmpty()) {
            throw ApiException.notFound("SUPPORT_CASE_NOT_FOUND", "Support case was not found");
        }
        return rows.getFirst();
    }

    private List<SupportCaseMessageResponse> listMessages(UUID caseId, boolean includeInternalNotes) {
        String sql = """
            SELECT id, sender_identity_id, sender_role, body, internal_note, created_at
              FROM support_case_message
             WHERE case_id = :caseId
            """ + (includeInternalNotes ? "" : " AND internal_note = false\n") +
            " ORDER BY created_at ASC, id ASC";
        return jdbc.query(sql, new MapSqlParameterSource("caseId", caseId), this::mapMessage);
    }

    private List<SupportCaseStatusHistoryResponse> listStatusHistory(UUID caseId, boolean includeNotes) {
        return jdbc.query(
            """
                SELECT id, old_status, new_status, actor_identity_id, actor_role, note, created_at
                  FROM support_case_status_history
                 WHERE case_id = :caseId
                 ORDER BY created_at ASC, id ASC
                """,
            new MapSqlParameterSource("caseId", caseId),
            (rs, rowNum) -> new SupportCaseStatusHistoryResponse(
                rs.getObject("id", UUID.class),
                statusOrNull(rs.getString("old_status")),
                SupportCaseStatus.valueOf(rs.getString("new_status")),
                rs.getObject("actor_identity_id", UUID.class),
                rs.getString("actor_role"),
                includeNotes ? rs.getString("note") : null,
                instant(rs, "created_at")
            )
        );
    }

    private UUID insertMessage(
        UUID caseId,
        UUID senderIdentityId,
        String senderRole,
        String message,
        boolean internalNote
    ) {
        UUID messageId = UUID.randomUUID();
        jdbc.update(
            """
                INSERT INTO support_case_message(
                    id, case_id, sender_identity_id, sender_role, body, internal_note, created_at
                )
                VALUES (:id, :caseId, :senderIdentityId, :senderRole, :body, :internalNote, now())
                """,
            new MapSqlParameterSource()
                .addValue("id", messageId)
                .addValue("caseId", caseId)
                .addValue("senderIdentityId", senderIdentityId)
                .addValue("senderRole", senderRole)
                .addValue("body", message)
                .addValue("internalNote", internalNote)
        );
        return messageId;
    }

    private UUID insertStatusHistory(
        UUID caseId,
        SupportCaseStatus oldStatus,
        SupportCaseStatus newStatus,
        UUID actorIdentityId,
        String actorRole,
        String note
    ) {
        UUID historyId = UUID.randomUUID();
        jdbc.update(
            """
                INSERT INTO support_case_status_history(
                    id, case_id, old_status, new_status, actor_identity_id, actor_role, note, created_at
                )
                VALUES (:id, :caseId, :oldStatus, :newStatus, :actorIdentityId, :actorRole, :note, now())
                """,
            new MapSqlParameterSource()
                .addValue("id", historyId)
                .addValue("caseId", caseId)
                .addValue("oldStatus", oldStatus == null ? null : oldStatus.name())
                .addValue("newStatus", newStatus.name())
                .addValue("actorIdentityId", actorIdentityId)
                .addValue("actorRole", actorRole)
                .addValue("note", note)
        );
        return historyId;
    }

    private void insertRequesterNotification(
        String eventKey,
        String eventType,
        String templateCode,
        SupportCaseSummaryResponse supportCase,
        String title,
        String body,
        SupportCaseStatus status
    ) {
        jdbc.update(
            """
                INSERT INTO notification_outbox(
                    event_key, event_type, aggregate_type, aggregate_id,
                    user_identity_id, user_role, channel, template_code,
                    title, body, target_type, target_id, payload,
                    status, created_at, updated_at
                )
                VALUES (
                    :eventKey, :eventType, 'SUPPORT_CASE', :caseId,
                    :requesterIdentityId, :requesterRole, 'IN_APP', :templateCode,
                    :title, :body, 'SUPPORT_CASE', :caseId,
                    jsonb_build_object(
                        'caseId', CAST(:caseId AS text),
                        'caseNumber', :caseNumber,
                        'status', :supportStatus
                    ),
                    'PENDING', now(), now()
                )
                ON CONFLICT (event_key) DO NOTHING
                """,
            new MapSqlParameterSource()
                .addValue("eventKey", eventKey)
                .addValue("eventType", eventType)
                .addValue("caseId", supportCase.id())
                .addValue("requesterIdentityId", supportCase.requesterIdentityId())
                .addValue("requesterRole", supportCase.requesterRole())
                .addValue("templateCode", templateCode)
                .addValue("title", title)
                .addValue("body", body)
                .addValue("caseNumber", supportCase.caseNumber())
                .addValue("supportStatus", status.name())
        );
    }

    private SupportCaseSummaryResponse mapSummary(ResultSet rs, int rowNum) throws SQLException {
        return new SupportCaseSummaryResponse(
            rs.getObject("id", UUID.class),
            rs.getString("case_number"),
            rs.getObject("requester_identity_id", UUID.class),
            rs.getString("requester_role"),
            rs.getObject("order_id", UUID.class),
            rs.getString("subject"),
            SupportCaseStatus.valueOf(rs.getString("status")),
            rs.getObject("assigned_to_identity_id", UUID.class),
            instantOrNull(rs, "last_requester_message_at"),
            instantOrNull(rs, "last_support_message_at"),
            instantOrNull(rs, "resolved_at"),
            instantOrNull(rs, "closed_at"),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private SupportCaseMessageResponse mapMessage(ResultSet rs, int rowNum) throws SQLException {
        return new SupportCaseMessageResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("sender_identity_id", UUID.class),
            rs.getString("sender_role"),
            rs.getString("body"),
            rs.getBoolean("internal_note"),
            instant(rs, "created_at")
        );
    }

    private static void requireRequester(CurrentUser user) {
        if (user == null || !user.hasAnyRole("CUSTOMER", "CHEF")) {
            throw ApiException.forbidden(
                "SUPPORT_REQUESTER_ROLE_REQUIRED",
                "An active CUSTOMER or CHEF role is required to create or view support cases"
            );
        }
    }

    private static void requireSupportAgent(CurrentUser user) {
        if (user == null || !user.hasAnyRole("SUPPORT_ADMIN", "PLATFORM_ADMIN")) {
            throw ApiException.forbidden(
                "SUPPORT_ADMIN_ROLE_REQUIRED",
                "SUPPORT_ADMIN or PLATFORM_ADMIN role is required for support case operations"
            );
        }
    }

    private static String supportRole(CurrentUser user) {
        if (user.hasRole("PLATFORM_ADMIN")) {
            return "PLATFORM_ADMIN";
        }
        if (user.hasRole("SUPPORT_ADMIN")) {
            return "SUPPORT_ADMIN";
        }
        throw ApiException.forbidden("SUPPORT_ADMIN_ROLE_REQUIRED", "Support administrator role is required");
    }

    private static String requireContextRole(CurrentUser user, String requestedRole) {
        String normalized = trimToNull(requestedRole);
        if (normalized == null) {
            if (user.hasRole("CUSTOMER")) {
                return "CUSTOMER";
            }
            if (user.hasRole("CHEF")) {
                return "CHEF";
            }
            throw ApiException.forbidden("SUPPORT_REQUESTER_ROLE_REQUIRED", "Customer or chef role is required");
        }
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!(normalized.equals("CUSTOMER") || normalized.equals("CHEF")) || !user.hasRole(normalized)) {
            throw ApiException.forbidden(
                "INVALID_SUPPORT_CONTEXT_ROLE",
                "contextRole must be an active CUSTOMER or CHEF role owned by the caller"
            );
        }
        return normalized;
    }

    private static void ensureCaseAcceptsMessages(SupportCaseSummaryResponse supportCase) {
        if (supportCase.status() == SupportCaseStatus.CLOSED) {
            throw ApiException.conflict("SUPPORT_CASE_CLOSED", "Closed support cases do not accept new messages");
        }
    }

    private static void validatePageSize(int limit) {
        if (limit <= 0 || limit > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("INVALID_PAGE_SIZE", "limit must be between 1 and 100");
        }
    }

    private static SupportCaseCursor decodeCursor(String encodedCursor) {
        String cursor = trimToNull(encodedCursor);
        if (cursor == null) {
            return null;
        }
        if (cursor.length() > MAX_CURSOR_LENGTH) {
            throw ApiException.badRequest("INVALID_CURSOR", "cursor is invalid");
        }
        try {
            return SupportCaseCursorCodec.decode(cursor);
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("INVALID_CURSOR", "cursor is invalid");
        }
    }

    private static String requireText(String value, String code, String message) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw ApiException.badRequest(code, message);
        }
        return normalized;
    }

    private static void validateLength(String value, int maximum, String code, String message) {
        if (value.codePointCount(0, value.length()) > maximum) {
            throw ApiException.badRequest(code, message);
        }
    }

    private static String caseNumber(UUID id) {
        String compact = id.toString().replace("-", "").toUpperCase(Locale.ROOT);
        return "CRV-" + compact.substring(0, 28);
    }

    private static String statusNotificationBody(String caseNumber, SupportCaseStatus status) {
        return switch (status) {
            case OPEN -> "Support case " + caseNumber + " is open.";
            case IN_PROGRESS -> "Support case " + caseNumber + " is being reviewed.";
            case WAITING_FOR_REQUESTER -> "Craves Support needs more information for case " + caseNumber + ".";
            case RESOLVED -> "Support case " + caseNumber + " has been marked resolved.";
            case CLOSED -> "Support case " + caseNumber + " has been closed.";
        };
    }

    private static SupportCaseStatus statusOrNull(String value) {
        return value == null ? null : SupportCaseStatus.valueOf(value);
    }

    private static String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        if (timestamp == null) {
            throw new SQLException("Required timestamp column is null: " + column);
        }
        return timestamp.toInstant();
    }

    private static Instant instantOrNull(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
