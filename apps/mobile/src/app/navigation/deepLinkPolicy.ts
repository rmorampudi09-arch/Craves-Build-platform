import type {AuthRole} from '../../features/auth/domain/types';

export interface DeepLinkContext {
  authenticated: boolean;
  role: AuthRole | null;
}

export type AllowedDeepLinkDestination =
  | {routeName: 'RoleSelection'; params: undefined}
  | {routeName: 'PhoneSignIn'; params: {role: AuthRole}}
  | {routeName: 'EmailSignIn'; params: {role: AuthRole; email?: string}}
  | {routeName: 'ForgotPassword'; params: {role: AuthRole; email?: string}};

export interface DeepLinkCandidate {
  routeName: string;
  params?: unknown;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuthRole(value: unknown): value is AuthRole {
  return value === 'CUSTOMER' || value === 'CHEF';
}

function hasOnlyKeys(record: UnknownRecord, allowedKeys: readonly string[]): boolean {
  return Object.keys(record).every(key => allowedKeys.includes(key));
}

function readRoleParams(params: unknown): {role: AuthRole} | null {
  if (!isRecord(params) || !hasOnlyKeys(params, ['role']) || !isAuthRole(params.role)) {
    return null;
  }

  return {role: params.role};
}

function readRoleEmailParams(params: unknown): {role: AuthRole; email?: string} | null {
  if (
    !isRecord(params) ||
    !hasOnlyKeys(params, ['role', 'email']) ||
    !isAuthRole(params.role) ||
    (params.email !== undefined && typeof params.email !== 'string')
  ) {
    return null;
  }

  return params.email === undefined
    ? {role: params.role}
    : {role: params.role, email: params.email};
}

/**
 * Fail-closed boundary between an external URL/notification parser and React
 * Navigation. P11 intentionally allowlists only safe, currently implemented
 * anonymous entry routes. OTP/session/account/product routes remain blocked
 * until their owning phases add the required state/resource validation.
 */
export function parseAllowedDeepLinkDestination(
  candidate: DeepLinkCandidate,
  context: DeepLinkContext,
): AllowedDeepLinkDestination | null {
  if (context.authenticated) {
    return null;
  }

  switch (candidate.routeName) {
    case 'RoleSelection':
      if (candidate.params !== undefined) {
        return null;
      }
      return {routeName: 'RoleSelection', params: undefined};

    case 'PhoneSignIn': {
      const params = readRoleParams(candidate.params);
      return params ? {routeName: 'PhoneSignIn', params} : null;
    }

    case 'EmailSignIn': {
      const params = readRoleEmailParams(candidate.params);
      return params ? {routeName: 'EmailSignIn', params} : null;
    }

    case 'ForgotPassword': {
      const params = readRoleEmailParams(candidate.params);
      return params ? {routeName: 'ForgotPassword', params} : null;
    }

    default:
      return null;
  }
}
