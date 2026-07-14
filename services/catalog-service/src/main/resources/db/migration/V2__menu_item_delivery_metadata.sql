ALTER TABLE catalog_schema.menu_item
    ADD COLUMN IF NOT EXISTS unit_package_weight_grams INTEGER,
    ADD COLUMN IF NOT EXISTS thermobox_required BOOLEAN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_catalog_menu_item_package_weight'
          AND conrelid = 'catalog_schema.menu_item'::regclass
    ) THEN
        ALTER TABLE catalog_schema.menu_item
            ADD CONSTRAINT chk_catalog_menu_item_package_weight
            CHECK (unit_package_weight_grams IS NULL OR unit_package_weight_grams > 0)
            NOT VALID;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_catalog_active_item_delivery_metadata'
          AND conrelid = 'catalog_schema.menu_item'::regclass
    ) THEN
        ALTER TABLE catalog_schema.menu_item
            ADD CONSTRAINT chk_catalog_active_item_delivery_metadata
            CHECK (
                status <> 'ACTIVE'
                OR (
                    unit_package_weight_grams IS NOT NULL
                    AND thermobox_required IS NOT NULL
                )
            )
            NOT VALID;
    END IF;
END
$$;

COMMENT ON COLUMN catalog_schema.menu_item.unit_package_weight_grams IS
    'Packaged weight for one unit of this menu item. Chef-supplied and stored in grams.';

COMMENT ON COLUMN catalog_schema.menu_item.thermobox_required IS
    'Whether this menu item requires insulated thermobox handling during delivery.';
