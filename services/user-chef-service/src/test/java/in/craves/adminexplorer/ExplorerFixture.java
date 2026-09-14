package in.craves.adminexplorer;
/** Disposable loopback PostgreSQL fixtures. These are not production data or provider credentials. */
final class ExplorerFixture {
 static final String TABLE="chef_application", STATUS="APPROVED", FACET="Hyderabad";
 static final int FACET_COUNT=65;
 static final String FUNCTION="public.reject_admin_explorer_audit_mutation()";
 static final String MIGRATION="/db/migration/V11__admin_explorer_audit.sql";
 static final String ADMISSION_MIGRATION="/db/migration/V13__admin_explorer_admission.sql";
 static final String DDL="""
CREATE TABLE chef_application(id UUID PRIMARY KEY,identity_id UUID,first_name TEXT,last_name TEXT,status TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,phone_number TEXT,email TEXT,city TEXT);
 INSERT INTO chef_application SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Test Chef',i::text,CASE WHEN i%2=0 THEN 'APPROVED' ELSE 'PENDING' END, '2026-09-10 18:00:00+00'::timestamptz+(i/3)*interval '1 hour','2026-09-14 00:00:00+00','+91999999'||lpad(i::text,4,'0'),'test'||i||'@example.test','Hyderabad' FROM generate_series(1,65)i;
 """;
}
