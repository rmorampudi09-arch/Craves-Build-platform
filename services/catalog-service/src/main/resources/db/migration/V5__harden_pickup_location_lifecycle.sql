-- V4 intentionally derives a pickup UUID from normalized identity fields. A formatting-only update
-- can make raw columns differ while the normalized UUID remains unchanged. Replace the lifecycle
-- function so such edits refresh the active row rather than retiring it and colliding with its PK.

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
        ) ON CONFLICT (id) DO UPDATE SET
            kitchen_name = EXCLUDED.kitchen_name,
            contact_phone = EXCLUDED.contact_phone,
            contact_email = EXCLUDED.contact_email,
            address_line1 = EXCLUDED.address_line1,
            address_line2 = EXCLUDED.address_line2,
            landmark = EXCLUDED.landmark,
            area_name = EXCLUDED.area_name,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            postal_code = EXCLUDED.postal_code,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            updated_at = now();

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

    IF v_identity_changed AND v_location_id <> v_active_id THEN
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

    -- Formatting-only pickup edits and non-identity edits keep the stable id.
    UPDATE catalog_schema.kitchen_pickup_location
       SET kitchen_name = COALESCE(NULLIF(BTRIM(NEW.display_name), ''), NEW.kitchen_name),
           contact_phone = NEW.phone_number,
           contact_email = NEW.email,
           address_line1 = NEW.address_line1,
           address_line2 = NEW.address_line2,
           landmark = NEW.landmark,
           area_name = NEW.area_name,
           city = NEW.city,
           state = NEW.state,
           postal_code = NEW.postal_code,
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
