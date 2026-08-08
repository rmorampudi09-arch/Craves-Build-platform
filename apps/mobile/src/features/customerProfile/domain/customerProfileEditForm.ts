import type {CustomerProfileIdentity} from './customerProfileContract';

export const CUSTOMER_PROFILE_AVATAR_CONTRACT_UNAVAILABLE_REASON =
  'avatar-contract-not-exposed-by-approved-backend' as const;

export const customerProfileFieldSchema = {
  firstName: {required: true, maxLength: 100},
  lastName: {required: true, maxLength: 100},
  email: {required: false, maxLength: 255},
} as const;

export type CustomerProfileEditableField = keyof typeof customerProfileFieldSchema;

export type CustomerProfileEditDraft = Readonly<{
  firstName: string;
  lastName: string;
  email: string;
}>;

export type CustomerProfileDirtyFields = Readonly<
  Record<CustomerProfileEditableField, boolean>
>;

export type CustomerProfileFieldErrors = Readonly<
  Partial<Record<CustomerProfileEditableField, string>>
>;

export type CustomerProfileUpdateRequest = Readonly<{
  firstName: string;
  lastName: string;
  email: string | null;
}>;

export type CustomerProfileEditFormState = Readonly<{
  original: CustomerProfileEditDraft;
  draft: CustomerProfileEditDraft;
  dirtyFields: CustomerProfileDirtyFields;
  fieldErrors: CustomerProfileFieldErrors;
  formError: string | null;
}>;

export type CustomerProfileServerFailure = Readonly<{
  code: string;
  message: string;
  details?: readonly string[];
}>;

export type CustomerProfileServerValidation = Readonly<{
  fieldErrors: CustomerProfileFieldErrors;
  formError: string | null;
}>;

export type CustomerProfileAvatarValidation = Readonly<{
  status: 'unsupported';
  reason: typeof CUSTOMER_PROFILE_AVATAR_CONTRACT_UNAVAILABLE_REASON;
}>;

export type CustomerProfileSavePlan =
  | Readonly<{
      status: 'unchanged';
      dirtyFields: CustomerProfileDirtyFields;
    }>
  | Readonly<{
      status: 'invalid';
      dirtyFields: CustomerProfileDirtyFields;
      fieldErrors: CustomerProfileFieldErrors;
    }>
  | Readonly<{
      status: 'ready';
      dirtyFields: CustomerProfileDirtyFields;
      request: CustomerProfileUpdateRequest;
      requestMode: 'full-put';
    }>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EDITABLE_FIELDS: readonly CustomerProfileEditableField[] = [
  'firstName',
  'lastName',
  'email',
];

function normalizedValue(
  field: CustomerProfileEditableField,
  value: string,
): string {
  const trimmed = value.trim();
  return field === 'email' ? trimmed.toLowerCase() : trimmed;
}

function normalizedDraft(draft: CustomerProfileEditDraft): CustomerProfileEditDraft {
  return {
    firstName: normalizedValue('firstName', draft.firstName),
    lastName: normalizedValue('lastName', draft.lastName),
    email: normalizedValue('email', draft.email),
  };
}

export function createCustomerProfileEditDraft(
  profile: CustomerProfileIdentity,
): CustomerProfileEditDraft {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    email: profile.email ?? '',
  };
}

export function getCustomerProfileDirtyFields(
  original: CustomerProfileEditDraft,
  draft: CustomerProfileEditDraft,
): CustomerProfileDirtyFields {
  const normalizedOriginal = normalizedDraft(original);
  const normalizedCurrent = normalizedDraft(draft);
  return {
    firstName: normalizedOriginal.firstName !== normalizedCurrent.firstName,
    lastName: normalizedOriginal.lastName !== normalizedCurrent.lastName,
    email: normalizedOriginal.email !== normalizedCurrent.email,
  };
}

export function hasCustomerProfileDirtyFields(
  dirtyFields: CustomerProfileDirtyFields,
): boolean {
  return EDITABLE_FIELDS.some(field => dirtyFields[field]);
}

export function validateCustomerProfileDraft(
  draft: CustomerProfileEditDraft,
): CustomerProfileFieldErrors {
  const normalized = normalizedDraft(draft);
  const errors: Partial<Record<CustomerProfileEditableField, string>> = {};

  if (!normalized.firstName) {
    errors.firstName = 'Enter your first name.';
  } else if (normalized.firstName.length > customerProfileFieldSchema.firstName.maxLength) {
    errors.firstName = 'First name must be 100 characters or fewer.';
  }

  if (!normalized.lastName) {
    errors.lastName = 'Enter your last name.';
  } else if (normalized.lastName.length > customerProfileFieldSchema.lastName.maxLength) {
    errors.lastName = 'Last name must be 100 characters or fewer.';
  }

  if (normalized.email.length > customerProfileFieldSchema.email.maxLength) {
    errors.email = 'Email must be 255 characters or fewer.';
  } else if (normalized.email && !EMAIL_PATTERN.test(normalized.email)) {
    errors.email = 'Enter a valid email address or leave it blank.';
  }

  return errors;
}

