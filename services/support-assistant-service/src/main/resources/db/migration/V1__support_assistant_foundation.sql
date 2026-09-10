CREATE SCHEMA IF NOT EXISTS support_assistant_schema;

CREATE TABLE support_assistant_schema.knowledge_document (
    id UUID PRIMARY KEY,
    audience VARCHAR(20) NOT NULL,
    title VARCHAR(180) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_ref VARCHAR(300) NOT NULL,
    content TEXT NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(content, '')), 'B')
    ) STORED,
    CONSTRAINT ck_support_knowledge_audience CHECK (audience IN ('CUSTOMER', 'CHEF', 'BOTH')),
    CONSTRAINT ck_support_knowledge_source_type CHECK (
        source_type IN ('CURATED_HELP', 'OPENAPI_SUMMARY', 'FRONTEND_HELP_COPY', 'RUNBOOK_SUMMARY')
    ),
    CONSTRAINT ck_support_knowledge_content_hash CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX ux_support_knowledge_source_hash
    ON support_assistant_schema.knowledge_document (source_type, source_ref, content_sha256);

CREATE INDEX ix_support_knowledge_search
    ON support_assistant_schema.knowledge_document USING GIN (search_vector)
    WHERE active = TRUE;

CREATE INDEX ix_support_knowledge_audience_updated
    ON support_assistant_schema.knowledge_document (audience, active, updated_at DESC);

CREATE TABLE support_assistant_schema.conversation_audit (
    id UUID PRIMARY KEY,
    identity_id UUID NOT NULL,
    audience VARCHAR(20) NOT NULL,
    question_sha256 CHAR(64) NOT NULL,
    outcome VARCHAR(40) NOT NULL,
    ai_invoked BOOLEAN NOT NULL DEFAULT FALSE,
    context_types VARCHAR(120) NOT NULL DEFAULT '',
    correlation_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_support_audit_audience CHECK (audience IN ('CUSTOMER', 'CHEF')),
    CONSTRAINT ck_support_audit_question_hash CHECK (question_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX ix_support_audit_identity_created
    ON support_assistant_schema.conversation_audit (identity_id, created_at DESC);

CREATE INDEX ix_support_audit_outcome_created
    ON support_assistant_schema.conversation_audit (outcome, created_at DESC);

COMMENT ON TABLE support_assistant_schema.conversation_audit IS
    'Privacy-minimized assistant audit. Stores hashes and operational metadata only; never raw user prompts or model answers.';
