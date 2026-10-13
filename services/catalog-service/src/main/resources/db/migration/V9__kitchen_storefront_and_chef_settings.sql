SET LOCAL lock_timeout = '5s';

-- Chef app: storefront photos, cuisines, delivery areas, social links, and order settings. All additive with constant
-- defaults (metadata-only on PostgreSQL 11+), so existing rows and clients are unaffected.
ALTER TABLE catalog_schema.kitchen_profile
    ADD COLUMN IF NOT EXISTS chef_photo_url        TEXT,
    ADD COLUMN IF NOT EXISTS kitchen_photo_url     TEXT,
    ADD COLUMN IF NOT EXISTS cuisines              JSONB   NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS service_areas         JSONB   NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS social_links          JSONB   NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS auto_accept_orders    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS default_prep_minutes  INTEGER;

-- menu_item.status is a plain VARCHAR (no CHECK), so the new ARCHIVED value needs no DDL. Every customer-facing
-- query already filters status = 'ACTIVE'; the chef-side queries exclude ARCHIVED in the service code.
