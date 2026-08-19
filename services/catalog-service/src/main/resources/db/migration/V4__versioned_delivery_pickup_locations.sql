-- Version chef pickup locations independently from the mutable kitchen profile.
--
-- Why this is additive instead of adding a NOT NULL current-pickup pointer to kitchen_profile:
-- a kitchen must still be creatable when Integration Service or a delivery provider is unavailable.
-- The active pickup snapshot is therefore derived from this table and provisioning is asynchronous.

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

CREATE INDEX ix_kitchen_pickup_location_history
    ON catalog_schema.kitchen_pickup_location (kitchen_id, version_number DESC);

-- Stable UUID derived only from the pickup identity that Order Service snapshots.
-- The same canonicalization is implemented in Order PickupLocationReference.
CREATE OR REPLACE FUNCTION catalog_schema.delivery_pickup_location_id(
    p_kitchen_id UUID,
    p_contact_phone TEXT,
    p_address_line1 TEXT,
    p_address_line2 TEXT,
    p_landmark TEXT,
    p_area_name TEXT,
    p_city TEXT,
    p_state TEXT,
    p_postal_code TEXT
) RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_hash TEXT;
    v_canonical TEXT;
BEGIN
    v_canonical := concat_ws('|',
        p_kitchen_id::text,
        lower(regexp_replace(btrim(coalesce(p_contact_phone, '')), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(p_address_line1, '')), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(p_address_line2, '')), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(p_landmark, '')), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(p_area_name, '')), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(p_city, '')), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(p_state, '')), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(coalesce(p_postal_code, '')), '\s+', ' ', 'g'))
    );
    v_hash := md5(v_canonical);
    RETURN (
        substr(v_hash, 1, 8) || '-' || substr(v_hash, 9, 4) || '-' ||
        substr(v_hash, 13, 4) || '-' || substr(v_hash, 17, 4) || '-' ||
        substr(v_hash, 21, 12)
    )::uuid;
END;
$$;

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
                THEN 'DELIVERED'
            ELSE 'PENDING'
        END,
        next_attempt_at = CASE
            WHEN catalog_schema.pickup_location_provisioning_outbox.status = 'DELIVERED'
                THEN catalog_schema.pickup_location_provisioning_outbox.next_attempt_at
            ELSE now()
        END,
        lock_token = NULL,
        locked_at = NULL,
        last_error = CASE
            WHEN catalog_schema.pickup_location_provisioning_outbox.status = 'DELIVERED'
                THEN catalog_schema.pickup_location_provisioning_outbox.last_error
            ELSE NULL
        END,
        updated_at = now();
END;
$$;

-- Backfill one immutable pickup snapshot for every existing kitchen.
INSERT INTO catalog_schema.kitchen_pickup_location (
    id, kitchen_id, version_number, status, kitchen_name,
    contact_phone, contact_email, address_line1, address_line2, landmark,
    area_name, city, state, postal_code, latitude, longitude,
    activated_at, created_at, updated_at
)
SELECT
    catalog_schema.delivery_pickup_location_id(
        id, phone_number, address_line1, address_line2, landmark, area_name, city, state, postal_code
    ),
    id,
    1,
    'ACTIVE',
    COALESCE(NULLIF(BTRIM(display_name), ''), kitchen_name),
    phone_number,
    email,
    address_line1,
    address_line2,
    landmark,
    area_name,
    city,
    state,
    postal_code,
    latitude,
    longitude,
    created_at,
    created_at,
    updated_at
FROM catalog_schema.kitchen_profile;

