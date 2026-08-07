import {httpClient} from '../../../core/http/httpClient';
import type {CustomerProfile} from '../domain/types';
import {profileApi} from './profileApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const putMock = httpClient.put as jest.Mock;

const profile: CustomerProfile = {
  id: 'profile-1',
  identityId: 'identity-1',
  registeredPhoneNumber: '+919876543210',
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.com',
  createdAt: '2026-08-08T00:00:00Z',
  updatedAt: '2026-08-08T00:00:00Z',
};

describe('P22 exact customer profile contract', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('reads the exact approved customer profile route', async () => {
    getMock.mockResolvedValue(profile);

    await expect(profileApi.getCustomerProfile()).resolves.toEqual(profile);
    expect(getMock).toHaveBeenCalledWith('/api/v1/customer/profile');
  });

  it('puts only the approved profile request fields and returns the exact response model', async () => {
    putMock.mockResolvedValue(profile);
    const request = {
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.com',
    };

    await expect(profileApi.saveCustomerProfile(request)).resolves.toEqual(profile);
    expect(putMock).toHaveBeenCalledWith('/api/v1/customer/profile', request);
  });
});
