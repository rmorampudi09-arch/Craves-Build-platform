import {chefReadinessSummary, parseChefApplicationReadiness} from './chefReadinessContract';

function ready() {
  return {
    contractVersion: 1, applicationStatus: 'PENDING', emailStatus: 'VERIFIED', approvalReady: true,
    requiredDocumentCount: 4, uploadedDocumentCount: 4, approvedDocumentCount: 4,
    documents: ['APPLICANT_PHOTO', 'GOVERNMENT_ID_FRONT', 'GOVERNMENT_ID_BACK', 'TAX_ID_CARD'].map(documentType => ({
      documentType, status: 'APPROVED', rejectionReason: null, blobName: 'private-path',
    })), blockingIssues: [], evaluatedAt: '2026-10-01T00:00:00Z', lastSavedAt: null,
  };
}

describe('Chef readiness contract', () => {
  it('keeps server approval distinct from being ready for an admin decision and strips storage paths', () => {
    const parsed = parseChefApplicationReadiness(ready());
    expect(parsed).not.toBeNull();
    expect(chefReadinessSummary(parsed!)).toContain('awaiting the final admin decision');
    expect(JSON.stringify(parsed)).not.toContain('private-path');
  });
  it('rejects legacy-only, duplicate and unverified readiness', () => {
    const legacy = ready(); legacy.documents[0].documentType = 'AADHAAR_CARD';
    const duplicate = ready(); duplicate.documents[0] = duplicate.documents[1];
    const unreviewed = ready(); unreviewed.documents[0].status = 'UPLOADED';
    for (const payload of [legacy, duplicate, unreviewed, {...ready(), emailStatus: 'VERIFICATION_REQUIRED'}, {...ready(), contractVersion: 2}]) {
      expect(parseChefApplicationReadiness(payload)).toBeNull();
    }
  });
  it('does not treat an approved application as eligible for another approval', () => {
    expect(parseChefApplicationReadiness({...ready(), applicationStatus: 'APPROVED'})).toBeNull();
    const parsed = parseChefApplicationReadiness({...ready(), applicationStatus: 'APPROVED', approvalReady: false});
    expect(chefReadinessSummary(parsed!)).toBe('Your Chef application is approved.');
  });
  it('retains rejection reasons and missing evidence', () => {
    const payload = {...ready(), approvalReady: false, uploadedDocumentCount: 1, approvedDocumentCount: 0,
      documents: ready().documents.map((document, index) => ({...document, status: index === 0 ? 'REJECTED' : 'MISSING', rejectionReason: index === 0 ? 'Please upload a legible copy' : null}))};
    expect(parseChefApplicationReadiness(payload)?.documents[0].rejectionReason).toBe('Please upload a legible copy');
  });
});
