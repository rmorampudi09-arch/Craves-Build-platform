import type {
  CustomerAddress,
  CustomerAddressLabel,
  CustomerAddressUpdateRequest,
} from './customerAddressContract';

export const CUSTOMER_ADDRESS_CREATE_CONTRACT_BLOCKER =
  'CUSTOMER_ADDRESS_CREATE_CONTRACT_UNAVAILABLE';
export const CUSTOMER_ADDRESS_PINCODE_LOOKUP_BLOCKER =
  'CUSTOMER_ADDRESS_PINCODE_LOOKUP_UNAVAILABLE';
export const CUSTOMER_ADDRESS_CURRENT_LOCATION_BLOCKER =
  'CUSTOMER_ADDRESS_CURRENT_LOCATION_UNAVAILABLE';

export const CUSTOMER_ADDRESS_CREATE_BLOCKED_COPY =
  'New-address saving is waiting for the approved create-address backend contract. Your manual entries are kept on this screen so the flow can be completed when that contract is added.';
export const CUSTOMER_ADDRESS_LOCATION_FALLBACK_COPY =
  'Current-location permission and geocoding are not wired on this branch yet. You can continue by entering the address manually.';
export const CUSTOMER_ADDRESS_PINCODE_FALLBACK_COPY =
  'City and state stay editable until an approved pincode lookup/geocode contract is available.';

