-- E30 experiments and product analytics. Assignment is computed from a per-experiment salt and the person id,
-- so nothing is stored about a person unless they turned on productAnalytics consent (M22) and sent an event.
CREATE TABLE adv_experiments.experiment (
    exp_key      varchar(40)   PRIMARY KEY CHECK (exp_key ~ '^[a-z][a-z0-9-]{1,39}$'),
    description  varchar(300)  NOT NULL,
    variants     jsonb         NOT NULL,
    salt         uuid          NOT NULL,
    status       varchar(8)    NOT NULL CHECK (status IN ('DRAFT', 'RUNNING', 'STOPPED')),
    version      bigint        NOT NULL,
    created_by   uuid          NOT NULL,
    updated_by   uuid          NOT NULL,
    created_at   timestamptz   NOT NULL,
    updated_at   timestamptz   NOT NULL,
    started_at   timestamptz,
    stopped_at   timestamptz
);

CREATE TABLE adv_experiments.event (
    id               uuid          PRIMARY KEY,
    person_id        uuid          NOT NULL,
    client_event_id  uuid          NOT NULL,
    name             varchar(60)   NOT NULL,
    exp_key          varchar(40)   REFERENCES adv_experiments.experiment (exp_key),
    variant          varchar(40),
    properties       jsonb         NOT NULL DEFAULT '{}',
    occurred_at      timestamptz   NOT NULL,
    received_at      timestamptz   NOT NULL,
    UNIQUE (person_id, client_event_id),
    CHECK ((exp_key IS NULL) = (variant IS NULL))
);
CREATE INDEX event_name_time_idx ON adv_experiments.event (name, occurred_at);
CREATE INDEX event_person_received_idx ON adv_experiments.event (person_id, received_at);
CREATE INDEX event_experiment_idx ON adv_experiments.event (exp_key, variant) WHERE exp_key IS NOT NULL;
