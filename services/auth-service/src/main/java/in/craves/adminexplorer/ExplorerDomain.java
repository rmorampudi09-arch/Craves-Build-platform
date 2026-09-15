package in.craves.adminexplorer;
import java.util.List;
/** Compile-time service binding. No request may select a database, table or SQL expression. */
final class ExplorerDomain {
    static final String DATASET="users";
    static final String AUDIT="public.admin_explorer_audit";
    static final String SOURCE="""
SELECT a.id, a.id AS identity_id, COALESCE(NULLIF(a.display_name,''),'Unnamed user') AS label,
 a.status, a.created_at, a.updated_at, a.phone_number AS phone, a.email,
 NULL::text AS city, COALESCE((SELECT string_agg(ir.role_code, ',' ORDER BY ir.role_code)
 FROM auth_identity_role ir WHERE ir.identity_id=a.id),'') AS roles,
 NULL::text AS order_source, NULL::text AS amount, NULL::text AS currency,
 NULL::uuid AS customer_id, NULL::uuid AS chef_id, NULL::uuid AS kitchen_id, NULL::uuid AS checkout_id
 FROM auth_identity a
        """;
    static final String SEARCH="(lower(v.label) LIKE ? ESCAPE '!' OR lower(COALESCE(v.email,'')) LIKE ? ESCAPE '!' OR lower(COALESCE(v.phone,'')) LIKE ? ESCAPE '!' OR v.id::text = ?)";
    static final String FACET="EXISTS (SELECT 1 FROM auth_identity_role f WHERE f.identity_id=v.id AND f.role_code=?)";
    static List<Object> searchArgs(String s) { return List.of(ExplorerQuery.like(s), ExplorerQuery.like(s), ExplorerQuery.like(s), s); }
    private ExplorerDomain() {}
}
