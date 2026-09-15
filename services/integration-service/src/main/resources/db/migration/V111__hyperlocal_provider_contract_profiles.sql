-- Refine provider metadata for the remaining hyperlocal delivery vendors.
--
-- IMPORTANT:
-- * This migration never activates a provider.
-- * service_areas remains empty until Hyderabad serviceability is verified against the vendor
--   account/contract.
-- * No private endpoint, auth model, price field or response schema is invented here.

UPDATE delivery_schema.delivery_provider
SET display_name = 'Shadowfax Hyperlocal',
    adapter_type = 'SHADOWFAX_HYPERLOCAL_PRIVATE_CONTRACT',
    service_areas = '[]'::jsonb,
    capabilities = '{
      "PRODUCT_FAMILY": "HYPERLOCAL_MARKETPLACE",
      "QUOTE_REQUIRED": true,
      "CREATE_DELIVERY_REQUIRED": true,
      "CANCEL_REQUIRED": true,
      "TRACK_REQUIRED": true,
      "WEBHOOK_REQUIRED": true,
      "SERVICEABILITY_REQUIRED": true,
      "CREATE_RECONCILIATION_REQUIRED": true,
      "HYDERABAD_SERVICEABILITY_VERIFICATION_REQUIRED": true,
      "VENDOR_API_CONTRACT_REQUIRED": true,
      "RIDER_LEVEL_CANDIDATES": false
    }'::jsonb,
    updated_at = now()
WHERE provider_id = 'shadowfax';

UPDATE delivery_schema.delivery_provider
SET display_name = 'Porter Enterprise 2W',
    adapter_type = 'PORTER_ENTERPRISE_2W_PRIVATE_CONTRACT',
    service_areas = '[]'::jsonb,
    capabilities = '{
      "PRODUCT_FAMILY": "INTRACITY_2W",
      "QUOTE_REQUIRED": true,
      "CREATE_DELIVERY_REQUIRED": true,
      "CANCEL_REQUIRED": true,
      "TRACK_REQUIRED": true,
      "WEBHOOK_REQUIRED": true,
      "SERVICEABILITY_REQUIRED": true,
      "CREATE_RECONCILIATION_REQUIRED": true,
      "HYDERABAD_SERVICEABILITY_VERIFICATION_REQUIRED": true,
      "ENTERPRISE_API_CONTRACT_REQUIRED": true,
      "RIDER_LEVEL_CANDIDATES": false
    }'::jsonb,
    updated_at = now()
WHERE provider_id = 'porter';

UPDATE delivery_schema.delivery_provider
SET display_name = 'Delhivery Direct Intracity',
    adapter_type = 'DELHIVERY_DIRECT_INTRACITY_PRIVATE_CONTRACT',
    service_areas = '[]'::jsonb,
    capabilities = '{
      "PRODUCT_FAMILY": "DIRECT_INTRACITY",
      "QUOTE_REQUIRED": true,
      "CREATE_DELIVERY_REQUIRED": true,
      "CANCEL_REQUIRED": true,
      "TRACK_REQUIRED": true,
      "WEBHOOK_REQUIRED": true,
      "SERVICEABILITY_REQUIRED": true,
      "CREATE_RECONCILIATION_REQUIRED": true,
      "HYDERABAD_SERVICEABILITY_VERIFICATION_REQUIRED": true,
      "DIRECT_INTRACITY_API_CONTRACT_REQUIRED": true,
      "RIDER_LEVEL_CANDIDATES": false
    }'::jsonb,
    updated_at = now()
WHERE provider_id = 'delhivery';

-- Defensive invariant: these vendor-gated profiles must remain fail-closed after migration.
-- Existing manually activated state is not overwritten because migrations are not operational
-- switches; activation/deactivation remains the responsibility of guarded pipelines.
