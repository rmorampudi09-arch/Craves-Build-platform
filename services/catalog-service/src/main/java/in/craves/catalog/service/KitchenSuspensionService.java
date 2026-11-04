package in.craves.catalog.service;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.finance.CatalogFinanceEligibility;
import in.craves.catalog.security.CravesPrincipal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Handbook 008: staff suspend a kitchen and lift it again. Public reads and checkout already require
 * kitchen status ACTIVE, so a suspended kitchen leaves discovery and new orders at once; placed orders carry on.
 */
@Service
public class KitchenSuspensionService {
    static final Set<String> WRITERS = Set.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN");
    static final Set<String> READERS = Set.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN");

    public record Suspension(UUID kitchenId, String status, boolean suspended, String priorStatus, String reason,
                             UUID suspendedBy, Instant suspendedAt) {}

    private final JdbcTemplate jdbc;
    private final CatalogFinanceEligibility finance;

    public KitchenSuspensionService(JdbcTemplate jdbc, CatalogFinanceEligibility finance) {
        this.jdbc = jdbc;
        this.finance = finance;
    }

    public Suspension get(CravesPrincipal principal, UUID kitchenId) {
        require(principal, READERS);
        return read(kitchenId);
    }

    @Transactional
    public Suspension suspend(CravesPrincipal principal, UUID kitchenId, String reason) {
        require(principal, WRITERS);
        String cleaned = reason(reason);
        Map<String, Object> kitchen = lockKitchen(principal, kitchenId);
        if (kitchen.get("prior_status") != null)
            throw ApiException.conflict("KITCHEN_ALREADY_SUSPENDED", "This kitchen is already suspended.");
        jdbc.update("INSERT INTO catalog_schema.kitchen_suspension_hold(kitchen_id, prior_status, reason, suspended_by) VALUES (?,?,?,?)",
            kitchenId, kitchen.get("status"), cleaned, principal.identityId());
        jdbc.update("UPDATE catalog_schema.kitchen_profile SET status = 'SUSPENDED', updated_at = now() WHERE id = ?", kitchenId);
        audit(kitchenId, principal.identityId(), "SUSPEND", cleaned, "SUSPENDED");
        return read(kitchenId);
    }

    @Transactional
    public Suspension reinstate(CravesPrincipal principal, UUID kitchenId, String reason) {
        require(principal, WRITERS);
        String cleaned = reason(reason);
        Map<String, Object> kitchen = lockKitchen(principal, kitchenId);
        String prior = (String) kitchen.get("prior_status");
        if (prior == null) throw ApiException.conflict("KITCHEN_NOT_SUSPENDED", "This kitchen is not suspended.");
        String current = (String) kitchen.get("status");
        // Only undo our own SUSPENDED; if something else changed the status since (account erasure closes a kitchen), keep it.
        String after = "SUSPENDED".equals(current) ? prior : current;
        if ("ACTIVE".equals(after)) finance.requireChef((UUID) kitchen.get("identity_id"));
        jdbc.update("DELETE FROM catalog_schema.kitchen_suspension_hold WHERE kitchen_id = ?", kitchenId);
        jdbc.update("UPDATE catalog_schema.kitchen_profile SET status = ?, updated_at = now() WHERE id = ?", after, kitchenId);
        audit(kitchenId, principal.identityId(), "REINSTATE", cleaned, after);
        return read(kitchenId);
    }

    private Map<String, Object> lockKitchen(CravesPrincipal principal, UUID kitchenId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
            SELECT k.identity_id, k.status, h.prior_status FROM catalog_schema.kitchen_profile k
              LEFT JOIN catalog_schema.kitchen_suspension_hold h ON h.kitchen_id = k.id
             WHERE k.id = ? FOR UPDATE OF k""", kitchenId);
        if (rows.isEmpty()) throw ApiException.notFound("KITCHEN_NOT_FOUND", "Kitchen was not found.");
        if (principal.identityId().equals(rows.get(0).get("identity_id")))
            throw ApiException.forbidden("KITCHEN_SUSPENSION_OWN_KITCHEN", "Staff cannot suspend or reinstate their own kitchen.");
        return rows.get(0);
    }

    private Suspension read(UUID kitchenId) {
        return jdbc.query("""
            SELECT k.id, k.status, h.prior_status, h.reason, h.suspended_by, h.suspended_at FROM catalog_schema.kitchen_profile k
              LEFT JOIN catalog_schema.kitchen_suspension_hold h ON h.kitchen_id = k.id WHERE k.id = ?""",
            (rs, n) -> new Suspension(rs.getObject("id", UUID.class), rs.getString("status"), rs.getString("prior_status") != null,
                rs.getString("prior_status"), rs.getString("reason"), rs.getObject("suspended_by", UUID.class),
                rs.getTimestamp("suspended_at") == null ? null : rs.getTimestamp("suspended_at").toInstant()), kitchenId)
            .stream().findFirst().orElseThrow(() -> ApiException.notFound("KITCHEN_NOT_FOUND", "Kitchen was not found."));
    }

    private void audit(UUID kitchenId, UUID actor, String action, String reason, String after) {
        jdbc.update("INSERT INTO catalog_schema.kitchen_suspension_audit(kitchen_id, actor_id, action, reason, status_after) VALUES (?,?,?,?,?)",
            kitchenId, actor, action, reason, after);
    }

    static String reason(String reason) {
        String value = reason == null ? "" : reason.strip();
        if (value.length() < 3 || value.length() > 280 || value.chars().anyMatch(Character::isISOControl))
            throw ApiException.badRequest("KITCHEN_SUSPENSION_REASON_INVALID", "Enter a reason of 3 to 280 characters.");
        return value;
    }

    static void require(CravesPrincipal principal, Set<String> roles) {
        if (principal == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (roles.stream().noneMatch(principal::hasRole)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
}