export function createCustomerProfileEditFormState(
  profile: CustomerProfileIdentity,
): CustomerProfileEditFormState {
  const original = createCustomerProfileEditDraft(profile);
  return {
    original,
    draft: original,
    dirtyFields: getCustomerProfileDirtyFields(original, original),
    fieldErrors: {},
    formError: null,
  };
}

export function updateCustomerProfileEditField(
  state: CustomerProfileEditFormState,
  field: CustomerProfileEditableField,
  value: string,
): CustomerProfileEditFormState {
  const draft = {...state.draft, [field]: value};
  const fieldErrors = {...state.fieldErrors};
  delete fieldErrors[field];
  return {
    ...state,
    draft,
    dirtyFields: getCustomerProfileDirtyFields(state.original, draft),
    fieldErrors,
    formError: null,
  };
}

export function createCustomerProfileSavePlan(
  state: CustomerProfileEditFormState,
): CustomerProfileSavePlan {
  const dirtyFields = getCustomerProfileDirtyFields(state.original, state.draft);
  if (!hasCustomerProfileDirtyFields(dirtyFields)) {
    return {status: 'unchanged', dirtyFields};
  }

  const fieldErrors = validateCustomerProfileDraft(state.draft);
  if (Object.keys(fieldErrors).length > 0) {
    return {status: 'invalid', dirtyFields, fieldErrors};
  }

  const normalized = normalizedDraft(state.draft);
  return {
    status: 'ready',
    dirtyFields,
    requestMode: 'full-put',
    request: {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      email: normalized.email || null,
    },
  };
}

export function applyCustomerProfileLocalValidation(
  state: CustomerProfileEditFormState,
): CustomerProfileEditFormState {
  return {
    ...state,
    fieldErrors: validateCustomerProfileDraft(state.draft),
    formError: null,
  };
}

export function mapCustomerProfileServerValidation(
  failure: CustomerProfileServerFailure,
): CustomerProfileServerValidation {
  const errors: Partial<Record<CustomerProfileEditableField, string>> = {};
  for (const detail of failure.details ?? []) {
    const separator = detail.indexOf(':');
    const serverField = (separator >= 0 ? detail.slice(0, separator) : detail).trim();
    if (serverField === 'firstName') {
      errors.firstName = 'Check your first name and try again.';
    } else if (serverField === 'lastName') {
      errors.lastName = 'Check your last name and try again.';
    } else if (serverField === 'email') {
      errors.email = 'Enter a valid email address or leave it blank.';
    }
  }

  return {
    fieldErrors: errors,
    formError:
      Object.keys(errors).length > 0
        ? null
        : failure.message || 'Profile changes could not be saved.',
  };
}

export function applyCustomerProfileServerFailure(
  state: CustomerProfileEditFormState,
  failure: CustomerProfileServerFailure,
): CustomerProfileEditFormState {
  const mapped = mapCustomerProfileServerValidation(failure);
  return {
    ...state,
    fieldErrors: mapped.fieldErrors,
    formError: mapped.formError,
  };
}

export function applyCustomerProfileSaveSuccess(
  state: CustomerProfileEditFormState,
  profile: CustomerProfileIdentity,
): CustomerProfileEditFormState {
  const original = createCustomerProfileEditDraft(profile);
  return {
    ...state,
    original,
    draft: original,
    dirtyFields: getCustomerProfileDirtyFields(original, original),
    fieldErrors: {},
    formError: null,
  };
}

export function shouldConfirmCustomerProfileDiscard(
  state: CustomerProfileEditFormState,
): boolean {
  return hasCustomerProfileDirtyFields(
    getCustomerProfileDirtyFields(state.original, state.draft),
  );
}

export function discardCustomerProfileDraft(
  state: CustomerProfileEditFormState,
): CustomerProfileEditFormState {
  return {
    ...state,
    draft: state.original,
    dirtyFields: getCustomerProfileDirtyFields(state.original, state.original),
    fieldErrors: {},
    formError: null,
  };
}

export function validateCustomerProfileAvatarSelection(): CustomerProfileAvatarValidation {
  return {
    status: 'unsupported',
    reason: CUSTOMER_PROFILE_AVATAR_CONTRACT_UNAVAILABLE_REASON,
  };
}
