import {toAppApiError} from '../../../core/http/apiError';

export function emailVerificationErrorMessage(
  error: unknown,
  action: 'read' | 'issue' | 'verify' | 'resend',
): string {
  const failure = toAppApiError(error);
  if (failure.code === 'EMAIL_VERIFICATION_DISABLED' || failure.status === 503 || failure.status === 404) {
    return 'Email verification isn’t available right now. You can still update your name. Please try changing your email later.';
  }
  if (failure.code === 'EMAIL_VERIFICATION_RATE_LIMITED' || failure.status === 429) {
    return 'Too many verification attempts. Wait a moment and check your email status before trying again.';
  }
  if (failure.code === 'EMAIL_REQUEST_CONFLICT' || failure.status === 409) {
    return 'Your email verification changed. Refresh its status before trying again.';
  }
  if (action === 'read') return 'We couldn’t check your email status. Check your connection and try again.';
  if (action === 'verify') return 'We couldn’t verify that code. Check the code or refresh your email status before trying again.';
  return 'We couldn’t confirm your code request. Check your email status before requesting another code.';
}
