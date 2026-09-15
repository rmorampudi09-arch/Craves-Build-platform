-- Records the exact published Shadowfax HL Marketplace contract implemented by the adapter.
-- This migration never activates Shadowfax and does not claim account entitlement or Hyderabad
-- serviceability. Those remain guarded operational checks.
UPDATE delivery_schema.delivery_provider
SET adapter_type = 'SHADOWFAX_HL_MARKETPLACE_API_V2',
    capabilities = capabilities || '{
      "CONTRACT_SOURCE": "sfxhlmarketplaceapi.docs.apiary.io",
      "SERVICEABILITY_ENDPOINT": "/api/v1/order-serviceability/",
      "ORDER_API_VERSION": "v2",
      "TOKEN_AUTHENTICATION": true,
      "PREPAID_ONLY_IN_CRAVES": true,
      "DISPATCH_READY_SUPPORTED": true,
      "CREATE_RECONCILIATION_REQUIRED": true,
      "CREATE_RECONCILIATION_AVAILABLE": false
    }'::jsonb,
    updated_at = now()
WHERE provider_id = 'shadowfax';
