package in.craves.adminexplorer;
/** Disposable loopback PostgreSQL fixtures. These are not production data or provider credentials. */
final class ExplorerFixture {
 static final String TABLE="auth_identity", STATUS="ACTIVE", FACET="CHEF";
 static final int FACET_COUNT=1;
 static final String FUNCTION="public.reject_admin_explorer_audit_mutation()";
 static final String MIGRATION="/db/migration/V9__admin_explorer_audit.sql";
 static final String ADMISSION_MIGRATION="/db/migration/V9_1__admin_explorer_admission.sql";
 static final String DDL="""
CREATE TABLE auth_identity(id UUID PRIMARY KEY,display_name TEXT,status TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,phone_number TEXT,email TEXT);
 CREATE TABLE auth_identity_role(identity_id UUID,role_code TEXT,PRIMARY KEY(identity_id,role_code));
 INSERT INTO auth_identity SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Test User '||i,CASE WHEN i%2=0 THEN 'ACTIVE' ELSE 'SUSPENDED' END, '2026-09-10 18:00:00+00'::timestamptz+(i/3)*interval '1 hour','2026-09-14 00:00:00+00','+91999999'||lpad(i::text,4,'0'),'test'||i||'@example.test' FROM generate_series(1,65)i;
 INSERT INTO auth_identity_role SELECT id,'CUSTOMER' FROM auth_identity;
 INSERT INTO auth_identity_role SELECT id,'CHEF' FROM auth_identity ORDER BY id LIMIT 1;
 """;
}
