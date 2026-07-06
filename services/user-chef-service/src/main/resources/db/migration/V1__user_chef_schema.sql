CREATE TABLE customer_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id UUID NOT NULL UNIQUE,
    registered_phone_number VARCHAR(20) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_address (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id UUID NOT NULL,
    address_label VARCHAR(20) NOT NULL DEFAULT 'HOME',
    recipient_name VARCHAR(160),
    contact_phone_number VARCHAR(20) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    landmark VARCHAR(255),
    city VARCHAR(120) NOT NULL,
    state VARCHAR(120) NOT NULL,
    postal_code VARCHAR(20),
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_customer_address_label CHECK (address_label IN ('HOME', 'WORK', 'OTHER'))
);

CREATE INDEX ix_customer_address_identity ON customer_address(identity_id);
CREATE UNIQUE INDEX ux_customer_address_default ON customer_address(identity_id) WHERE is_default = true;

CREATE TABLE chef_application (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id UUID NOT NULL UNIQUE,
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    landmark VARCHAR(255),
    city VARCHAR(120) NOT NULL,
    state VARCHAR(120) NOT NULL,
    postal_code VARCHAR(20),
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_identity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_chef_application_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX ix_chef_application_status ON chef_application(status);
