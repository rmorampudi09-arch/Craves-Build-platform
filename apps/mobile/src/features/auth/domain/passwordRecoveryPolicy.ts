import type {AuthRole} from './types';
import {emailSchema} from '../../../utils/validation';
import {createEmailRequestGate, normalizeEmail} from './emailSignInPolicy';

export const PASSWORD_RECOVERY_NEUTRAL_MESSAGE =
  'If a Craves account exists for this email, we will send a secure password reset link shortly.';

export interface PasswordRecoverySubmission {
  role: AuthRole;
  email: string;
}

export interface PasswordResetSentContext extends PasswordRecoverySubmission {}

export function getPasswordRecoveryEmailError(email: string): string | undefined {
  return emailSchema.safeParse(normalizeEmail(email)).success
    ? undefined
    : 'Enter a valid email address.';
}

export function createPasswordRecoverySubmission(
  role: AuthRole,
  email: string,
): PasswordRecoverySubmission {
  return {
    role,
    email: normalizeEmail(email),
  };
}

export function createPasswordResetSentContext(
  role: AuthRole,
  email: string,
): PasswordResetSentContext {
  return createPasswordRecoverySubmission(role, email);
}

export function createPasswordRecoveryRequestGate() {
  return createEmailRequestGate();
}
