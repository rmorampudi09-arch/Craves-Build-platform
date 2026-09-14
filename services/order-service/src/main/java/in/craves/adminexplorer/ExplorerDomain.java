package in.craves.adminexplorer;
import java.util.List;
/** Compile-time service binding. No request may select a database, table or SQL expression. */
final class ExplorerDomain {
    static final String DATASET="orders";
    static final String AUDIT="order_schema.admin_explorer_audit";
    static final String SOURCE="""
SELECT a.id, NULL::uuid AS identity_id, COALESCE(a.kitchen_name_snapshot,'Kitchen name unavailable') AS label,
 a.status, a.created_at, a.updated_at, NULL::text AS phone, NULL::text AS email, NULL::text AS city,
 ''::text AS roles, a.order_source, a.grand_total::text AS amount, a.currency,
 a.customer_identity_id AS customer_id, a.chef_identity_id AS chef_id, a.kitchen_id, a.checkout_id
 FROM order_schema.customer_order a
        """;
    static final String SEARCH="(lower(v.label) LIKE ? ESCAPE '!' OR v.id::text = ? OR v.customer_id::text = ? OR v.chef_id::text = ? OR v.checkout_id::text = ? OR v.kitchen_id::text = ?)";
    static final String FACET="v.order_source=?";
    static List<Object> searchArgs(String s) { return List.of(ExplorerQuery.like(s), s, s, s, s, s); }
    private ExplorerDomain() {}
}
