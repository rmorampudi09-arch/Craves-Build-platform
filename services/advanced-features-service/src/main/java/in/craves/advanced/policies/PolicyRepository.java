package in.craves.advanced.policies;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.policies.PolicyDtos.PolicyStatus;
import in.craves.advanced.policies.PolicyDtos.PolicyType;
import in.craves.advanced.policies.PolicyDtos.PolicyVersionView;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class PolicyRepository {
    private static final String COLUMNS = "id, policy_type, version, document::text AS document, note, status, created_by, created_at, activated_by, activated_at";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    PolicyRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Serialises version numbering and activation per type. */
    void lockType(PolicyType type) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, "adv_policies:" + type.name());
    }

    List<PolicyVersionView> versions(PolicyType type) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_policies.policy_version WHERE policy_type = ? ORDER BY version DESC LIMIT 200", this::view, type.name());
    }

    Optional<PolicyVersionView> version(PolicyType type, int version) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_policies.policy_version WHERE policy_type = ? AND version = ?", this::view, type.name(), version)
                .stream().findFirst();
    }

    Optional<PolicyVersionView> active(PolicyType type) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_policies.policy_version WHERE policy_type = ? AND status = 'ACTIVE'", this::view, type.name())
                .stream().findFirst();
    }

    int insertDraft(PolicyType type, String document, String note, UUID staff, Instant now) {
        Integer next = jdbc.queryForObject("SELECT coalesce(max(version), 0) + 1 FROM adv_policies.policy_version WHERE policy_type = ?", Integer.class, type.name());
        jdbc.update("INSERT INTO adv_policies.policy_version (id, policy_type, version, document, note, status, created_by, created_at) "
                + "VALUES (?,?,?,CAST(? AS jsonb),?,'DRAFT',?,?)", UUID.randomUUID(), type.name(), next, document, note, staff, Sql.ts(now));
        return next;
    }

    void activate(PolicyType type, int version, UUID staff, Instant now) {
        jdbc.update("UPDATE adv_policies.policy_version SET status = 'RETIRED' WHERE policy_type = ? AND status = 'ACTIVE'", type.name());
        jdbc.update("UPDATE adv_policies.policy_version SET status = 'ACTIVE', activated_by = ?, activated_at = ? WHERE policy_type = ? AND version = ?",
                staff, Sql.ts(now), type.name(), version);
    }

    private PolicyVersionView view(ResultSet rs, int i) throws SQLException {
        JsonNode document;
        try {
            document = json.readTree(rs.getString("document"));
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
            throw new SQLException("unreadable policy document", ex);
        }
        return new PolicyVersionView(rs.getObject("id", UUID.class), PolicyType.valueOf(rs.getString("policy_type")).slug, rs.getInt("version"), document,
                rs.getString("note"), PolicyStatus.valueOf(rs.getString("status")), rs.getObject("created_by", UUID.class), Sql.instant(rs, "created_at"),
                rs.getObject("activated_by", UUID.class), Sql.instant(rs, "activated_at"));
    }
}
