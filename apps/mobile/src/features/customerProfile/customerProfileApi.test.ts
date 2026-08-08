import {httpClient} from '../../core/http/httpClient';
import {
  CUSTOMER_PROFILE_PATH,
  CustomerProfileContractError,
  customerProfileApi,
  parseCustomerProfileResponse,
} from './api/customerProfileApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const putMock = httpClient.put as jest.Mock;

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    identityId: '22222222-2222-4222-8222-222222222222',
    registeredPhoneNumber: '+919876543210',
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha@example.test',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-08T10:00:00Z',
    ...overrides,
  };
}

describe('customer profile API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('uses only the approved customer profile GET route', async () => {
    getMock.mockResolvedValueOnce(profile());

    await customerProfileApi.getProfile();

    expect(getMock).toHaveBeenCalledWith(CUSTOMER_PROFILE_PATH, {
      signal: undefined,
      dedupeKey: 'customer-profile:summary',
    });
  });

  it('uses the approved PUT route and exact request model for profile changes', async () => {
    putMock.mockResolvedValueOnce(profile({firstName: 'Anika'}));
    const request = {
      firstName: 'Anika',
      lastName: 'Rao',
      email: 'asha@example.test',
    };

    const result = await customerProfileApi.updateProfile(request);

    expect(putMock).toHaveBeenCalledWith(CUSTOMER_PROFILE_PATH, request);
    expect(result.profile.firstName).toBe('Anika');
  });

  it('maps an empty source response to the explicit empty posture for reads', () => {
    expect(parseCustomerProfileResponse(null)).toBeNull();
  });

  it('rejects malformed profile responses instead of filling missing backend fields', () => {
    expect(() =>
      parseCustomerProfileResponse(profile({id: 'not-a-uuid'})),
    ).toThrow(CustomerProfileContractError);
  });

  it('rejects an empty update response instead of treating the mutation as successful', async () => {
    putMock.mockResolvedValueOnce(null);

    await expect(
      customerProfileApi.updateProfile({
        firstName: 'Asha',
        lastName: 'Rao',
        email: null,
      }),
    ).rejects.toBeInstanceOf(CustomerProfileContractError);
  });

  it('does not infer rewards from missing backend reward fields', () => {
    const result = parseCustomerProfileResponse(profile());

    expect(result?.rewards.availability).toBe('unsupported');
    expect(result?.rewards.balance).toBeNull();
    expect(result?.rewards.history.entries).toEqual([]);
  });
});
