import type {AuthRole} from './types';
import {emailLoginSchema, emailSchema} from '../../../utils/validation';

export interface EmailSignInFieldErrors {
  email?: string;
  password?: string;
}

export interface EmailSignInSubmission {
  role: AuthRole;
  email: string;
  password: string;
}

export interface EmailAuthRoleContext {
  role: AuthRole;
}

export interface EmailRequestGate {
  tryAcquire: () => boolean;
  release: () => void;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmailAddressValid(value: string): boolean {
  return emailSchema.safeParse(normalizeEmail(value)).success;
}

export function getEmailSignInFieldErrors(
  email: string,
  password: string,
): EmailSignInFieldErrors {
  const result = emailLoginSchema.safeParse({
    email: normalizeEmail(email),
    password,
  });

  if (result.success) {
    return {};
  }

  const errors: EmailSignInFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === 'email' && !errors.email) {
      errors.email = issue.message;
    }
    if (field === 'password' && !errors.password) {
      errors.password = issue.message;
    }
  }
  return errors;
}

export function createEmailSignInSubmission(
  role: AuthRole,
  email: string,
  password: string,
): EmailSignInSubmission {
  return {
    role,
    email: normalizeEmail(email),
    password,
  };
}

export function getPasswordRecoveryEmail(email: string): string | undefined {
  const normalized = normalizeEmail(email);
  return isEmailAddressValid(normalized) ? normalized : undefined;
}

export function createEmailAuthRoleContext(role: AuthRole): EmailAuthRoleContext {
  return {role};
}

export function createEmailRequestGate(): EmailRequestGate {
  let active = false;

  return {
    tryAcquire() {
      if (active) {
        return false;
      }
      active = true;
      return true;
    },
    release() {
      active = false;
    },
  };
}
