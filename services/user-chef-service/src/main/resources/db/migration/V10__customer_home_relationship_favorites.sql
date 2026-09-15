CREATE TABLE customer_favorite_chef (
    identity_id        UUID NOT NULL,
    chef_identity_id   UUID NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (identity_id, chef_identity_id),
    CONSTRAINT ck_customer_favorite_chef_not_self CHECK (identity_id <> chef_identity_id)
);

CREATE INDEX ix_customer_favorite_chef_identity_created
    ON customer_favorite_chef (identity_id, created_at DESC, chef_identity_id);

CREATE TABLE customer_favorite_kitchen (
    identity_id        UUID NOT NULL,
    kitchen_id         UUID NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (identity_id, kitchen_id)
);

CREATE INDEX ix_customer_favorite_kitchen_identity_created
    ON customer_favorite_kitchen (identity_id, created_at DESC, kitchen_id);

CREATE TABLE customer_favorite_watch (
    identity_id                 UUID NOT NULL,
    entity_type                 VARCHAR(20) NOT NULL,
    entity_id                   UUID NOT NULL,
    channel                     VARCHAR(20) NOT NULL,
    enabled                     BOOLEAN NOT NULL DEFAULT true,
    last_notified_at            TIMESTAMPTZ,
    last_notification_window_key VARCHAR(160),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (identity_id, entity_type, entity_id, channel),
    CONSTRAINT ck_customer_favorite_watch_entity_type
        CHECK (entity_type IN ('MENU_ITEM', 'CHEF', 'KITCHEN')),
    CONSTRAINT ck_customer_favorite_watch_channel
        CHECK (channel IN ('IN_APP', 'PUSH'))
);

CREATE INDEX ix_customer_favorite_watch_identity_type_created
    ON customer_favorite_watch (identity_id, entity_type, created_at DESC, entity_id, channel);

COMMENT ON TABLE customer_favorite_chef IS
    'Customer-owned favorite home-chef relationship. Chef lifecycle changes do not delete relationship history.';
COMMENT ON TABLE customer_favorite_kitchen IS
    'Customer-owned favorite kitchen relationship. Catalog remains authoritative for kitchen lifecycle and enrichment.';
COMMENT ON TABLE customer_favorite_watch IS
    'Explicit notify-me preference. A heart/favorite does not implicitly enable interruption channels.';
