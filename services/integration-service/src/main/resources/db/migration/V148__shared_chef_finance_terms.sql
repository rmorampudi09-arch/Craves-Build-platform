-- Shared finance access follows the existing documented chef approval.
-- Inherit only a unanimous, actually reviewed withholding rate. Do not invent
-- turnover, registration, financial-year declarations, consent, or provider approval.
CREATE TABLE payment_schema.finance_shared_chef_terms_version (
 id UUID PRIMARY KEY, withholding_rate NUMERIC(9,6) NOT NULL CHECK(withholding_rate BETWEEN 0 AND 100),
 source_profile_ids JSONB NOT NULL CHECK(jsonb_typeof(source_profile_ids)='array' AND jsonb_array_length(source_profile_ids)>0),
 reason VARCHAR(1000) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.finance_shared_chef_terms_head (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 version_id UUID REFERENCES payment_schema.finance_shared_chef_terms_version(id)
);
WITH reviewed AS (
 SELECT v.id,(v.payload->>'withholdingRate')::numeric AS rate
 FROM payment_schema.finance_chef_tax_head h
 JOIN payment_schema.finance_chef_tax_version v ON v.id=h.version_id
 WHERE v.payload->>'stateCode'='36' AND v.payload->>'supplyRegime'='RESTAURANT_ECO_9_5'
   AND nullif(v.payload->>'withholdingEvidence','') IS NOT NULL
   AND v.payload->>'financialYear' =
       (extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata') - interval '3 months')::int)::text || '-' ||
       to_char((now() AT TIME ZONE 'Asia/Kolkata') - interval '3 months' + interval '1 year','YY')
)
INSERT INTO payment_schema.finance_shared_chef_terms_version(id,withholding_rate,source_profile_ids,reason)
 SELECT gen_random_uuid(),min(rate),jsonb_agg(id ORDER BY id),
   'Owner requested common finance after admin chef approval; inherited unanimous reviewed withholding terms'
 FROM reviewed HAVING count(*)>0 AND count(DISTINCT rate)=1;
INSERT INTO payment_schema.finance_shared_chef_terms_head(singleton,version_id)
 VALUES(true,(SELECT id FROM payment_schema.finance_shared_chef_terms_version));
CREATE TRIGGER finance_shared_chef_terms_version_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
 ON payment_schema.finance_shared_chef_terms_version
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
