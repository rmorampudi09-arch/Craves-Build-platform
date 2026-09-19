import {httpClient} from '../../../core/http/httpClient';
import {
  CHEF_BANK_CONSENT_VERSION,
  CHEF_BANK_ROUTE,
  buildChefBankSubmission,
  chefBankOnboardingApi,
  parseChefBankStatus,
} from './chefBankOnboardingApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const status = {
  id: '11111111-1111-4111-8111-111111111111',
  state: 'QUEUED',
  lastFour: '7890',
  ifsc: 'HDFC0000053',
  bankValidated: false,
  applicationApproved: true,
  automaticActivation: true,
  message: 'Validation pending',
  updatedAt: '2026-09-19T12:00:00Z',
};

describe('chefBankOnboardingApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds the exact strict bank submission JSON required by main', () => {
    expect(
      buildChefBankSubmission({
        requestKey: '22222222-2222-4222-8222-222222222222',
        expectedCurrentId: '11111111-1111-4111-8111-111111111111',
        accountHolderName: '  Test Chef  ',
        accountNumber: '001234567890',
        accountNumberConfirmation: '001234567890',
        ifsc: 'hdfc0000053',
        consent: true,
      }),
    ).toEqual({
      requestKey: '22222222-2222-4222-8222-222222222222',
      expectedCurrentId: '11111111-1111-4111-8111-111111111111',
      accountHolderName: 'Test Chef',
      accountNumber: '001234567890',
      accountNumberConfirmation: '001234567890',
      ifsc: 'HDFC0000053',
      consent: true,
      consentVersion: CHEF_BANK_CONSENT_VERSION,
    });
  });

  it('rejects mismatched account numbers and missing consent before POST', () => {
    expect(() =>
      buildChefBankSubmission({
        requestKey: '22222222-2222-4222-8222-222222222222',
        expectedCurrentId: null,
        accountHolderName: 'Test Chef',
        accountNumber: '001234567890',
        accountNumberConfirmation: '001234567891',
        ifsc: 'HDFC0000053',
        consent: true,
      }),
    ).toThrow('CHEF_BANK_ACCOUNT_MISMATCH');

    expect(() =>
      buildChefBankSubmission({
        requestKey: '22222222-2222-4222-8222-222222222222',
        expectedCurrentId: null,
        accountHolderName: 'Test Chef',
        accountNumber: '001234567890',
        accountNumberConfirmation: '001234567890',
        ifsc: 'HDFC0000053',
        consent: false,
      }),
    ).toThrow('CHEF_BANK_CONSENT_REQUIRED');
  });

  it('accepts only the masked BankStatus response contract', () => {
    expect(parseChefBankStatus(status)).toEqual(status);
    expect(
      parseChefBankStatus({...status, accountNumber: '001234567890'}),
    ).toBeNull();
  });

  it('allows NOT_SUBMITTED only without masked bank metadata', () => {
    expect(
      parseChefBankStatus({
        id: null,
        state: 'NOT_SUBMITTED',
        lastFour: null,
        ifsc: null,
        bankValidated: false,
        applicationApproved: false,
        automaticActivation: true,
        message: 'Add your bank details.',
        updatedAt: null,
      }),
    ).not.toBeNull();

    expect(
      parseChefBankStatus({
        ...status,
        id: null,
        state: 'NOT_SUBMITTED',
      }),
    ).toBeNull();
  });

  it('reads the exact masked bank route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(status);

    await expect(chefBankOnboardingApi.getStatus()).resolves.toEqual(status);
    expect(httpClient.get).toHaveBeenCalledWith(CHEF_BANK_ROUTE, {
      signal: undefined,
      dedupeKey: 'chef-bank-status',
    });
  });

  it('posts only the strict bank submission body', async () => {
    (httpClient.post as jest.Mock).mockResolvedValue(status);
    const body = buildChefBankSubmission({
      requestKey: '22222222-2222-4222-8222-222222222222',
      expectedCurrentId: null,
      accountHolderName: 'Test Chef',
      accountNumber: '001234567890',
      accountNumberConfirmation: '001234567890',
      ifsc: 'HDFC0000053',
      consent: true,
    });

    await expect(chefBankOnboardingApi.submit(body)).resolves.toEqual(status);
    expect(httpClient.post).toHaveBeenCalledWith(CHEF_BANK_ROUTE, body, {
      signal: undefined,
    });
  });
});
