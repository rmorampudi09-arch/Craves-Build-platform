-- Registration is intentionally inactive. Activation requires verified production runtime evidence.
INSERT INTO delivery_schema.delivery_provider
    (provider_id, display_name, adapter_type, is_active, service_areas, capabilities, created_at, updated_at)
VALUES ('pidge', 'Pidge Hyperlocal', 'PIDGE_VENDOR_V1', false, '[]'::jsonb,
    '{"QUOTE":true,"CREATE_DELIVERY":true,"CANCEL":true,"TRACK":true,"WEBHOOK":true,"HYPERLOCAL_FILTER":true,"RIDER_LEVEL_CANDIDATES":false}'::jsonb,
    now(), now())
ON CONFLICT (provider_id) DO UPDATE SET display_name=EXCLUDED.display_name,
    adapter_type=EXCLUDED.adapter_type, capabilities=EXCLUDED.capabilities, updated_at=now();

CREATE TABLE delivery_schema.pidge_booking (
    client_reference varchar(200) PRIMARY KEY,
    provider_order_id varchar(200) UNIQUE,
    state varchar(30) NOT NULL CHECK (state IN ('ATTEMPTING','CREATED','FULFILLED','CANCELLED','REJECTED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_pidge_webhook_reference ON delivery_schema.delivery_webhook_inbox
    ((raw_payload->'dd_channel'->>'order_id'), received_at)
    WHERE provider_id='pidge';
