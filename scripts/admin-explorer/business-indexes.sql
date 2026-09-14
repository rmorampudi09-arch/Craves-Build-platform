-- Run with psql -v expected_database=<reviewed_business_database>. Not inside a transaction/Flyway.
\set ON_ERROR_STOP on
SELECT current_database() = :'expected_database' AS correct_database \gset
\if :correct_database
\else
  \echo 'Wrong database; no indexes created'
  \quit 3
\endif
SET lock_timeout = '5s';
SET statement_timeout = '15min';
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_explorer_chef_created_id ON chef_application(created_at DESC,id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_explorer_chef_status_created_id ON chef_application(status,created_at DESC,id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_explorer_order_created_id ON order_schema.customer_order(created_at DESC,id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_explorer_order_status_created_id ON order_schema.customer_order(status,created_at DESC,id DESC);
SELECT indexrelid::regclass,indisvalid,pg_get_indexdef(indexrelid) FROM pg_index WHERE indexrelid::regclass::text LIKE '%ix_explorer_%';
