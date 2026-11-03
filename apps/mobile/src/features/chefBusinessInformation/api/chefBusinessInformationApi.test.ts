import {httpClient} from '../../../core/http/httpClient';
import {
  CHEF_APPLICATION_EVIDENCE_ROUTE,
  CHEF_PROOF_FILES_ROUTE,
  chefBusinessInformationApi,
  parseChefBusinessEvidence,
} from './chefBusinessInformationApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const uploaded = {
  id: '11111111-1111-4111-8111-111111111111',
  documentType: 'GOVERNMENT_ID_FRONT',
  originalFileName: 'identity-front.jpg',
  blobContainer: 'chef-documents',
  blobName:
    'kyc/22222222-2222-4222-8222-222222222222/government_id_front/file.jpg',
  contentType: 'image/jpeg',
  fileSizeBytes: 12345,
  status: 'UPLOADED',
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-09-19T12:00:00Z',
  updatedAt: '2026-09-19T12:00:00Z',
};

describe('chefBusinessInformationApi KYC evidence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts only the four current application evidence types', () => {
    expect(
      parseChefBusinessEvidence([
        uploaded,
        {
          ...uploaded,
          id: '33333333-3333-4333-8333-333333333333',
          documentType: 'APPLICANT_PHOTO',
          originalFileName: 'photo.png',
          blobName:
            'kyc/22222222-2222-4222-8222-222222222222/applicant_photo/photo.png',
          contentType: 'image/png',
        },
      ]),
    ).toHaveLength(2);

    // Types the panel does not offer (v2 kitchen photos, FSSAI, future ones) are left out, not fatal.
    expect(
      parseChefBusinessEvidence([
        {...uploaded, documentType: 'PAN_CARD'},
        {...uploaded, documentType: 'KITCHEN_PHOTO_1'},
        {...uploaded, documentType: 'FSSAI_LICENSE'},
        {...uploaded, documentType: 'SOMETHING_NEW'},
      ]),
    ).toEqual([]);
  });

  it('reads the dedicated current evidence endpoint', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue([uploaded]);

    await expect(
      chefBusinessInformationApi.listApplicationEvidence(),
    ).resolves.toEqual([
      expect.objectContaining({
        id: uploaded.id,
        documentType: 'GOVERNMENT_ID_FRONT',
        originalFileName: 'identity-front.jpg',
      }),
    ]);

    expect(httpClient.get).toHaveBeenCalledWith(
      CHEF_APPLICATION_EVIDENCE_ROUTE,
      {
        signal: undefined,
        dedupeKey: 'chef-application:evidence',
      },
    );
  });

  it('posts exact multipart documentType and file fields', async () => {
    (httpClient.post as jest.Mock).mockResolvedValue(uploaded);
    const append = jest.fn();
    const formData = {append};
    const formDataGlobal = globalThis as unknown as {FormData: typeof FormData};
    const originalFormData = formDataGlobal.FormData;
    const FormDataMock = jest.fn().mockImplementation(() => formData);
    Object.defineProperty(formDataGlobal, 'FormData', {
      configurable: true,
      writable: true,
      value: FormDataMock,
    });

    await expect(
      chefBusinessInformationApi.uploadProofFile('GOVERNMENT_ID_FRONT', {
        uri: 'file:///identity-front.jpg',
        name: 'identity-front.jpg',
        type: 'image/jpeg',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        documentType: 'GOVERNMENT_ID_FRONT',
        originalFileName: 'identity-front.jpg',
      }),
    );

    expect(FormDataMock).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenNthCalledWith(
      1,
      'documentType',
      'GOVERNMENT_ID_FRONT',
    );
    expect(append).toHaveBeenNthCalledWith(2, 'file', {
      uri: 'file:///identity-front.jpg',
      name: 'identity-front.jpg',
      type: 'image/jpeg',
    });
    expect(httpClient.post).toHaveBeenCalledWith(
      CHEF_PROOF_FILES_ROUTE,
      formData,
      {signal: undefined},
    );

    Object.defineProperty(formDataGlobal, 'FormData', {
      configurable: true,
      writable: true,
      value: originalFormData,
    });
  });

  it('does not allow legacy document types through the upload API', async () => {
    await expect(
      chefBusinessInformationApi.uploadProofFile(
        'PAN_CARD' as never,
        {
          uri: 'file:///pan.jpg',
          name: 'pan.jpg',
          type: 'image/jpeg',
        },
      ),
    ).rejects.toThrow('Unsupported Chef application document type.');

    expect(httpClient.post).not.toHaveBeenCalled();
  });

  describe('verification record', () => {
    const doc = (documentType: string, index: number) => ({
      ...uploaded,
      id: `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
      documentType,
    });
    // Shape of GET /api/v1/chef/application for a chef who applied through onboarding v2.
    const v2Record = (documents: unknown[]) => ({
      id: '44444444-4444-4444-8444-444444444444',
      identityId: '22222222-2222-4222-8222-222222222222',
      phoneNumber: '+919876543210',
      email: 'chef@example.com',
      firstName: 'Relangi',
      lastName: 'M',
      addressLine1: '12 Main Road',
      addressLine2: null,
      landmark: null,
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500072',
      latitude: 17.4,
      longitude: 78.4,
      status: 'PENDING',
      rejectionReason: null,
      submittedAt: '2026-10-20T10:00:00Z',
      reviewedAt: null,
      reviewedByIdentityId: null,
      documents,
      referenceCode: 'CRV-10001',
    });
    const V2_TYPES = [
      'KITCHEN_PHOTO_1',
      'KITCHEN_PHOTO_2',
      'FSSAI_LICENSE',
      'SELECTED_PROOF_FRONT',
      'SELECTED_PROOF_BACK',
    ];

    it('reads a v2 chef record so the bank account screen gets the applicant name', async () => {
      (httpClient.get as jest.Mock).mockResolvedValue(
        v2Record(V2_TYPES.map(doc)),
      );

      const record = await chefBusinessInformationApi.getVerificationRecord();

      expect(record.status).toBe('PENDING');
      expect(record.firstName).toBe('Relangi');
      expect(record.documents.map(item => item.documentType)).toEqual(V2_TYPES);
    });

    it('skips a document type it does not know and has no length cap', async () => {
      const everyType = [
        'APPLICANT_PHOTO',
        'GOVERNMENT_ID_FRONT',
        'GOVERNMENT_ID_BACK',
        'TAX_ID_CARD',
        'AADHAAR_CARD',
        'PAN_CARD',
        ...V2_TYPES,
        'SOMETHING_NEW',
      ];
      (httpClient.get as jest.Mock).mockResolvedValue(
        v2Record(everyType.map(doc)),
      );

      const record = await chefBusinessInformationApi.getVerificationRecord();

      expect(record.documents).toHaveLength(11);
      expect(record.documents.map(item => item.documentType)).not.toContain(
        'SOMETHING_NEW',
      );
    });

    it('still rejects a known document type that is malformed', async () => {
      (httpClient.get as jest.Mock).mockResolvedValue(
        v2Record([{...doc('KITCHEN_PHOTO_1', 1), fileSizeBytes: 0}]),
      );

      await expect(
        chefBusinessInformationApi.getVerificationRecord(),
      ).rejects.toThrow('unsupported response');
    });
  });
});
