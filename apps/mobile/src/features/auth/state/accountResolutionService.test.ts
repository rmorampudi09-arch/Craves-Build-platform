import {AppApiError} from '../../../core/http/apiError';
import {authApi} from '../api/authApi';
import {profileApi} from '../api/profileApi';
import type {
  ChefApplication,
  ChefApplicationStatus,
  CustomerProfile,
  Identity,
} from '../domain/types';
import {accountResolutionService} from './accountResolutionService';

jest.mock('../api/authApi', () => ({
  authApi: {
    exchangeFirebaseToken: jest.fn(),
    me: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('../api/profileApi', () => ({
  profileApi: {
    getCustomerProfile: jest.fn(),
    saveCustomerProfile: jest.fn(),
    getChefApplication: jest.fn(),
    submitChefApplication: jest.fn(),
  },
}));

const meMock = authApi.me as jest.Mock;
const customerProfileMock = profileApi.getCustomerProfile as jest.Mock;
const chefApplicationMock = profileApi.getChefApplication as jest.Mock;

function identity(roles: Identity['roles'] = ['CUSTOMER']): Identity {
  return {
    id: 'identity-1',
    firebaseUid: 'firebase-1',
    phoneNumber: '+919876543210',
    email: 'person@example.com',
    emailVerified: true,
    displayName: 'Person',
    status: 'ACTIVE',
    roles,
    lastLoginAt: null,
  };
}

function customerProfile(): CustomerProfile {
  return {
    id: 'profile-1',
    identityId: 'identity-1',
    registeredPhoneNumber: '+919876543210',
    firstName: 'Craves',
    lastName: 'Customer',
    email: 'person@example.com',
    createdAt: '2026-08-08T00:00:00Z',
    updatedAt: '2026-08-08T00:00:00Z',
  };
}

function chefApplication(status: ChefApplicationStatus): ChefApplication {
  return {
    id: status === 'NOT_SUBMITTED' ? null : 'application-1',
    identityId: 'identity-1',
    phoneNumber: '+919876543210',
    email: 'person@example.com',
    firstName: null,
    lastName: null,
    addressLine1: null,
    addressLine2: null,
    landmark: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    status,
    rejectionReason: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedByIdentityId: null,
    documents: [],
  };
}

describe('P21 account resolution', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('uses /me role authority and an existing profile for a ready Customer account', async () => {
    const authoritativeIdentity = identity(['CUSTOMER']);
    meMock.mockResolvedValue(authoritativeIdentity);
    customerProfileMock.mockResolvedValue(customerProfile());

    await expect(accountResolutionService.resolve('CUSTOMER')).resolves.toEqual({
      identity: authoritativeIdentity,
      resolution: {
        flow: 'CUSTOMER',
        requestedRole: 'CUSTOMER',
        authorizedRole: 'CUSTOMER',
        onboardingStatus: 'READY',
      },
    });

    expect(meMock).toHaveBeenCalledTimes(1);
    expect(customerProfileMock).toHaveBeenCalledTimes(1);
    expect(chefApplicationMock).not.toHaveBeenCalled();
  });

  it('maps the exact missing-profile contract to Customer profile completion', async () => {
    meMock.mockResolvedValue(identity(['CUSTOMER']));
    customerProfileMock.mockRejectedValue(
      new AppApiError(
        'CUSTOMER_PROFILE_NOT_FOUND',
        'Customer profile has not been created yet',
        404,
      ),
    );

    await expect(accountResolutionService.resolve('CUSTOMER')).resolves.toMatchObject({
      resolution: {
        flow: 'CUSTOMER',
        authorizedRole: 'CUSTOMER',
        onboardingStatus: 'PROFILE_REQUIRED',
      },
    });
  });

  it('keeps a Customer-only identity in Chef onboarding instead of granting Chef access', async () => {
    meMock.mockResolvedValue(identity(['CUSTOMER']));
    chefApplicationMock.mockResolvedValue(chefApplication('PENDING'));

    await expect(accountResolutionService.resolve('CHEF')).resolves.toMatchObject({
      resolution: {
        flow: 'CHEF_ONBOARDING',
        requestedRole: 'CHEF',
        authorizedRole: 'CUSTOMER',
        onboardingStatus: 'PENDING',
      },
    });
  });

  it('grants the Chef flow only when /me contains CHEF and the application is approved', async () => {
    const authoritativeIdentity = identity(['CUSTOMER', 'CHEF']);
    meMock.mockResolvedValue(authoritativeIdentity);
    chefApplicationMock.mockResolvedValue(chefApplication('APPROVED'));

    await expect(accountResolutionService.resolve('CHEF')).resolves.toEqual({
      identity: authoritativeIdentity,
      resolution: {
        flow: 'CHEF',
        requestedRole: 'CHEF',
        authorizedRole: 'CHEF',
        onboardingStatus: 'APPROVED',
      },
    });
  });

  it('fails closed when Chef application status and backend role authority disagree', async () => {
    meMock.mockResolvedValue(identity(['CUSTOMER']));
    chefApplicationMock.mockResolvedValue(chefApplication('APPROVED'));

    await expect(accountResolutionService.resolve('CHEF')).rejects.toMatchObject({
      code: 'CHEF_AUTHORIZATION_STATUS_MISMATCH',
      status: 409,
    });
  });

  it('does not trust the Customer selection when /me lacks the Customer role', async () => {
    meMock.mockResolvedValue(identity(['ADMIN']));

    await expect(accountResolutionService.resolve('CUSTOMER')).rejects.toMatchObject({
      code: 'ACCOUNT_ROLE_NOT_AUTHORIZED',
      status: 403,
    });

    expect(customerProfileMock).not.toHaveBeenCalled();
  });
});
