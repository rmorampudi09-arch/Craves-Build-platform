-- Read-only diagnostics. Use a referral-schema-scoped operator role.
-- Counts/ages only: no user IDs, source bodies, contact hashes or payment destinations.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';

SELECT now() AS checked_at, count(*) AS wallet_drift_count
FROM referral_schema.wallet w
LEFT JOIN (
  SELECT user_id, sum(pending_delta) p, sum(available_delta) a, sum(reserved_delta) r
  FROM referral_schema.journal GROUP BY user_id
) j ON j.user_id=w.user_id
WHERE w.pending_paise<>COALESCE(j.p,0)
   OR w.available_paise<>COALESCE(j.a,0)
   OR w.reserved_paise<>COALESCE(j.r,0);

SELECT status, count(*) AS records, min(received_at) AS oldest_received
FROM referral_schema.inbox GROUP BY status ORDER BY status;
SELECT status, count(*) AS records, min(created_at) AS oldest_created
FROM referral_schema.outbox GROUP BY status ORDER BY status;
SELECT status, count(*) AS rewards, min(hold_until) AS earliest_hold_end
FROM referral_schema.reward GROUP BY status ORDER BY status;
SELECT status, count(*) AS cashouts, min(requested_at) AS oldest_request
FROM referral_schema.reservation WHERE kind='CASHOUT' GROUP BY status ORDER BY status;
SELECT status, count(*) AS cases, min(opened_at) AS oldest_case
FROM referral_schema.fraud_case GROUP BY status ORDER BY status;
SELECT track, available_paise::text AS available_paise FROM referral_schema.budget ORDER BY track;
SELECT count(*) AS negative_available_wallets FROM referral_schema.wallet WHERE available_paise<0;
-- Negative available wallets can be valid clawbacks; they are not by themselves drift.
COMMIT;
