package in.craves.adminexplorer;
/** Disposable loopback PostgreSQL fixtures. These are not production data or provider credentials. */
final class ExplorerFixture {
 static final String TABLE="order_schema.customer_order", STATUS="DELIVERED", FACET="ON_DEMAND";
 static final int FACET_COUNT=32;
 static final String FUNCTION="order_schema.reject_admin_explorer_audit_mutation()";
 static final String MIGRATION="/db/migration/V26__admin_explorer_audit.sql";
 static final String ADMISSION_MIGRATION="/db/migration/V27__admin_explorer_admission.sql";
 static final String DDL="""
CREATE SCHEMA IF NOT EXISTS order_schema;
 CREATE TABLE order_schema.customer_order(id UUID PRIMARY KEY,customer_identity_id UUID,chef_identity_id UUID,kitchen_id UUID,checkout_id UUID,kitchen_name_snapshot TEXT,status TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,order_source TEXT,grand_total NUMERIC(10,2),currency TEXT);
 INSERT INTO order_schema.customer_order SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','Test Kitchen '||i,CASE WHEN i%2=0 THEN 'DELIVERED' ELSE 'PREPARING' END,'2026-09-10 18:00:00+00'::timestamptz+(i/3)*interval '1 hour','2026-09-14 00:00:00+00',CASE WHEN i%2=0 THEN 'ON_DEMAND' ELSE 'SUBSCRIPTION' END,69.01,'INR' FROM generate_series(1,65)i;
 """;
}
