CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_schedule_config (
    kitchen_id          UUID PRIMARY KEY REFERENCES catalog_schema.kitchen_profile(id) ON DELETE CASCADE,
    timezone_id         VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    accepting_orders    BOOLEAN NOT NULL DEFAULT true,
    paused_until        TIMESTAMPTZ,
    pause_reason        VARCHAR(160),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_weekly_service_window (
    id                  UUID PRIMARY KEY,
    kitchen_id          UUID NOT NULL REFERENCES catalog_schema.kitchen_profile(id) ON DELETE CASCADE,
    day_of_week         SMALLINT NOT NULL,
    opens_at            TIME NOT NULL,
    closes_at           TIME NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_kitchen_weekly_day CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT chk_kitchen_weekly_window CHECK (opens_at < closes_at),
    CONSTRAINT uk_kitchen_weekly_window UNIQUE (kitchen_id, day_of_week, opens_at, closes_at)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_weekly_window_lookup
    ON catalog_schema.kitchen_weekly_service_window (kitchen_id, day_of_week, opens_at, closes_at);

CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_schedule_date_override (
    kitchen_id          UUID NOT NULL REFERENCES catalog_schema.kitchen_profile(id) ON DELETE CASCADE,
    service_date        DATE NOT NULL,
    closed              BOOLEAN NOT NULL,
    reason              VARCHAR(160),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kitchen_id, service_date)
);

CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_schedule_override_window (
    id                  UUID PRIMARY KEY,
    kitchen_id          UUID NOT NULL,
    service_date        DATE NOT NULL,
    opens_at            TIME NOT NULL,
    closes_at           TIME NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_kitchen_schedule_override_window
        FOREIGN KEY (kitchen_id, service_date)
        REFERENCES catalog_schema.kitchen_schedule_date_override(kitchen_id, service_date)
        ON DELETE CASCADE,
    CONSTRAINT chk_kitchen_override_window CHECK (opens_at < closes_at),
    CONSTRAINT uk_kitchen_override_window UNIQUE (kitchen_id, service_date, opens_at, closes_at)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_schedule_override_lookup
    ON catalog_schema.kitchen_schedule_date_override (kitchen_id, service_date);

CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_schedule_audit (
    id                  UUID PRIMARY KEY,
    kitchen_id          UUID NOT NULL REFERENCES catalog_schema.kitchen_profile(id) ON DELETE CASCADE,
    actor_identity_id   UUID NOT NULL,
    action              VARCHAR(64) NOT NULL,
    old_snapshot        JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_snapshot        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_schedule_audit_kitchen_time
    ON catalog_schema.kitchen_schedule_audit (kitchen_id, created_at DESC);

COMMENT ON TABLE catalog_schema.kitchen_weekly_service_window IS
    'Chef-configured local weekly service windows. Day-of-week follows ISO 1=Monday through 7=Sunday.';
COMMENT ON TABLE catalog_schema.kitchen_schedule_date_override IS
    'Date-specific closure or replacement-window override for a kitchen schedule.';
