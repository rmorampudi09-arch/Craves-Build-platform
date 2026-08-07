import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {authApi} from '../api/authApi';
import {profileApi} from '../api/profileApi';
import type {AccountResolution, AuthRole, Identity} from '../domain/types';

export interface AccountResolutionResult {
  identity: Identity;
  resolution: AccountResolution;
}

function requireRole(identity: Identity, role: 'CUSTOMER' | 'CHEF'): void {
  if (!identity.roles.includes(role)) {
    throw new AppApiError(
      'ACCOUNT_ROLE_NOT_AUTHORIZED',
      'This Craves role is not authorized for your account.',
      403,
    );
  }
}

function requireActiveIdentity(identity: Identity): void {
  if (identity.status !== 'ACTIVE') {
    throw new AppApiError(
      'IDENTITY_NOT_ACTIVE',
      'This Craves account is not currently active.',
      403,
    );
  }
}

async function resolveCustomer(identity: Identity): Promise<AccountResolution> {
  requireRole(identity, 'CUSTOMER');

  try {
    await profileApi.getCustomerProfile();
    return {
      flow: 'CUSTOMER',
      requestedRole: 'CUSTOMER',
      authorizedRole: 'CUSTOMER',
      onboardingStatus: 'READY',
    };
  } catch (error) {
    const apiError = toAppApiError(error);
    if (apiError.status === 404 && apiError.code === 'CUSTOMER_PROFILE_NOT_FOUND') {
      return {
        flow: 'CUSTOMER',
        requestedRole: 'CUSTOMER',
        authorizedRole: 'CUSTOMER',
        onboardingStatus: 'PROFILE_REQUIRED',
      };
    }
    throw apiError;
  }
}

async function resolveChef(identity: Identity): Promise<AccountResolution> {
  requireRole(identity, 'CUSTOMER');
  const application = await profileApi.getChefApplication();
  const hasChefRole = identity.roles.includes('CHEF');

  if (application.status === 'APPROVED') {
    if (!hasChefRole) {
      throw new AppApiError(
        'CHEF_AUTHORIZATION_STATUS_MISMATCH',
        'We could not verify your Chef access. Please try again or contact Craves support.',
        409,
      );
    }

    requireRole(identity, 'CHEF');
    return {
      flow: 'CHEF',
      requestedRole: 'CHEF',
      authorizedRole: 'CHEF',
      onboardingStatus: 'APPROVED',
    };
  }

  if (hasChefRole) {
    throw new AppApiError(
      'CHEF_AUTHORIZATION_STATUS_MISMATCH',
      'We could not verify your Chef access. Please try again or contact Craves support.',
      409,
    );
  }

  return {
    flow: 'CHEF_ONBOARDING',
    requestedRole: 'CHEF',
    authorizedRole: 'CUSTOMER',
    onboardingStatus: application.status,
  };
}

export const accountResolutionService = {
  async resolve(requestedRole: AuthRole): Promise<AccountResolutionResult> {
    const identity = await authApi.me();
    requireActiveIdentity(identity);

    const resolution =
      requestedRole === 'CHEF'
        ? await resolveChef(identity)
        : await resolveCustomer(identity);

    return {identity, resolution};
  },
};