-- Queue only routable kitchens. Provider calls remain disabled by runtime flags after migration.
INSERT INTO catalog_schema.pickup_location_provisioning_outbox (
    event_id, pickup_location_id, kitchen_id, status, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    catalog_schema.delivery_pickup_location_id(
        id, phone_number, address_line1, address_line2, landmark, area_name, city, state, postal_code
    ),
    id,
    'PENDING',
    now(),
    now()
FROM catalog_schema.kitchen_profile
WHERE status = 'ACTIVE'
ON CONFLICT (pickup_location_id) DO NOTHING;

CREATE OR REPLACE FUNCTION catalog_schema.kitchen_pickup_location_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_location_id UUID;
    v_active_id UUID;
    v_next_version INTEGER;
    v_identity_changed BOOLEAN;
BEGIN
    v_location_id := catalog_schema.delivery_pickup_location_id(
        NEW.id, NEW.phone_number, NEW.address_line1, NEW.address_line2,
        NEW.landmark, NEW.area_name, NEW.city, NEW.state, NEW.postal_code
    );

    SELECT id INTO v_active_id
      FROM catalog_schema.kitchen_pickup_location
     WHERE kitchen_id = NEW.id AND status = 'ACTIVE'
     LIMIT 1;

    IF TG_OP = 'INSERT' OR v_active_id IS NULL THEN
        INSERT INTO catalog_schema.kitchen_pickup_location (
            id, kitchen_id, version_number, status, kitchen_name,
            contact_phone, contact_email, address_line1, address_line2, landmark,
            area_name, city, state, postal_code, latitude, longitude,
            activated_at, created_at, updated_at
        ) VALUES (
            v_location_id, NEW.id, 1, 'ACTIVE', COALESCE(NULLIF(BTRIM(NEW.display_name), ''), NEW.kitchen_name),
            NEW.phone_number, NEW.email, NEW.address_line1, NEW.address_line2, NEW.landmark,
            NEW.area_name, NEW.city, NEW.state, NEW.postal_code, NEW.latitude, NEW.longitude,
            now(), now(), now()
        ) ON CONFLICT (id) DO NOTHING;

        IF NEW.status = 'ACTIVE' THEN
            PERFORM catalog_schema.enqueue_pickup_location_provisioning(v_location_id, NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    v_identity_changed :=
        OLD.phone_number IS DISTINCT FROM NEW.phone_number OR
        OLD.address_line1 IS DISTINCT FROM NEW.address_line1 OR
        OLD.address_line2 IS DISTINCT FROM NEW.address_line2 OR
        OLD.landmark IS DISTINCT FROM NEW.landmark OR
        OLD.area_name IS DISTINCT FROM NEW.area_name OR
        OLD.city IS DISTINCT FROM NEW.city OR
        OLD.state IS DISTINCT FROM NEW.state OR
        OLD.postal_code IS DISTINCT FROM NEW.postal_code;

    IF v_identity_changed THEN
        UPDATE catalog_schema.kitchen_pickup_location
           SET status = 'RETIRED', retired_at = now(), updated_at = now()
         WHERE id = v_active_id AND status = 'ACTIVE';

        SELECT COALESCE(MAX(version_number), 0) + 1
          INTO v_next_version
          FROM catalog_schema.kitchen_pickup_location
         WHERE kitchen_id = NEW.id;

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

        IF NEW.status = 'ACTIVE' THEN
            PERFORM catalog_schema.enqueue_pickup_location_provisioning(v_location_id, NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    -- Non-identity updates keep the immutable pickup id but refresh operational contact/coordinate data.
    UPDATE catalog_schema.kitchen_pickup_location
       SET kitchen_name = COALESCE(NULLIF(BTRIM(NEW.display_name), ''), NEW.kitchen_name),
           contact_email = NEW.email,
           latitude = NEW.latitude,
           longitude = NEW.longitude,
           updated_at = now()
     WHERE id = v_active_id;

    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ACTIVE' THEN
        PERFORM catalog_schema.enqueue_pickup_location_provisioning(v_active_id, NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kitchen_pickup_location_lifecycle
AFTER INSERT OR UPDATE ON catalog_schema.kitchen_profile
FOR EACH ROW
EXECUTE FUNCTION catalog_schema.kitchen_pickup_location_lifecycle();
