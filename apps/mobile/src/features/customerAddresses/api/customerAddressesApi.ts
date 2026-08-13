import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {
  parseCustomerAddress,
  type CustomerAddress,
  type CustomerAddressCreateRequest,
  type CustomerAddressUpdateRequest,
} from '../domain/customerAddressContract';

export const CUSTOMER_ADDRESSES_PATH = '/api/v1/customer/addresses';

export interface CustomerLocationRecommendation {
  locationType: 'SAVED_ADDRESS' | 'LIVE_GPS';
  latitude: number;
  longitude: number;
  selectedSavedAddress: CustomerAddress | null;
  distanceMeters: number | null;
  matchRadiusMeters: number;
}

export interface ReverseGeocodedCustomerAddress {
  formattedAddress: string;
  houseNumber: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  confidence: 'High' | 'Medium' | 'Low' | null;
  preciseHouseNumber: boolean;
}

export class CustomerAddressesContractError extends Error {
  readonly code = 'invalid-response' as const;

  constructor() {
    super('Customer addresses response did not match the approved contract.');
    this.name = 'CustomerAddressesContractError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown): string | null | undefined {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim() || null;
}

function coordinate(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function addressArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  for (const key of ['addresses', 'items', 'content', 'data'] as const) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return null;
}

function responseAddress(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }
  return asRecord(record.address) ?? asRecord(record.data) ?? value;
}

function requireAddress(value: unknown): CustomerAddress {
  const address = parseCustomerAddress(responseAddress(value));
  if (!address) {
    throw new CustomerAddressesContractError();
  }
  return address;
}

export function parseCustomerAddressesResponse(value: unknown): CustomerAddress[] {
  const values = addressArray(value);
  if (!values || values.length > 100) {
    throw new CustomerAddressesContractError();
  }
  return values.map(requireAddress).filter(address => address.active);
}

function parseLocationRecommendation(value: unknown): CustomerLocationRecommendation {
  const item = asRecord(value);
  const latitude = coordinate(item?.latitude, -90, 90);
  const longitude = coordinate(item?.longitude, -180, 180);
  const selectedSavedAddress =
    item?.selectedSavedAddress == null
      ? null
      : parseCustomerAddress(item.selectedSavedAddress);
  if (
    !item ||
    (item.locationType !== 'SAVED_ADDRESS' && item.locationType !== 'LIVE_GPS') ||
    latitude === null ||
    longitude === null ||
    typeof item.matchRadiusMeters !== 'number' ||
    !Number.isInteger(item.matchRadiusMeters) ||
    item.matchRadiusMeters < 1 ||
    item.matchRadiusMeters > 100000 ||
    (item.distanceMeters != null &&
      (typeof item.distanceMeters !== 'number' || item.distanceMeters < 0)) ||
    (item.selectedSavedAddress != null && !selectedSavedAddress)
  ) {
    throw new CustomerAddressesContractError();
  }
  return {
    locationType: item.locationType,
    latitude,
    longitude,
    selectedSavedAddress,
    distanceMeters:
      typeof item.distanceMeters === 'number' ? item.distanceMeters : null,
    matchRadiusMeters: item.matchRadiusMeters,
  };
}

function parseResolvedAddress(value: unknown): ReverseGeocodedCustomerAddress {
  const item = asRecord(value);
  const formattedAddress = optionalText(item?.formattedAddress);
  const houseNumber = optionalText(item?.houseNumber);
  const street = optionalText(item?.street);
  const area = optionalText(item?.area);
  const city = optionalText(item?.city);
  const district = optionalText(item?.district);
  const state = optionalText(item?.state);
  const postalCode = optionalText(item?.postalCode);
  const country = optionalText(item?.country);
  const confidence = item?.confidence;
  if (
    !item ||
    !formattedAddress ||
    houseNumber === undefined ||
    street === undefined ||
    area === undefined ||
    city === undefined ||
    district === undefined ||
    state === undefined ||
    postalCode === undefined ||
    country === undefined ||
    (confidence != null &&
      confidence !== 'High' &&
      confidence !== 'Medium' &&
      confidence !== 'Low') ||
    typeof item.preciseHouseNumber !== 'boolean'
  ) {
    throw new CustomerAddressesContractError();
  }
  return {
    formattedAddress,
    houseNumber,
    street,
    area,
    city,
    district,
    state,
    postalCode,
    country,
    confidence:
      confidence === 'High' || confidence === 'Medium' || confidence === 'Low'
        ? confidence
        : null,
    preciseHouseNumber: item.preciseHouseNumber,
  };
}

function requireAddressId(addressId: string): void {
  if (!addressId.trim()) {
    throw new AppApiError(
      'CUSTOMER_ADDRESS_INVALID_ID',
      'This saved address could not be identified.',
    );
  }
}

async function updateCustomerAddress(
  addressId: string,
  request: CustomerAddressUpdateRequest,
): Promise<CustomerAddress> {
  requireAddressId(addressId);
  const response = await httpClient.put<unknown>(
    `${CUSTOMER_ADDRESSES_PATH}/${encodeURIComponent(addressId)}`,
    request,
  );
  const updated = requireAddress(response);
  if (updated.id !== addressId) {
    throw new CustomerAddressesContractError();
  }
  return updated;
}

export const customerAddressesApi = {
  async list(signal?: AbortSignal): Promise<CustomerAddress[]> {
    const response = await httpClient.get<unknown>(CUSTOMER_ADDRESSES_PATH, {
      signal,
      dedupeKey: 'customer-addresses:list',
    });
    return parseCustomerAddressesResponse(response);
  },

  async create(request: CustomerAddressCreateRequest): Promise<CustomerAddress> {
    const response = await httpClient.post<unknown>(CUSTOMER_ADDRESSES_PATH, request);
    return requireAddress(response);
  },

  update: updateCustomerAddress,

  async delete(addressId: string): Promise<void> {
    requireAddressId(addressId);
    await httpClient.delete<void>(
      `${CUSTOMER_ADDRESSES_PATH}/${encodeURIComponent(addressId)}`,
    );
  },

  async recommendLocation(
    latitude: number,
    longitude: number,
    matchRadiusMeters = 100,
  ): Promise<CustomerLocationRecommendation> {
    const response = await httpClient.get<unknown>(
      `${CUSTOMER_ADDRESSES_PATH}/recommendation`,
      {params: {latitude, longitude, matchRadiusMeters}},
    );
    return parseLocationRecommendation(response);
  },

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodedCustomerAddress> {
    const response = await httpClient.post<unknown>(
      `${CUSTOMER_ADDRESSES_PATH}/reverse-geocode`,
      {latitude, longitude},
    );
    return parseResolvedAddress(response);
  },
};
