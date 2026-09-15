import {toAppApiError, type AppApiError} from '../../../core/http/apiError';
import type {ChefApplicationInput} from '../api/profileApi';
import type {ChefApplication} from './types';

export interface ChefApplicationDraft {
  email: string;
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
}

export type ChefApplicationField = keyof ChefApplicationDraft;
export type ChefApplicationFieldErrors = Partial<Record<ChefApplicationField, string>>;

export interface ChefApplicationSubmissionFailure {
  error: AppApiError;
  fieldErrors: ChefApplicationFieldErrors;
}

export function normalizeChefApplicationInput(
  values: ChefApplicationDraft,
): ChefApplicationInput {
  const addressLine2 = values.addressLine2.trim();
  const landmark = values.landmark.trim();
  const postalCode = values.postalCode.trim();

  return {
    email: values.email.trim().toLowerCase(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    addressLine1: values.addressLine1.trim(),
    ...(addressLine2 ? {addressLine2} : {}),
    ...(landmark ? {landmark} : {}),
    city: values.city.trim(),
    state: values.state.trim(),
    ...(postalCode ? {postalCode} : {}),
  };
}

export function chefApplicationToDraft(
  application: ChefApplication,
): ChefApplicationDraft {
  return {
    email: application.email ?? '',
    firstName: application.firstName ?? '',
    lastName: application.lastName ?? '',
    addressLine1: application.addressLine1 ?? '',
    addressLine2: application.addressLine2 ?? '',
    landmark: application.landmark ?? '',
    city: application.city ?? '',
    state: application.state ?? '',
    postalCode: application.postalCode ?? '',
  };
}

function fieldFromValidationDetail(detail: string): ChefApplicationField | null {
  const separatorIndex = detail.indexOf(':');
  const field = (separatorIndex >= 0 ? detail.slice(0, separatorIndex) : detail).trim();

  if (
    field === 'email' ||
    field === 'firstName' ||
    field === 'lastName' ||
    field === 'addressLine1' ||
    field === 'addressLine2' ||
    field === 'landmark' ||
    field === 'city' ||
    field === 'state' ||
    field === 'postalCode'
  ) {
    return field;
  }
  return null;
}

function fieldMessage(field: ChefApplicationField): string {
  if (field === 'email') {
    return 'Enter a valid email address.';
  }
  if (field === 'firstName') {
    return 'Check your first name and try again.';
  }
  if (field === 'lastName') {
    return 'Check your last name and try again.';
  }
  if (field === 'addressLine1') {
    return 'Check your address and try again.';
  }
  if (field === 'city') {
    return 'Check your city and try again.';
  }
  if (field === 'state') {
    return 'Check your state and try again.';
  }
  if (field === 'postalCode') {
    return 'Check your postal code and try again.';
  }
  return 'Check this field and try again.';
}

export function mapChefApplicationSubmissionFailure(
  cause: unknown,
): ChefApplicationSubmissionFailure {
  const error = toAppApiError(cause);
  const fieldErrors: ChefApplicationFieldErrors = {};

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
