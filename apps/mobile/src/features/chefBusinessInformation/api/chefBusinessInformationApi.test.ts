import {
  parseChefBusinessProofDocument,
  parseChefBusinessVerificationRecord,
} from './chefBusinessInformationApi';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const IDENTITY_ID = '22222222-2222-4222-8222-222222222222';
const REVIEWER_ID = '33333333-3333-4333-8333-333333333333';
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444';

function proofDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT_ID,
    documentType: 'AADHAAR_CARD',
    originalFileName: 'aadhaar.pdf',
    blobContainer: 'documents',
    blobName: 'kyc/private/storage-key',
    contentType: 'application/pdf',
    fileSizeBytes: 2048,
    status: 'UPLOADED',
    createdAt: '2026-08-01T07:00:00Z',
    updatedAt: '2026-08-09T08:00:00Z',
    ...overrides,
  };
}

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: APPLICATION_ID,
    identityId: IDENTITY_ID,
    phoneNumber: '+919876543210',
    email: 'chef@example.test',
    firstName: 'Anita',
    lastName: 'Rao',
    addressLine1: '12 Market Road',
    addressLine2: null,
    landmark: 'Near Metro',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    latitude: 12.9716,
    longitude: 77.5946,
    status: 'APPROVED',
    rejectionReason: null,
    submittedAt: '2026-08-01T07:00:00Z',
    reviewedAt: '2026-08-02T07:00:00Z',
    reviewedByIdentityId: REVIEWER_ID,
    documents: [proofDocument()],
    ...overrides,
  };
}

describe('Chef Business Information verification parsing', () => {
  it('parses the exact approved application source while excluding storage and reviewer identifiers', () => {
    const parsed = parseChefBusinessVerificationRecord(application());

    expect(parsed).toEqual(
      expect.objectContaining({
        id: APPLICATION_ID,
        status: 'APPROVED',
        firstName: 'Anita',
        documents: [
          expect.objectContaining({
            id: DOCUMENT_ID,
            documentType: 'AADHAAR_CARD',
            status: 'UPLOADED',
          }),
        ],
      }),
    );
    expect(parsed).not.toHaveProperty('identityId');
    expect(parsed).not.toHaveProperty('reviewedByIdentityId');
    expect(parsed?.documents[0]).not.toHaveProperty('blobContainer');
    expect(parsed?.documents[0]).not.toHaveProperty('blobName');
  });

  it('accepts the service NOT_SUBMITTED response only with a null application id', () => {
    expect(
      parseChefBusinessVerificationRecord(
        application({
          id: null,
          status: 'NOT_SUBMITTED',
          email: null,
          firstName: null,
          lastName: null,
          addressLine1: null,
          landmark: null,
          city: null,
          state: null,
          postalCode: null,
          latitude: null,
          longitude: null,
          submittedAt: null,
          reviewedAt: null,
          reviewedByIdentityId: null,
          documents: [],
        }),
      ),
    ).toEqual(
      expect.objectContaining({id: null, status: 'NOT_SUBMITTED', documents: []}),
    );
    expect(
      parseChefBusinessVerificationRecord(
        application({id: APPLICATION_ID, status: 'NOT_SUBMITTED'}),
      ),
    ).toBeNull();
  });

  it('fails closed on document states that the current backend does not define', () => {
    expect(parseChefBusinessProofDocument(proofDocument({status: 'VERIFIED'}))).toBeNull();
    expect(parseChefBusinessProofDocument(proofDocument({documentType: 'FSSAI'}))).toBeNull();
    expect(parseChefBusinessProofDocument(proofDocument({contentType: 'text/plain'}))).toBeNull();
  });

  it('fails closed on duplicate proof types because the server contract permits one row per type', () => {
    expect(
      parseChefBusinessVerificationRecord(
        application({
          documents: [
            proofDocument(),
            proofDocument({id: '55555555-5555-4555-8555-555555555555'}),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('fails closed on unsupported application status or malformed identity metadata', () => {
    expect(parseChefBusinessVerificationRecord(application({status: 'SUSPENDED'}))).toBeNull();
    expect(parseChefBusinessVerificationRecord(application({identityId: 'not-a-uuid'}))).toBeNull();
  });
});
