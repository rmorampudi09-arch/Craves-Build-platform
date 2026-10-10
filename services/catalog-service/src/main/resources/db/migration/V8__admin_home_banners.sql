CREATE TABLE catalog_schema.home_banners (
    id UUID PRIMARY KEY,
    label VARCHAR(160) NOT NULL,
    image_bytes BYTEA NOT NULL CHECK (octet_length(image_bytes) <= 2097152),
    content_type VARCHAR(32) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX home_banners_published_order ON catalog_schema.home_banners(sort_order, created_at, id) WHERE published;
CREATE TABLE catalog_schema.home_banner_audit (
    id BIGSERIAL PRIMARY KEY,
    banner_id UUID NOT NULL REFERENCES catalog_schema.home_banners(id),
    actor_id UUID NOT NULL,
    action VARCHAR(32) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
