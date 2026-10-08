import { httpClient } from '../../../core/http/httpClient';
import {
  chefOnboardingApi,
  emptyDetails,
  languages,
  parseState,
  proofNeedsBack,
  requestId,
} from './chefOnboardingApi';
jest.mock('../../../core/http/httpClient', () => ({
  httpClient: { get: jest.fn(), put: jest.fn(), post: jest.fn() },
}));
const state = {
  enabled: true,
  legacy: false,
  version: 1,
  resumeStep: 'fssai',
  submitted: false,
  phoneNumber: '+919000000000',
  details: { ...emptyDetails, email: 'chef@example.test' },
  application: { id: null, status: 'NOT_SUBMITTED' },
  documents: [],
  requiredDocuments: ['KITCHEN_PHOTO_1', 'KITCHEN_PHOTO_2', 'FSSAI_LICENSE'],
  supportPhone: '8367366787',
  supportEmail: 'support@craves.in',
};
beforeEach(() => jest.clearAllMocks());
test('parses resumable FSSAI state and refuses malformed completion', () => {
  expect(parseState(state).resumeStep).toBe('fssai');
  expect(() =>
    parseState({ ...state, resumeStep: 'approved-without-evidence' }),
  ).toThrow();
  expect(() => parseState({ ...state, supportEmail: 'invalid' })).toThrow();
});
test('proof choices and actual language codes match server rules', () => {
  expect(proofNeedsBack('PAN')).toBe(false);
  expect(proofNeedsBack('BANK_STATEMENT')).toBe(false);
  expect(proofNeedsBack('AADHAAR')).toBe(true);
  expect(proofNeedsBack('OTHER_GOVERNMENT_ID')).toBe(true);
  expect(languages).toHaveLength(23);
  expect(requestId()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
test('saving forwards expected version and details to the protected onboarding API', async () => {
  jest.mocked(httpClient.put).mockResolvedValue(state);
  await chefOnboardingApi.save(7, emptyDetails);
  expect(httpClient.put).toHaveBeenCalledWith('/api/v1/chef/onboarding', {
    expectedVersion: 7,
    details: emptyDetails,
  });
});
test('help uses the same request key without choosing a different identity', async () => {
  jest.mocked(httpClient.post).mockResolvedValue({ caseNumber: 'CRV-TEST' });
  const key = requestId();
  await chefOnboardingApi.help(key, 'Help me apply');
  expect(httpClient.post).toHaveBeenCalledWith('/api/v1/chef/onboarding/help', {
    requestKey: key,
    message: 'Help me apply',
  });
});
test('video access must be HTTPS and content requests remain language-specific', async () => {
  jest.mocked(httpClient.get).mockResolvedValueOnce([]);
  await chefOnboardingApi.content('te');
  expect(httpClient.get).toHaveBeenCalledWith(
    '/api/v1/chef/onboarding/content',
    { params: { language: 'te' } },
  );
  jest
    .mocked(httpClient.get)
    .mockResolvedValueOnce({ url: 'http://example.test/video' });
  await expect(chefOnboardingApi.playback('123')).rejects.toThrow(
    'Secure video',
  );
});
