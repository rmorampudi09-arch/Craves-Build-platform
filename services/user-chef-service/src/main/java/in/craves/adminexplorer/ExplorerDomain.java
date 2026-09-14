package in.craves.adminexplorer;
import java.util.List;
/** Compile-time service binding. No request may select a database, table or SQL expression. */
final class ExplorerDomain {
    static final String DATASET="chefs";
    static final String AUDIT="public.admin_explorer_audit";
    static final String SOURCE="""
SELECT a.id, a.identity_id, trim(a.first_name || ' ' || a.last_name) AS label,
 a.status, a.created_at, a.updated_at, a.phone_number AS phone, a.email, a.city,
 ''::text AS roles, NULL::text AS order_source, NULL::text AS amount, NULL::text AS currency,
 NULL::uuid AS customer_id, NULL::uuid AS chef_id, NULL::uuid AS kitchen_id, NULL::uuid AS checkout_id
 FROM chef_application a
        """;
    static final String SEARCH="(lower(v.label) LIKE ? ESCAPE '!' OR lower(COALESCE(v.email,'')) LIKE ? ESCAPE '!' OR lower(COALESCE(v.phone,'')) LIKE ? ESCAPE '!' OR v.id::text = ?)";
    static final String FACET="lower(v.city)=lower(?)";
    static List<Object> searchArgs(String s) { return List.of(ExplorerQuery.like(s), ExplorerQuery.like(s), ExplorerQuery.like(s), s); }
    private ExplorerDomain() {}
}
