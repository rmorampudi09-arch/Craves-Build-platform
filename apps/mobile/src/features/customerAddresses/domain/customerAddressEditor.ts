import type {
  CustomerAddress,
  CustomerAddressLabel,
  CustomerAddressUpdateRequest,
} from './customerAddressContract';

export const CUSTOMER_ADDRESS_PINCODE_FALLBACK_COPY =
  'Confirm the pincode before saving. Current location can fill the available postal address automatically.';

export interface CustomerAddressDraft {
  addressLabel: CustomerAddressLabel | null;
  recipientName: string;
  contactPhoneNumber: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  areaName: string;
  districtName: string;
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
  | 'districtName'
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
      status: 'ready';
      request: CustomerAddressUpdateRequest;
      draft: CustomerAddressDraft;
    };

const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;

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
      districtName: '',
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
    recipientName: address.recipientName ?? '',
    contactPhoneNumber: address.contactPhoneNumber,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? '',
    landmark: address.landmark ?? '',
    areaName: address.areaName ?? '',
    districtName: address.districtName ?? '',
    city: address.city,
    state: address.state,
    postalCode: address.postalCode ?? '',
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

export function applyDetectedCustomerAddress(
  draft: CustomerAddressDraft,
  detected: {
    formattedAddress: string;
    houseNumber: string | null;
    street: string | null;
    area: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    latitude: number;
    longitude: number;
  },
): CustomerAddressDraft {
  const line1 =
    detected.houseNumber && detected.street
      ? `${detected.houseNumber}, ${detected.street}`
      : detected.houseNumber || detected.street || detected.formattedAddress;

  return {
    ...draft,
    addressLine1: line1,
    addressLine2:
      detected.houseNumber && detected.street ? draft.addressLine2 : detected.street || draft.addressLine2,
    areaName: detected.area || detected.city || draft.areaName,
    districtName: detected.district || detected.city || draft.districtName,
    city: detected.city || draft.city,
    state: detected.state || draft.state,
    postalCode: detected.postalCode || draft.postalCode,
    latitude: detected.latitude,
    longitude: detected.longitude,
  };
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
    ['addressLine1', 'Address line 1', 250, 'Enter the house, building, or street address.'],
    ['areaName', 'Area', 160, 'Enter the area or locality.'],
    ['districtName', 'District', 160, 'Enter the district.'],
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

  const phone = normalizeRequired(draft.contactPhoneNumber);
  if (phone && !PHONE_PATTERN.test(phone)) {
    errors.contactPhoneNumber = 'Enter a valid 10 to 15 digit phone number.';
  }

  if (normalizeOptional(draft.addressLine2).length > 250) {
    errors.addressLine2 = 'Address line 2 must be 250 characters or fewer.';
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

function normalizedDraft(draft: CustomerAddressDraft): CustomerAddressDraft {
  return {
    ...draft,
    recipientName: normalizeRequired(draft.recipientName),
    contactPhoneNumber: normalizeRequired(draft.contactPhoneNumber),
    addressLine1: normalizeRequired(draft.addressLine1),
    addressLine2: normalizeOptional(draft.addressLine2),
    landmark: normalizeOptional(draft.landmark),
    areaName: normalizeRequired(draft.areaName),
    districtName: normalizeRequired(draft.districtName),
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
  const draft = normalizedDraft(input);
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

  if (draft.latitude === null || draft.longitude === null) {
    return {
      status: 'invalid',
      fieldErrors: {},
      formError:
        'Use current location before saving so Craves can map the delivery point accurately.',
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
      districtName: draft.districtName || null,
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
    left.districtName !== right.districtName ||
    left.city !== right.city ||
    left.state !== right.state ||
    left.postalCode !== right.postalCode ||
    left.latitude !== right.latitude ||
    left.longitude !== right.longitude
  );
}
