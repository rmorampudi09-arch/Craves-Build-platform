-- PostgreSQL full-text indexes use the built-in "simple" configuration so
-- Telugu and English catalog tokens are indexed without English stemming or a
-- new database extension. Search remains server-authoritative and does not
-- synthesize aliases, ratings, prices, or availability.
CREATE INDEX IF NOT EXISTS idx_catalog_kitchen_discovery_search
    ON catalog_schema.kitchen_profile
    USING GIN (
        to_tsvector(
            'simple'::regconfig,
            COALESCE(kitchen_name, '') || ' ' ||
            COALESCE(display_name, '') || ' ' ||
            COALESCE(description, '') || ' ' ||
            COALESCE(area_name, '') || ' ' ||
            COALESCE(city, '')
        )
    )
    WHERE status = 'ACTIVE'
      AND location IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_menu_item_discovery_search
    ON catalog_schema.menu_item
    USING GIN (
        to_tsvector(
            'simple'::regconfig,
            COALESCE(item_name, '') || ' ' ||
            COALESCE(description, '') || ' ' ||
            COALESCE(category, '')
        )
    )
    WHERE status = 'ACTIVE'
      AND is_available = true
      AND unit_package_weight_grams IS NOT NULL
      AND thermobox_required IS NOT NULL;

-- Structured filters remain anchored by kitchen_id because nearby discovery
-- first narrows active kitchens through the PostGIS geography index and then
-- evaluates eligible menu items for those kitchens.
CREATE INDEX IF NOT EXISTS idx_catalog_menu_item_discovery_filters_v2
    ON catalog_schema.menu_item (
        kitchen_id,
        food_type,
        LOWER(category),
        price,
        preparation_time_minutes,
        spice_level,
        id
    )
    WHERE status = 'ACTIVE'
      AND is_available = true
      AND unit_package_weight_grams IS NOT NULL
      AND thermobox_required IS NOT NULL;
