import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {authApi} from '../api/authApi';
import {profileApi} from '../api/profileApi';
import {sessionManager} from '../api/sessionManager';
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

  if (application.identityId !== identity.id) {
    throw new AppApiError(
      'CHEF_APPLICATION_OWNER_MISMATCH',
      'We could not confirm your Chef application. Please try again.',
      409,
    );
  }

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

  // A role alone never opens Chef mode or prevents the owner from applying.
  return {
    flow: 'CHEF_ONBOARDING',
    requestedRole: 'CHEF',
    authorizedRole: 'CUSTOMER',
    onboardingStatus: application.status,
  };
}

/** True when the sign-in pass was renewed; a failed renewal keeps the original error. */
async function renewSignInPass(): Promise<boolean> {
  try {
    return Boolean(await sessionManager.refresh());
  } catch {
    return false;
  }
}

export const accountResolutionService = {
  async resolve(requestedRole: AuthRole, renewed = false): Promise<AccountResolutionResult> {
    const identity = await authApi.me();
    requireActiveIdentity(identity);

    try {
      const resolution =
        requestedRole === 'CHEF'
          ? await resolveChef(identity)
          : await resolveCustomer(identity);

      return {identity, resolution};
    } catch (error) {
      // A pass signed before approval has no CHEF role yet; a renewed one carries it (as on the website).
      if (
        renewed ||
        !(error instanceof AppApiError && error.code === 'CHEF_AUTHORIZATION_STATUS_MISMATCH') ||
        !(await renewSignInPass())
      ) {
        throw error;
      }
      return accountResolutionService.resolve(requestedRole, true);
    }
  },
};
