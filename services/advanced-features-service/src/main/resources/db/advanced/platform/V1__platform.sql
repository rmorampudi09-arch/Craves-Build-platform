-- Shared platform tables: idempotency records and the audit trail. Modules own everything else.
CREATE TABLE adv_platform.idempotency_record (
    scope        varchar(64)  NOT NULL,
    actor_id     uuid         NOT NULL,
    idem_key     varchar(128) NOT NULL,
    request_hash char(64)     NOT NULL,
    state        varchar(16)  NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
    response     jsonb,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    completed_at timestamptz,
    PRIMARY KEY (scope, actor_id, idem_key)
);
CREATE INDEX idempotency_record_created_idx ON adv_platform.idempotency_record (created_at);

CREATE TABLE adv_platform.audit_event (
    id             bigserial    PRIMARY KEY,
    module         varchar(40)  NOT NULL,
    actor_id       uuid,
    action         varchar(64)  NOT NULL,
    entity_type    varchar(40)  NOT NULL,
    entity_id      varchar(80)  NOT NULL,
    details        jsonb        NOT NULL DEFAULT '{}'::jsonb,
    correlation_id varchar(64),
    created_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX audit_event_entity_idx ON adv_platform.audit_event (module, entity_type, entity_id, created_at DESC);
CREATE INDEX audit_event_actor_idx ON adv_platform.audit_event (actor_id, created_at DESC);
