SET LOCAL lock_timeout = '5s';

-- Kitchen photos: slot 1 stays kitchen_photo_url, slot 2 is new. kitchen_photos_imported_at records that the chef's
-- approved registration photos were copied in (or that there were none), so each kitchen is imported once.
ALTER TABLE catalog_schema.kitchen_profile
    ADD COLUMN IF NOT EXISTS kitchen_photo_2_url        TEXT,
    ADD COLUMN IF NOT EXISTS kitchen_photos_imported_at TIMESTAMPTZ;
