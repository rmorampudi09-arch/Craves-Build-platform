-- Keep historical evidence and application approvals; new proof slots have their own types.
ALTER TABLE chef_kyc_document DROP CONSTRAINT ck_chef_kyc_document_type;
ALTER TABLE chef_kyc_document ADD CONSTRAINT ck_chef_kyc_document_type CHECK (
    document_type IN ('APPLICANT_PHOTO','GOVERNMENT_ID_FRONT','GOVERNMENT_ID_BACK','TAX_ID_CARD',
        'AADHAAR_CARD','PAN_CARD','KITCHEN_PHOTO_1','KITCHEN_PHOTO_2','FSSAI_LICENSE',
        'SELECTED_PROOF_FRONT','SELECTED_PROOF_BACK')
);
-- Only drafts enrolled in v2 already linked these files to an explicit proof choice.
UPDATE chef_kyc_document d SET document_type=CASE d.document_type
    WHEN 'GOVERNMENT_ID_FRONT' THEN 'SELECTED_PROOF_FRONT' ELSE 'SELECTED_PROOF_BACK' END
WHERE d.document_type IN ('GOVERNMENT_ID_FRONT','GOVERNMENT_ID_BACK')
    AND EXISTS(SELECT 1 FROM chef_onboarding_draft n WHERE n.application_id=d.application_id
        AND n.details->>'proofKind' IS NOT NULL);
