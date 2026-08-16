-- Version kitchen pickup locations so existing orders retain their original pickup identity while
-- future orders can switch atomically to a newly verified chef location.

CREATE TABLE catalog_schema.kitchen_pickup_location (
    id                  UUID PRIMARY KEY,
    kitchen_id          UUID NOT NULL REFERENCES catalog_schema.kitchen_profile(id) ON DELETE CASCADE,
    version_number      INTEGER NOT NULL,
    status              VARCHAR(16) NOT NULL,
    kitchen_name        VARCHAR(180) NOT NULL,
    contact_phone       VARCHAR(40),
    contact_email       VARCHAR(320),
    address_line1       VARCHAR(255) NOT NULL,
    address_line2       VARCHAR(255),
    landmark            VARCHAR(180),
    area_name           VARCHAR(180),
    city                VARCHAR(120) NOT NULL,
    state               VARCHAR(120) NOT NULL,
    postal_code         VARCHAR(20),
    latitude            NUMERIC(10,7),
    longitude           NUMERIC(10,7),
    activated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_kitchen_pickup_location_version UNIQUE (kitchen_id, version_number),
    CONSTRAINT ck_kitchen_pickup_location_status CHECK (status IN ('ACTIVE', 'RETIRED')),
    CONSTRAINT ck_kitchen_pickup_location_lat CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_kitchen_pickup_location_lon CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT ck_kitchen_pickup_location_retired_time CHECK (
        (status = 'ACTIVE' AND retired_at IS NULL) OR
        (status = 'RETIRED' AND retired_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_kitchen_pickup_location_one_active
    ON catalog_schema.kitchen_pickup_location (kitchen_id)
    WHERE status = 'ACTIVE';

CREATE INDEX ix_kitchen_pickup_location_kitchen
    ON catalog_schema.kitchen_pickup_location (kitchen_id, version_number DESC);

ALTER TABLE catalog_schema.kitchen_profile
    ADD COLUMN current_pickup_location_id UUID;

-- Backward compatibility: V1 pickup location id intentionally equals the existing kitchen id.
-- Existing delivery events already use kitchen_id as pickupLocationReference, so no historical
-- orders or provider mappings need to be rewritten.
INSERT INTO catalog_schema.kitchen_pickup_location (
    id, kitchen_id, version_number, status, kitchen_name,
    contact_phone, contact_email, address_line1, address_line2, landmark,
    area_name, city, state, postal_code, latitude, longitude,
    activated_at, created_at, updated_at
)
SELECT
    id, id, 1, 'ACTIVE', COALESCE(NULLIF(BTRIM(display_name), ''), kitchen_name),
    phone_number, email, address_line1, address_line2, landmark,
    area_name, city, state, postal_code, latitude, longitude,
    created_at, created_at, updated_at
FROM catalog_schema.kitchen_profile;

UPDATE catalog_schema.kitchen_profile
SET current_pickup_location_id = id
WHERE current_pickup_location_id IS NULL;

ALTER TABLE catalog_schema.kitchen_profile
    ALTER COLUMN current_pickup_location_id SET NOT NULL,
    ADD CONSTRAINT fk_kitchen_profile_current_pickup_location
        FOREIGN KEY (current_pickup_location_id)
        REFERENCES catalog_schema.kitchen_pickup_location(id);

CREATE TABLE catalog_schema.pickup_location_provisioning_outbox (
    event_id             UUID PRIMARY KEY,
    pickup_location_id   UUID NOT NULL UNIQUE REFERENCES catalog_schema.kitchen_pickup_location(id) ON DELETE CASCADE,
    kitchen_id           UUID NOT NULL REFERENCES catalog_schema.kitchen_profile(id) ON DELETE CASCADE,
    status               VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt_count        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    lock_token           UUID,
    locked_at            TIMESTAMPTZ,
    last_error           VARCHAR(1000),
    delivered_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_pickup_provisioning_status CHECK (
        status IN ('PENDING', 'PROCESSING', 'FAILED', 'DELIVERED', 'DEAD_LETTER')
    )
);

CREATE INDEX ix_pickup_provisioning_due
    ON catalog_schema.pickup_location_provisioning_outbox (status, next_attempt_at, created_at);

-- Existing active kitchens are queued once. Provider-side provisioning remains disabled at runtime
-- until the explicit environment gate is enabled.
INSERT INTO catalog_schema.pickup_location_provisioning_outbox (
    event_id, pickup_location_id, kitchen_id, status, created_at, updated_at
)
SELECT gen_random_uuid(), current_pickup_location_id, id, 'PENDING', now(), now()
FROM catalog_schema.kitchen_profile
WHERE status = 'ACTIVE'
ON CONFLICT (pickup_location_id) DO NOTHING;

CREATE OR REPLACE FUNCTION catalog_schema.enqueue_pickup_location_provisioning(
    p_pickup_location_id UUID,
    p_kitchen_id UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO catalog_schema.pickup_location_provisioning_outbox (
        event_id, pickup_location_id, kitchen_id, status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), p_pickup_location_id, p_kitchen_id, 'PENDING', now(), now()
    ) ON CONFLICT (pickup_location_id) DO UPDATE SET
        status = CASE
            WHEN catalog_schema.pickup_location_provisioning_outbox.status = 'DELIVERED'
                THEN catalog_schema.pickup_location_provisioning_outbox.status
            ELSE 'PENDING'
        END,
        next_attempt_at = now(),
        lock_token = NULL,
        locked_at = NULL,
        last_error = NULL,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION catalog_schema.kitchen_pickup_location_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_location_id UUID;
    v_next_version INTEGER;
    v_provider_fields_changed BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Normally V1 was inserted by the migration backfill only for pre-existing rows. This path
        -- handles all new kitchens created after the migration.
        IF NOT EXISTS (
            SELECT 1 FROM catalog_schema.kitchen_pickup_location WHERE id = NEW.id
        ) THEN
            INSERT INTO catalog_schema.kitchen_pickup_location (
                id, kitchen_id, version_number, status, kitchen_name,
                contact_phone, contact_email, address_line1, address_line2, landmark,
                area_name, city, state, postal_code, latitude, longitude,
                activated_at, created_at, updated_at
            ) VALUES (
                NEW.id, NEW.id, 1, 'ACTIVE', COALESCE(NULLIF(BTRIM(NEW.display_name), ''), NEW.kitchen_name),
                NEW.phone_number, NEW.email, NEW.address_line1, NEW.address_line2, NEW.landmark,
                NEW.area_name, NEW.city, NEW.state, NEW.postal_code, NEW.latitude, NEW.longitude,
                now(), now(), now()
            );
        END IF;

        IF NEW.current_pickup_location_id IS DISTINCT FROM NEW.id THEN
            UPDATE catalog_schema.kitchen_profile
               SET current_pickup_location_id = NEW.id
             WHERE id = NEW.id;
        END IF;

        IF NEW.status = 'ACTIVE' THEN
            PERFORM catalog_schema.enqueue_pickup_location_provisioning(NEW.id, NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    v_provider_fields_changed :=
        OLD.kitchen_name IS DISTINCT FROM NEW.kitchen_name OR
        OLD.display_name IS DISTINCT FROM NEW.display_name OR
        OLD.phone_number IS DISTINCT FROM NEW.phone_number OR
        OLD.email IS DISTINCT FROM NEW.email OR
        OLD.address_line1 IS DISTINCT FROM NEW.address_line1 OR
        OLD.address_line2 IS DISTINCT FROM NEW.address_line2 OR
        OLD.landmark IS DISTINCT FROM NEW.landmark OR
        OLD.area_name IS DISTINCT FROM NEW.area_name OR
        OLD.city IS DISTINCT FROM NEW.city OR
        OLD.state IS DISTINCT FROM NEW.state OR
        OLD.postal_code IS DISTINCT FROM NEW.postal_code OR
        OLD.latitude IS DISTINCT FROM NEW.latitude OR
        OLD.longitude IS DISTINCT FROM NEW.longitude;

    IF v_provider_fields_changed THEN
        UPDATE catalog_schema.kitchen_pickup_location
           SET status = 'RETIRED', retired_at = now(), updated_at = now()
         WHERE id = OLD.current_pickup_location_id
           AND status = 'ACTIVE';

        SELECT COALESCE(MAX(version_number), 0) + 1
          INTO v_next_version
          FROM catalog_schema.kitchen_pickup_location
         WHERE kitchen_id = NEW.id;

        v_location_id := gen_random_uuid();

        INSERT INTO catalog_schema.kitchen_pickup_location (
            id, kitchen_id, version_number, status, kitchen_name,
            contact_phone, contact_email, address_line1, address_line2, landmark,
            area_name, city, state, postal_code, latitude, longitude,
            activated_at, created_at, updated_at
        ) VALUES (
            v_location_id, NEW.id, v_next_version, 'ACTIVE', COALESCE(NULLIF(BTRIM(NEW.display_name), ''), NEW.kitchen_name),
            NEW.phone_number, NEW.email, NEW.address_line1, NEW.address_line2, NEW.landmark,
            NEW.area_name, NEW.city, NEW.state, NEW.postal_code, NEW.latitude, NEW.longitude,
            now(), now(), now()
        );

        UPDATE catalog_schema.kitchen_profile
           SET current_pickup_location_id = v_location_id
         WHERE id = NEW.id;

        IF NEW.status = 'ACTIVE' THEN
            PERFORM catalog_schema.enqueue_pickup_location_provisioning(v_location_id, NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    -- A DRAFT/INACTIVE kitchen becoming ACTIVE should provision its already-current pickup location
    -- without inventing another location version.
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ACTIVE' THEN
        PERFORM catalog_schema.enqueue_pickup_location_provisioning(
            NEW.current_pickup_location_id,
            NEW.id
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kitchen_pickup_location_lifecycle
AFTER INSERT OR UPDATE ON catalog_schema.kitchen_profile
FOR EACH ROW
EXECUTE FUNCTION catalog_schema.kitchen_pickup_location_lifecycle();
