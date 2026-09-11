-- ONLINE_INDEX_BUILD_DEFERRED
--
-- V117 intentionally remains a fast, startup-safe Flyway marker. The first
-- production deployment attempted to create the dashboard read indexes with
-- CREATE INDEX CONCURRENTLY during Integration Service startup. PostgreSQL can
-- wait for older transactions while building a concurrent index, which kept
-- the new Container App revision unready until Azure's activation window
-- expired.
--
-- The dashboard queries are bounded and work correctly with the existing
-- schema. Optional online indexes must be installed later by a separately
-- monitored database-maintenance job, not by application startup.

SELECT 1;
