export type ChefBusinessInformationCapabilityKey =
  | 'businessProfile'
  | 'verificationStatus'
  | 'documentMetadata'
  | 'documentUploadUpdate'
  | 'documentValidityLifecycle'
  | 'serviceAreas'
  | 'cuisines'
  | 'payoutSetupStatus';

export interface ChefBusinessSupportedCapability {
  availability: 'supported';
  source: string;
  notes: readonly string[];
}

export interface ChefBusinessUnavailableCapability {
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  reason: string;
  knownBoundary?: string;
}

export type ChefBusinessInformationCapability =
  | ChefBusinessSupportedCapability
  | ChefBusinessUnavailableCapability;

export interface ChefBusinessContractSource {
  availability: 'source-only';
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  request: string;
  response: string;
  purpose: string;
  limitations: readonly string[];
}

function supported(
  source: string,
  notes: readonly string[],
): ChefBusinessSupportedCapability {
  return {availability: 'supported', source, notes};
}

function unavailable(
  reason: string,
  knownBoundary?: string,
): ChefBusinessUnavailableCapability {
  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason,
    ...(knownBoundary ? {knownBoundary} : {}),
  };
}

/**
 * Guide Reference 49 capability map at the exact currently reviewed backend
 * boundary. This intentionally distinguishes a real source from a complete
 * Business Information product capability.
 */
export const CHEF_BUSINESS_INFORMATION_CAPABILITIES = {
  businessProfile: supported('catalogKitchenProfile', [
    'GET /api/v1/kitchens/me is the current Chef-owned business/kitchen profile read.',
    'PUT /api/v1/kitchens/me is the current complete replacement/upsert contract already owned by P99.',
    'The exact model contains kitchen/contact/address/location/status fields only; it is not a separate legal-business profile contract.',
  ]),
  verificationStatus: supported('chefApplication', [
    'GET /api/v1/chef/application returns the backend-authoritative application verification status.',
    'Supported statuses are NOT_SUBMITTED, PENDING, APPROVED, and REJECTED; NOT_SUBMITTED is the service response when no application row exists.',
  ]),
  documentMetadata: supported('chefApplication', [
    'The application response contains the current proof-document metadata list.',
    'Supported proof types are AADHAAR_CARD and PAN_CARD.',
    'The current persisted document status is only UPLOADED; no client-side validity state is inferred.',
    'Mobile parsing deliberately excludes blob container/name and reviewer identity identifiers from the Business Information model.',
  ]),
  documentUploadUpdate: unavailable(
    'The existing proof-file endpoint is an onboarding/KYC upload boundary, not a complete approved-Chef business-document maintenance contract. The service rejects document changes after the application is APPROVED, so it cannot satisfy Reference 49 upload/update/resubmission behavior for an approved Chef.',
    'POST /api/v1/chef/application/proof-files accepts multipart documentType + file, supports AADHAAR_CARD/PAN_CARD, and replaces the same document type before approval.',
  ),
  documentValidityLifecycle: unavailable(
    'No exact Chef-facing contract exposes per-document verification, rejection reason, expiry date, renewal state, or resubmission lifecycle. The current database contract permits only the document status UPLOADED.',
  ),
  serviceAreas: unavailable(
    'No approved Chef service-area list, radius, polygon, lookup, selection, or serviceability-management contract was found. The kitchen profile only exposes areaName plus latitude/longitude.',
    'GET|PUT /api/v1/kitchens/me exposes areaName/coordinates but does not define service-area semantics.',
  ),
  cuisines: unavailable(
    'No approved Chef cuisine/specialty taxonomy or Chef read/write contract was found in the current backend/APIM surface.',
  ),
  payoutSetupStatus: unavailable(
    'No approved Chef payout-configuration, bank-destination, or payout-setup-status contract was found. The existing earnings ledger is financial history/reconciliation data and must not be reclassified as payout setup.',
    'GET /api/v1/chef/earnings is not a payout configuration contract.',
  ),
} as const satisfies Record<
  ChefBusinessInformationCapabilityKey,
  ChefBusinessInformationCapability
>;

export const CHEF_BUSINESS_INFORMATION_SOURCES = {
  catalogKitchenProfileRead: {
    availability: 'source-only',
    method: 'GET',
    path: '/api/v1/kitchens/me',
    request: 'none',
    response: 'KitchenProfileResponse',
    purpose: 'Chef-owned kitchen/business identity, contact, address, location, and operational status.',
    limitations: [
      'No cuisine list.',
      'No service-area collection or radius semantics.',
      'No business-document or payout-setup fields.',
    ],
  },
  catalogKitchenProfileReplace: {
    availability: 'source-only',
    method: 'PUT',
    path: '/api/v1/kitchens/me',
    request: 'KitchenProfileRequest',
    response: 'KitchenProfileResponse',
    purpose: 'Complete replacement/upsert of the current Chef-owned kitchen profile; already implemented by P99.',
    limitations: [
      'Not a PATCH contract.',
      'Does not add Guide-only cuisine, service-area, legal-document, or payout fields.',
    ],
  },
  chefApplicationRead: {
    availability: 'source-only',
    method: 'GET',
    path: '/api/v1/chef/application',
    request: 'none',
    response: 'ChefApplicationResponse',
    purpose: 'Backend-authoritative application verification status and current onboarding proof-document metadata.',
    limitations: [
      'Application status is not a per-document validity/expiry state.',
      'Response storage locators and reviewer identity are not required by the mobile Business Information surface and are excluded from its safe model.',
    ],
  },
  chefProofFileUpload: {
    availability: 'source-only',
    method: 'POST',
    path: '/api/v1/chef/application/proof-files',
    request: 'multipart/form-data: documentType + file',
    response: 'KycDocumentResponse',
    purpose: 'Existing onboarding proof upload/replacement for AADHAAR_CARD or PAN_CARD.',
    limitations: [
      'Requires an existing Chef application.',
      'APPROVED applications cannot change documents through this endpoint.',
      'Allowed server file content types are application/pdf, image/jpeg, and image/png.',
      'File-size enforcement is backend-configured; the current service default is 10 MiB, so the mobile contract does not invent a permanently fixed product limit.',
      'No expiry, rejection, renewal, or approved-Chef resubmission semantics.',
    ],
  },
} as const satisfies Record<string, ChefBusinessContractSource>;

export interface ChefBusinessInformationContractModel {
  guideReference: 49;
  status: 'partial';
  capabilities: typeof CHEF_BUSINESS_INFORMATION_CAPABILITIES;
  sources: typeof CHEF_BUSINESS_INFORMATION_SOURCES;
}

export const CHEF_BUSINESS_INFORMATION_CONTRACT_MODEL: ChefBusinessInformationContractModel = {
  guideReference: 49,
  status: 'partial',
  capabilities: CHEF_BUSINESS_INFORMATION_CAPABILITIES,
  sources: CHEF_BUSINESS_INFORMATION_SOURCES,
};

export function getUnavailableChefBusinessInformationCapabilities(): ChefBusinessInformationCapabilityKey[] {
  return (
    Object.keys(
      CHEF_BUSINESS_INFORMATION_CAPABILITIES,
    ) as ChefBusinessInformationCapabilityKey[]
  ).filter(
    key => CHEF_BUSINESS_INFORMATION_CAPABILITIES[key].availability === 'unavailable',
  );
}

export function hasCompleteChefBusinessInformationContract(): boolean {
  return getUnavailableChefBusinessInformationCapabilities().length === 0;
}
