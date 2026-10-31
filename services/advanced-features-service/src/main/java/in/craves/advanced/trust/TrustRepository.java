package in.craves.advanced.trust;

import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.trust.TrustDtos.DisputeCategory;
import in.craves.advanced.trust.TrustDtos.DisputePolicyView;
import in.craves.advanced.trust.TrustDtos.DisputeStatus;
import in.craves.advanced.trust.TrustDtos.ReportReason;
import in.craves.advanced.trust.TrustDtos.ReportStatus;
import in.craves.advanced.trust.TrustDtos.ReportTarget;
import in.craves.advanced.trust.TrustDtos.RiskFlagView;
import in.craves.advanced.trust.TrustDtos.RiskSeverity;
import in.craves.advanced.trust.TrustDtos.RiskSubject;
import in.craves.advanced.trust.TrustDtos.StaffTrustReport;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class TrustRepository {
    record Dispute(UUID id, UUID orderId, UUID customerId, UUID kitchenId, DisputeCategory category, String description, Long claimedPaise,
                   long orderValuePaise, long refundablePaise, String chefStatement, UUID chefId, Instant chefRespondedAt, DisputeStatus status, Long refundPaise,
                   String decisionNote, UUID decidedBy, Instant decidedAt, long version, Instant createdAt) { }

    private static final String REPORT = "id, reporter_id, target_type, target_id, reason, details, order_id, status, decision_note, decided_by, "
            + "decided_at, created_at";
    /** Advisory locks on a person use the two-key form with this module's tag, apart from other modules' locks on the same person. */
    private static final int PERSON_LOCK_SPACE = 0x4D313254;
    private static final String DISPUTE = "id, order_id, customer_id, kitchen_id, category, description, claimed_paise, order_value_paise, "
            + "refundable_paise, chef_statement, chef_id, chef_responded_at, status, refund_paise, decision_note, decided_by, decided_at, version, created_at";
    private static final String FLAG = "id, subject_type, subject_id, severity, reason, raised_by, raised_at, cleared_by, cleared_at, clear_note";
    private final JdbcTemplate jdbc;

    TrustRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Filings take it before inserting and erasure before erasing, so nothing a person files at that moment escapes the erasure. */
    void lockPerson(UUID person) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(?, ?)", PERSON_LOCK_SPACE, person.hashCode());
    }

    // Reports

    void insertReport(StaffTrustReport r, Instant now) {
        jdbc.update("INSERT INTO adv_trust.report (id, reporter_id, target_type, target_id, reason, details, order_id, status, created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,'OPEN',?,?)", r.id(), r.reporterId(), r.targetType().name(), r.targetId(), r.reason().name(), r.details(),
                r.orderId(), Sql.ts(now), Sql.ts(now));
    }

    int reportsSince(UUID reporter, Instant since) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM adv_trust.report WHERE reporter_id = ? AND created_at > ?", Integer.class, reporter,
                Sql.ts(since));
        return count == null ? 0 : count;
    }

    Optional<StaffTrustReport> report(UUID id) {
        return jdbc.query("SELECT " + REPORT + " FROM adv_trust.report WHERE id = ?", TrustRepository::report, id).stream().findFirst();
    }

    List<StaffTrustReport> reportsOf(UUID reporter, int limit) {
        return jdbc.query("SELECT " + REPORT + " FROM adv_trust.report WHERE reporter_id = ? ORDER BY created_at DESC, id LIMIT ?",
                TrustRepository::report, reporter, limit);
    }

    /** Oldest first, so the queue is worked in order. */
    List<StaffTrustReport> reportQueue(ReportStatus status, int limit) {
        return jdbc.query("SELECT " + REPORT + " FROM adv_trust.report WHERE status = ? ORDER BY created_at, id LIMIT ?", TrustRepository::report,
                status.name(), limit);
    }

    List<StaffTrustReport> reportsAbout(ReportTarget type, UUID target, int limit) {
        return jdbc.query("SELECT " + REPORT + " FROM adv_trust.report WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC, id LIMIT ?",
                TrustRepository::report, type.name(), target, limit);
    }

    /** True when the report was still open and is now decided. */
    boolean decideReport(UUID id, ReportStatus outcome, String note, UUID staff, Instant now) {
        return jdbc.update("UPDATE adv_trust.report SET status = ?, decision_note = ?, decided_by = ?, decided_at = ?, updated_at = ? "
                + "WHERE id = ? AND status = 'OPEN'", outcome.name(), note, staff, Sql.ts(now), Sql.ts(now), id) == 1;
    }

    Map<String, Object> reportCounts(ReportTarget type, UUID target) {
        return jdbc.queryForMap("SELECT count(*) FILTER (WHERE status = 'OPEN') AS open, count(*) FILTER (WHERE status = 'UPHELD') AS upheld, "
                + "count(*) FILTER (WHERE status = 'DISMISSED') AS dismissed FROM adv_trust.report WHERE target_type = ? AND target_id = ?", type.name(), target);
    }

    // Dispute policy

    Optional<DisputePolicyView> policy() {
        return jdbc.query("SELECT version, window_hours, created_at FROM adv_trust.dispute_policy ORDER BY version DESC LIMIT 1",
                (rs, i) -> new DisputePolicyView(rs.getLong("version"), rs.getInt("window_hours"), Sql.instant(rs, "created_at"))).stream().findFirst();
    }

    /** Every change is a new version; two at once collide on the key and one is refused. */
    long insertPolicy(int windowHours, UUID actor, Instant now) {
        return jdbc.queryForObject("INSERT INTO adv_trust.dispute_policy (version, window_hours, created_by, created_at) "
                + "SELECT coalesce(max(version), 0) + 1, ?, ?, ? FROM adv_trust.dispute_policy RETURNING version", Long.class, windowHours, actor, Sql.ts(now));
    }

    // Disputes

    void insertDispute(Dispute d, long policyVersion, Instant now) {
        jdbc.update("INSERT INTO adv_trust.dispute (id, order_id, customer_id, kitchen_id, category, description, claimed_paise, order_value_paise, "
                        + "refundable_paise, status, policy_version, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,'OPEN',?,1,?,?)",
                d.id(), d.orderId(), d.customerId(), d.kitchenId(), d.category().name(), d.description(), d.claimedPaise(), d.orderValuePaise(),
                d.refundablePaise(), policyVersion, Sql.ts(now), Sql.ts(now));
    }

    int disputesOfOrder(UUID orderId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM adv_trust.dispute WHERE order_id = ?", Integer.class, orderId);
        return count == null ? 0 : count;
    }

    Optional<Dispute> dispute(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + DISPUTE + " FROM adv_trust.dispute WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""), TrustRepository::dispute, id)
                .stream().findFirst();
    }

    List<Dispute> disputesOf(UUID customer, int limit) {
        return jdbc.query("SELECT " + DISPUTE + " FROM adv_trust.dispute WHERE customer_id = ? ORDER BY created_at DESC, id LIMIT ?",
                TrustRepository::dispute, customer, limit);
    }

    /** Newest first, decided ones included, so the kitchen sees outcomes too. */
    List<Dispute> disputesOfKitchens(Collection<UUID> kitchens, int limit) {
        if (kitchens.isEmpty()) return List.of();
        return jdbc.query("SELECT " + DISPUTE + " FROM adv_trust.dispute WHERE kitchen_id = ANY(CAST(? AS uuid[])) ORDER BY created_at DESC, id LIMIT ?",
                TrustRepository::dispute, kitchens.stream().map(UUID::toString).toArray(String[]::new), limit);
    }

    List<Dispute> disputeQueue(DisputeStatus status, int limit) {
        return jdbc.query("SELECT " + DISPUTE + " FROM adv_trust.dispute WHERE status = ? ORDER BY created_at, id LIMIT ?", TrustRepository::dispute,
                status.name(), limit);
    }

    /** True when the dispute was open and the statement is saved (a later statement replaces the earlier one). */
    boolean chefStatement(UUID id, String statement, UUID chef, Instant now) {
        return jdbc.update("UPDATE adv_trust.dispute SET chef_statement = ?, chef_id = ?, chef_responded_at = ?, version = version + 1, updated_at = ? "
                + "WHERE id = ? AND status = 'OPEN'", statement, chef, Sql.ts(now), Sql.ts(now), id) == 1;
    }

    void decideDispute(UUID id, DisputeStatus outcome, Long refundPaise, String note, UUID staff, Instant now) {
        jdbc.update("UPDATE adv_trust.dispute SET status = ?, refund_paise = ?, decision_note = ?, decided_by = ?, decided_at = ?, version = version + 1, "
                + "updated_at = ? WHERE id = ?", outcome.name(), refundPaise, note, staff, Sql.ts(now), Sql.ts(now), id);
    }

    boolean withdrawDispute(UUID id, UUID customer, Instant now) {
        return jdbc.update("UPDATE adv_trust.dispute SET status = 'WITHDRAWN', version = version + 1, updated_at = ? "
                + "WHERE id = ? AND customer_id = ? AND status = 'OPEN'", Sql.ts(now), id, customer) == 1;
    }

    /** column: customer_id (disputes a person opened) or kitchen_id (disputes about a kitchen's orders). */
    Map<String, Object> disputeCounts(String column, UUID subject) {
        return jdbc.queryForMap("SELECT count(*) FILTER (WHERE status = 'OPEN') AS open, count(*) FILTER (WHERE status = 'RESOLVED') AS resolved, "
                + "count(*) FILTER (WHERE status = 'REJECTED') AS rejected, coalesce(sum(refund_paise), 0) AS refunds FROM adv_trust.dispute WHERE "
                + column + " = ?", subject);
    }

    List<Dispute> disputesWithStatementsBy(UUID chef) {
        return jdbc.query("SELECT " + DISPUTE + " FROM adv_trust.dispute WHERE chef_id = ? ORDER BY created_at DESC, id", TrustRepository::dispute, chef);
    }

    // Risk flags

    void insertFlag(RiskFlagView f) {
        jdbc.update("INSERT INTO adv_trust.risk_flag (id, subject_type, subject_id, severity, reason, raised_by, raised_at) VALUES (?,?,?,?,?,?,?)",
                f.id(), f.subjectType().name(), f.subjectId(), f.severity().name(), f.reason(), f.raisedBy(), Sql.ts(f.raisedAt()));
    }

    Optional<RiskFlagView> flag(UUID id) {
        return jdbc.query("SELECT " + FLAG + " FROM adv_trust.risk_flag WHERE id = ?", TrustRepository::flag, id).stream().findFirst();
    }

    List<RiskFlagView> flagsOf(RiskSubject type, UUID subject, boolean openOnly) {
        return jdbc.query("SELECT " + FLAG + " FROM adv_trust.risk_flag WHERE subject_type = ? AND subject_id = ?" + (openOnly ? " AND cleared_at IS NULL" : "")
                + " ORDER BY raised_at DESC, id", TrustRepository::flag, type.name(), subject);
    }

    boolean clearFlag(UUID id, UUID staff, String note, Instant now) {
        return jdbc.update("UPDATE adv_trust.risk_flag SET cleared_by = ?, cleared_at = ?, clear_note = ? WHERE id = ? AND cleared_at IS NULL",
                staff, Sql.ts(now), note, id) == 1;
    }

    // Personal data

    /**
     * Dismissed reports are deleted; open and upheld ones stay as safety signals without the person and without the order they named.
     * Disputes stay as order records without the person and without their description (an open one is withdrawn), so the per-order
     * caps keep counting. A chef is unlinked from their statements. Trust records about a person (reports naming them, risk flags)
     * are not theirs to erase here.
     */
    int erase(UUID person, UUID erased, Instant now) {
        return jdbc.update("DELETE FROM adv_trust.report WHERE reporter_id = ? AND status = 'DISMISSED'", person)
                + jdbc.update("UPDATE adv_trust.report SET reporter_id = ?, order_id = NULL, updated_at = ? WHERE reporter_id = ?", erased, Sql.ts(now), person)
                + jdbc.update("UPDATE adv_trust.dispute SET customer_id = ?, description = NULL, "
                        + "status = CASE WHEN status = 'OPEN' THEN 'WITHDRAWN' ELSE status END, version = version + 1, updated_at = ? WHERE customer_id = ?",
                erased, Sql.ts(now), person)
                + jdbc.update("UPDATE adv_trust.dispute SET chef_id = ?, updated_at = ? WHERE chef_id = ?", erased, Sql.ts(now), person);
    }

    private static StaffTrustReport report(ResultSet rs, int i) throws SQLException {
        return new StaffTrustReport(rs.getObject("id", UUID.class), rs.getObject("reporter_id", UUID.class), ReportTarget.valueOf(rs.getString("target_type")),
                rs.getObject("target_id", UUID.class), ReportReason.valueOf(rs.getString("reason")), rs.getString("details"),
                rs.getObject("order_id", UUID.class), ReportStatus.valueOf(rs.getString("status")), rs.getString("decision_note"),
                rs.getObject("decided_by", UUID.class), Sql.instant(rs, "decided_at"), Sql.instant(rs, "created_at"));
    }

    private static Dispute dispute(ResultSet rs, int i) throws SQLException {
        return new Dispute(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class), rs.getObject("customer_id", UUID.class),
                rs.getObject("kitchen_id", UUID.class), DisputeCategory.valueOf(rs.getString("category")), rs.getString("description"),
                rs.getObject("claimed_paise", Long.class), rs.getLong("order_value_paise"), rs.getLong("refundable_paise"), rs.getString("chef_statement"), rs.getObject("chef_id", UUID.class),
                Sql.instant(rs, "chef_responded_at"), DisputeStatus.valueOf(rs.getString("status")), rs.getObject("refund_paise", Long.class),
                rs.getString("decision_note"), rs.getObject("decided_by", UUID.class), Sql.instant(rs, "decided_at"), rs.getLong("version"),
                Sql.instant(rs, "created_at"));
    }

    private static RiskFlagView flag(ResultSet rs, int i) throws SQLException {
        return new RiskFlagView(rs.getObject("id", UUID.class), RiskSubject.valueOf(rs.getString("subject_type")), rs.getObject("subject_id", UUID.class),
                RiskSeverity.valueOf(rs.getString("severity")), rs.getString("reason"), rs.getObject("cleared_at") == null,
                rs.getObject("raised_by", UUID.class), Sql.instant(rs, "raised_at"), rs.getObject("cleared_by", UUID.class), Sql.instant(rs, "cleared_at"),
                rs.getString("clear_note"));
    }
}
