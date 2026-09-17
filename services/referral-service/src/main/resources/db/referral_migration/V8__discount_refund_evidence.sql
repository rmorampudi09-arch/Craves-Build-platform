CREATE TABLE referral_schema.discount_refund (
 reservation_id UUID PRIMARY KEY REFERENCES referral_schema.discount_reservation(id),
 refunded_paise BIGINT NOT NULL DEFAULT 0 CHECK(refunded_paise>=0),source_version INTEGER NOT NULL DEFAULT 0,source_hash CHAR(64)
);
