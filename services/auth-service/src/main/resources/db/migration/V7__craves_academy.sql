-- Additive, isolated learning data in the existing craves_auth_db; no production-order changes.
CREATE SCHEMA IF NOT EXISTS academy_schema;
CREATE TABLE academy_schema.learner (
 identity_id UUID PRIMARY KEY, personalized BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE academy_schema.progress (
 identity_id UUID NOT NULL REFERENCES academy_schema.learner(identity_id),
 course_id VARCHAR(80) NOT NULL, lesson_id VARCHAR(100) NOT NULL, content_version VARCHAR(64) NOT NULL,
 best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 100),
 attempts INTEGER NOT NULL DEFAULT 0, mastery DOUBLE PRECISION NOT NULL DEFAULT 0.25 CHECK (mastery BETWEEN 0 AND 1),
 completed_at TIMESTAMPTZ, last_attempt_at TIMESTAMPTZ,
 PRIMARY KEY(identity_id, course_id, lesson_id, content_version)
);
CREATE TABLE academy_schema.attempt (
 identity_id UUID NOT NULL REFERENCES academy_schema.learner(identity_id), request_id UUID NOT NULL,
 course_id VARCHAR(80) NOT NULL, lesson_id VARCHAR(100) NOT NULL, content_version VARCHAR(64) NOT NULL,
 request_hash VARCHAR(64) NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(identity_id, request_id)
);
CREATE INDEX academy_attempt_time ON academy_schema.attempt(identity_id, created_at DESC);
CREATE TABLE academy_schema.xp_ledger (
 identity_id UUID NOT NULL REFERENCES academy_schema.learner(identity_id), reward_key VARCHAR(250) NOT NULL,
 xp INTEGER NOT NULL CHECK(xp > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(identity_id, reward_key)
);
CREATE TABLE academy_schema.activity (
 identity_id UUID NOT NULL REFERENCES academy_schema.learner(identity_id), request_id UUID NOT NULL,
 course_id VARCHAR(80) NOT NULL, lesson_id VARCHAR(100) NOT NULL,
 kind VARCHAR(30) NOT NULL CHECK(kind IN ('LESSON_OPEN','NARRATION_PLAY','ACTIVE_HEARTBEAT')),
 active_seconds INTEGER NOT NULL DEFAULT 0 CHECK(active_seconds BETWEEN 0 AND 30),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(identity_id, request_id)
);
CREATE INDEX academy_activity_time ON academy_schema.activity(identity_id, created_at DESC);
CREATE INDEX academy_activity_retention ON academy_schema.activity(created_at);
CREATE TABLE academy_schema.roadmap (
 id UUID PRIMARY KEY, title VARCHAR(160) NOT NULL, service VARCHAR(80) NOT NULL,
 details TEXT NOT NULL, status VARCHAR(20) NOT NULL CHECK(status IN ('PROPOSED','APPROVED','IN_PROGRESS','SHIPPED')),
 revision INTEGER NOT NULL DEFAULT 1, updated_by UUID NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE academy_schema.audit (
 id BIGSERIAL PRIMARY KEY, actor_id UUID NOT NULL, action VARCHAR(50) NOT NULL,
 target_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
