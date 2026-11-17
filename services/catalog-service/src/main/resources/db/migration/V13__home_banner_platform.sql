-- Website and app banners are uploaded and shown apart (owner, 17 Nov 2026). Until now only the website showed
-- banners (the app shows pictures bundled in it), so every existing banner is a website banner.
ALTER TABLE catalog_schema.home_banners
    ADD COLUMN platform VARCHAR(8) NOT NULL DEFAULT 'WEB' CHECK (platform IN ('WEB', 'APP'));

CREATE INDEX home_banners_platform_published_order
    ON catalog_schema.home_banners(platform, sort_order, created_at, id) WHERE published;
