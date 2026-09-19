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

    expect(
      parseChefBusinessEvidence([
        {
          ...uploaded,
          documentType: 'PAN_CARD',
        },
      ]),
    ).toBeNull();
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
    const originalFormData = globalThis.FormData;
    const FormDataMock = jest.fn().mockImplementation(() => formData);
    Object.defineProperty(globalThis, 'FormData', {
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

    Object.defineProperty(globalThis, 'FormData', {
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
});
