import {toAppApiError, type AppApiError} from '../../../core/http/apiError';
import type {CustomerProfileInput} from '../api/profileApi';

export type CustomerProfileField = 'firstName' | 'lastName' | 'email';
export type CustomerProfileFieldErrors = Partial<Record<CustomerProfileField, string>>;

export interface CustomerProfileSubmissionFailure {
  error: AppApiError;
  fieldErrors: CustomerProfileFieldErrors;
}

export function normalizeCustomerProfileInput(values: {
  firstName: string;
  lastName: string;
  email: string;
}): CustomerProfileInput {
  const email = values.email.trim().toLowerCase();
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    ...(email ? {email} : {}),
  };
}

function fieldFromValidationDetail(detail: string): CustomerProfileField | null {
  const separatorIndex = detail.indexOf(':');
  const field = (separatorIndex >= 0 ? detail.slice(0, separatorIndex) : detail).trim();
  if (field === 'firstName' || field === 'lastName' || field === 'email') {
    return field;
  }
  return null;
}

function fieldMessage(field: CustomerProfileField): string {
  if (field === 'firstName') {
    return 'Check your first name and try again.';
  }
  if (field === 'lastName') {
    return 'Check your last name and try again.';
  }
  return 'Enter a valid email address.';
}

export function mapCustomerProfileSubmissionFailure(
  cause: unknown,
): CustomerProfileSubmissionFailure {
  const error = toAppApiError(cause);
  const fieldErrors: CustomerProfileFieldErrors = {};

  if (error.code === 'VALIDATION_FAILED') {
    for (const detail of error.details) {
      const field = fieldFromValidationDetail(detail);
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = fieldMessage(field);
      }
    }
  }

  return {error, fieldErrors};
}