export interface CustomerAddressDraft {
  addressLabel: CustomerAddressLabel | null;
  recipientName: string;
  contactPhoneNumber: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  areaName: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export type CustomerAddressTextField =
  | 'recipientName'
  | 'contactPhoneNumber'
  | 'addressLine1'
  | 'addressLine2'
  | 'landmark'
  | 'areaName'
  | 'city'
  | 'state'
  | 'postalCode';

export type CustomerAddressFieldErrors = Partial<
  Record<CustomerAddressTextField, string>
>;

export type CustomerAddressSavePlan =
  | {
      status: 'invalid';
      fieldErrors: CustomerAddressFieldErrors;
      formError: string | null;
    }
  | {
      status: 'blocked';
      blocker: typeof CUSTOMER_ADDRESS_CREATE_CONTRACT_BLOCKER;
      fieldErrors: CustomerAddressFieldErrors;
      formError: string;
    }
  | {
      status: 'ready';
      request: CustomerAddressUpdateRequest;
      draft: CustomerAddressDraft;
    };

const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

function normalizeRequired(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeOptional(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: string): string {
  return normalizeRequired(value).toLocaleLowerCase();
}

export function createCustomerAddressDraft(
  address?: CustomerAddress,
): CustomerAddressDraft {
  if (!address) {
    return {
      addressLabel: 'HOME',
      recipientName: '',
      contactPhoneNumber: '',
      addressLine1: '',
      addressLine2: '',
      landmark: '',
      areaName: '',
      city: '',
      state: '',
      postalCode: '',
      latitude: null,
      longitude: null,
      isDefault: false,
    };
  }

  return {
    addressLabel: address.addressLabel,
    recipientName: address.recipientName,
    contactPhoneNumber: address.contactPhoneNumber,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? '',
    landmark: address.landmark ?? '',
    areaName: address.areaName,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    latitude: address.latitude,
    longitude: address.longitude,
    isDefault: address.isDefault,
  };
}

export function updateCustomerAddressDraftText(
  draft: CustomerAddressDraft,
  field: CustomerAddressTextField,
  value: string,
): CustomerAddressDraft {
  return {...draft, [field]: value};
}

export function validateCustomerAddressDraft(
  draft: CustomerAddressDraft,
): CustomerAddressFieldErrors {
  const errors: CustomerAddressFieldErrors = {};

  const required: Array<
    [CustomerAddressTextField, string, number, string]
  > = [
    ['recipientName', 'Recipient name', 160, 'Enter the recipient name.'],
    ['contactPhoneNumber', 'Phone number', 32, 'Enter a contact phone number.'],
    ['addressLine1', 'Address line 1', 240, 'Enter the street/building address.'],
    ['areaName', 'Area', 160, 'Enter the area or locality.'],
    ['city', 'City', 120, 'Enter the city.'],
    ['state', 'State', 120, 'Enter the state.'],
  ];

  required.forEach(([field, label, maxLength, emptyMessage]) => {
    const value = normalizeRequired(draft[field]);
    if (!value) {
      errors[field] = emptyMessage;
    } else if (value.length > maxLength) {
      errors[field] = `${label} must be ${maxLength} characters or fewer.`;
    }
  });

  if (normalizeOptional(draft.addressLine2).length > 240) {
    errors.addressLine2 = 'Address line 2 must be 240 characters or fewer.';
  }
  if (normalizeOptional(draft.landmark).length > 240) {
    errors.landmark = 'Landmark must be 240 characters or fewer.';
  }

  const postalCode = draft.postalCode.trim();
  if (!postalCode) {
    errors.postalCode = 'Enter the pincode.';
  } else if (!PINCODE_PATTERN.test(postalCode)) {
    errors.postalCode = 'Enter a valid 6-digit pincode.';
  }

  return errors;
}

function duplicateKey(draft: CustomerAddressDraft): string {
  return [
    draft.addressLine1,
    draft.areaName,
    draft.city,
    draft.state,
    draft.postalCode,
  ]
    .map(normalizeKey)
    .join('|');
}

export function findDuplicateCustomerAddress(
  draft: CustomerAddressDraft,
  addresses: CustomerAddress[],
  editingAddressId: string | null,
): CustomerAddress | null {
  const key = duplicateKey(draft);
  return (
    addresses.find(
      address =>
        address.id !== editingAddressId &&
        duplicateKey(createCustomerAddressDraft(address)) === key,
    ) ?? null
  );
}

export function applyCustomerAddressDefaultRule(
  draft: CustomerAddressDraft,
  addresses: CustomerAddress[],
  editingAddressId: string | null,
): CustomerAddressDraft {
  if (!editingAddressId && addresses.length === 0) {
    return {...draft, isDefault: true};
  }

  const current = editingAddressId
    ? addresses.find(address => address.id === editingAddressId)
    : null;
  if (current?.isDefault) {
    return {...draft, isDefault: true};
  }

  return draft;
}

function normalizedDraft(draft: CustomerAddressDraft): CustomerAddressDraft {
  return {
    ...draft,
    recipientName: normalizeRequired(draft.recipientName),
    contactPhoneNumber: normalizeRequired(draft.contactPhoneNumber),
    addressLine1: normalizeRequired(draft.addressLine1),
    addressLine2: normalizeOptional(draft.addressLine2),
    landmark: normalizeOptional(draft.landmark),
    areaName: normalizeRequired(draft.areaName),
    city: normalizeRequired(draft.city),
    state: normalizeRequired(draft.state),
    postalCode: draft.postalCode.trim(),
  };
}

export function createCustomerAddressSavePlan(
  input: CustomerAddressDraft,
  addresses: CustomerAddress[],
  editingAddressId: string | null,
): CustomerAddressSavePlan {
  const draft = applyCustomerAddressDefaultRule(
    normalizedDraft(input),
    addresses,
    editingAddressId,
  );
  const fieldErrors = validateCustomerAddressDraft(draft);
  if (Object.keys(fieldErrors).length > 0) {
    return {status: 'invalid', fieldErrors, formError: null};
  }

  const duplicate = findDuplicateCustomerAddress(
    draft,
    addresses,
    editingAddressId,
  );
  if (duplicate) {
    return {
      status: 'invalid',
      fieldErrors: {},
      formError: 'This delivery address is already saved.',
    };
  }

  if (!editingAddressId) {
    return {
      status: 'blocked',
      blocker: CUSTOMER_ADDRESS_CREATE_CONTRACT_BLOCKER,
      fieldErrors: {},
      formError: CUSTOMER_ADDRESS_CREATE_BLOCKED_COPY,
    };
  }

  if (draft.latitude === null || draft.longitude === null) {
    return {
      status: 'invalid',
      fieldErrors: {},
      formError:
        'This saved address is missing coordinates required by the approved update contract.',
    };
  }

  return {
    status: 'ready',
    draft,
    request: {
      addressLabel: draft.addressLabel,
      recipientName: draft.recipientName,
      contactPhoneNumber: draft.contactPhoneNumber,
      addressLine1: draft.addressLine1,
      addressLine2: draft.addressLine2 || null,
      landmark: draft.landmark || null,
      areaName: draft.areaName,
      city: draft.city,
      state: draft.state,
      postalCode: draft.postalCode,
      latitude: draft.latitude,
      longitude: draft.longitude,
      isDefault: draft.isDefault,
    },
  };
}

export function isCustomerAddressDraftDirty(
  draft: CustomerAddressDraft,
  original: CustomerAddressDraft,
): boolean {
  const left = normalizedDraft(draft);
  const right = normalizedDraft(original);

  return (
    left.addressLabel !== right.addressLabel ||
    left.recipientName !== right.recipientName ||
    left.contactPhoneNumber !== right.contactPhoneNumber ||
    left.addressLine1 !== right.addressLine1 ||
    left.addressLine2 !== right.addressLine2 ||
    left.landmark !== right.landmark ||
    left.areaName !== right.areaName ||
    left.city !== right.city ||
    left.state !== right.state ||
    left.postalCode !== right.postalCode ||
    left.latitude !== right.latitude ||
    left.longitude !== right.longitude ||
    left.isDefault !== right.isDefault
  );
}
