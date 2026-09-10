import {httpClient} from '../../../core/http/httpClient';
import type {ChefApplication, CustomerProfile} from '../domain/types';
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
const postMock = httpClient.post as jest.Mock;

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

const chefApplication: ChefApplication = {
  id: 'application-1',
  identityId: 'identity-1',
  phoneNumber: '+919876543210',
  email: 'chef@example.com',
  firstName: 'Asha',
  lastName: 'Rao',
  addressLine1: '12 Market Road',
  addressLine2: null,
  landmark: null,
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500001',
  latitude: null,
  longitude: null,
  status: 'PENDING',
  rejectionReason: null,
  submittedAt: '2026-08-08T00:00:00Z',
  reviewedAt: null,
  reviewedByIdentityId: null,
  documents: [],
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

describe('P23 exact Chef application contract', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('reads the current application from the exact approved route', async () => {
    getMock.mockResolvedValue(chefApplication);

    await expect(profileApi.getChefApplication()).resolves.toEqual(chefApplication);
    expect(getMock).toHaveBeenCalledWith('/api/v1/chef/application');
  });

  it('posts only the approved application request fields to the exact route', async () => {
    postMock.mockResolvedValue(chefApplication);
    const request = {
      email: 'chef@example.com',
      firstName: 'Asha',
      lastName: 'Rao',
      addressLine1: '12 Market Road',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500001',
    };

    await expect(profileApi.submitChefApplication(request)).resolves.toEqual(chefApplication);
    expect(postMock).toHaveBeenCalledWith('/api/v1/chef/application', request);
  });
});
