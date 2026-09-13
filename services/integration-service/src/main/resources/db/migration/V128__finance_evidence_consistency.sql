-- A status label cannot stand in for settlement evidence, and null SQL values must not bypass failure validation.
ALTER TABLE payment_schema.finance_payout_instruction ADD CONSTRAINT finance_payout_evidence_consistency CHECK (
 (status<>'FAILED' OR (provider_status IS NOT NULL AND provider_status IN ('failed','cancelled','rejected')))
 AND (settlement_journal_id IS NULL OR status IN ('PAID','REVERSED'))
 AND (reversal_journal_id IS NULL OR (status='REVERSED' AND settlement_journal_id IS NOT NULL))
);
