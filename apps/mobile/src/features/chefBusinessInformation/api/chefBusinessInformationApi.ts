import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ChefBusinessVerificationStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export type ChefBusinessDocumentType = 'AADHAAR_CARD' | 'PAN_CARD';
export type ChefBusinessDocumentStatus = 'UPLOADED';
export type ChefBusinessDocumentContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png';

export interface ChefBusinessProofDocument {
  id: string;
  documentType: ChefBusinessDocumentType;
  originalFileName: string;
  contentType: ChefBusinessDocumentContentType;
  fileSizeBytes: number;
  status: ChefBusinessDocumentStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Safe mobile view of the exact User-Chef Service application response used as
 * the current verification/document source for Guide Reference 49.
 *
 * Storage locators (blobContainer/blobName), identity IDs and reviewer identity
 * IDs are validated when present in the server contract but deliberately not
 * exposed through this mobile model because the Business Information surface
 * does not require them.
 */
export interface ChefBusinessVerificationRecord {
  id: string | null;
  phoneNumber: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ChefBusinessVerificationStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  documents: ChefBusinessProofDocument[];
}

const VERIFICATION_STATUSES = new Set<ChefBusinessVerificationStatus>([
  'NOT_SUBMITTED',
  'PENDING',
  'APPROVED',
  'REJECTED',
]);
const DOCUMENT_TYPES = new Set<ChefBusinessDocumentType>([
  'AADHAAR_CARD',
  'PAN_CARD',
]);
const DOCUMENT_STATUSES = new Set<ChefBusinessDocumentStatus>(['UPLOADED']);
const DOCUMENT_CONTENT_TYPES = new Set<ChefBusinessDocumentContentType>([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized || null : undefined;
}

function timestamp(value: unknown): string | null | undefined {
  if (value == null || value === '') {
    return null;
  }
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function coordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (value == null || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

export function parseChefBusinessProofDocument(
  value: unknown,
): ChefBusinessProofDocument | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const id = requiredString(raw.id, 64);
  const documentType = requiredString(
    raw.documentType,
    40,
  ) as ChefBusinessDocumentType | null;
  const originalFileName = requiredString(raw.originalFileName, 255);
  const blobContainer = requiredString(raw.blobContainer, 100);
  const blobName = requiredString(raw.blobName, 700);
  const contentType = requiredString(
    raw.contentType,
    120,
  ) as ChefBusinessDocumentContentType | null;
  const status = requiredString(
    raw.status,
    40,
  ) as ChefBusinessDocumentStatus | null;
  const createdAt = timestamp(raw.createdAt);
  const updatedAt = timestamp(raw.updatedAt);
  const fileSizeBytes = raw.fileSizeBytes;

  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !documentType ||
    !DOCUMENT_TYPES.has(documentType) ||
    !originalFileName ||
    !blobContainer ||
    !blobName ||
    !contentType ||
    !DOCUMENT_CONTENT_TYPES.has(contentType) ||
    !status ||
    !DOCUMENT_STATUSES.has(status) ||
    typeof fileSizeBytes !== 'number' ||
    !Number.isSafeInteger(fileSizeBytes) ||
    fileSizeBytes < 1 ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    documentType,
    originalFileName,
    contentType,
    fileSizeBytes,
    status,
    createdAt,
    updatedAt,
  };
}

export function parseChefBusinessVerificationRecord(
  value: unknown,
): ChefBusinessVerificationRecord | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const identityId = requiredString(raw.identityId, 64);
  const reviewedByIdentityId = optionalString(raw.reviewedByIdentityId, 64);
  const status = requiredString(
    raw.status,
    40,
  ) as ChefBusinessVerificationStatus | null;
  const id = optionalString(raw.id, 64);
  const phoneNumber = optionalString(raw.phoneNumber, 40);
  const email = optionalString(raw.email, 320);
  const firstName = optionalString(raw.firstName, 120);
  const lastName = optionalString(raw.lastName, 120);
  const addressLine1 = optionalString(raw.addressLine1, 255);
  const addressLine2 = optionalString(raw.addressLine2, 255);
  const landmark = optionalString(raw.landmark, 255);
  const city = optionalString(raw.city, 120);
  const state = optionalString(raw.state, 120);
  const postalCode = optionalString(raw.postalCode, 20);
  const latitude = coordinate(raw.latitude, -90, 90);
  const longitude = coordinate(raw.longitude, -180, 180);
  const rejectionReason = optionalString(raw.rejectionReason, 4_000);
  const submittedAt = timestamp(raw.submittedAt);
  const reviewedAt = timestamp(raw.reviewedAt);

  if (
    !identityId ||
    !UUID_PATTERN.test(identityId) ||
    reviewedByIdentityId === undefined ||
    (reviewedByIdentityId !== null && !UUID_PATTERN.test(reviewedByIdentityId)) ||
    !status ||
    !VERIFICATION_STATUSES.has(status) ||
    id === undefined ||
    (id !== null && !UUID_PATTERN.test(id)) ||
    phoneNumber === undefined ||
    email === undefined ||
    firstName === undefined ||
    lastName === undefined ||
    addressLine1 === undefined ||
    addressLine2 === undefined ||
    landmark === undefined ||
    city === undefined ||
    state === undefined ||
    postalCode === undefined ||
    latitude === undefined ||
    longitude === undefined ||
    rejectionReason === undefined ||
    submittedAt === undefined ||
    reviewedAt === undefined ||
    !Array.isArray(raw.documents) ||
    raw.documents.length > DOCUMENT_TYPES.size
  ) {
    return null;
  }

  const documents = raw.documents.map(parseChefBusinessProofDocument);
  if (documents.some(document => document === null)) {
    return null;
  }

  const typedDocuments = documents as ChefBusinessProofDocument[];
  if (
    new Set(typedDocuments.map(document => document.documentType)).size !==
    typedDocuments.length
  ) {
    return null;
  }

  if (status === 'NOT_SUBMITTED') {
    if (
      id !== null ||
      submittedAt !== null ||
      reviewedAt !== null ||
      reviewedByIdentityId !== null ||
      rejectionReason !== null ||
      typedDocuments.length !== 0
    ) {
      return null;
    }
  } else {
    if (
      id === null ||
      phoneNumber === null ||
      email === null ||
      !EMAIL_PATTERN.test(email) ||
      firstName === null ||
      lastName === null ||
      addressLine1 === null ||
      city === null ||
      state === null ||
      submittedAt === null
    ) {
      return null;
    }

    if (
      status === 'PENDING' &&
      (reviewedAt !== null ||
        reviewedByIdentityId !== null ||
        rejectionReason !== null)
    ) {
      return null;
    }

    if (
      status === 'APPROVED' &&
      (reviewedAt === null ||
        reviewedByIdentityId === null ||
        rejectionReason !== null)
    ) {
      return null;
    }

    if (
      status === 'REJECTED' &&
      (reviewedAt === null ||
        reviewedByIdentityId === null ||
        rejectionReason === null)
    ) {
      return null;
    }
  }

  return {
    id,
    phoneNumber,
    email,
    firstName,
    lastName,
    addressLine1,
    addressLine2,
    landmark,
    city,
    state,
    postalCode,
    latitude,
    longitude,
    status,
    rejectionReason,
    submittedAt,
    reviewedAt,
    documents: typedDocuments,
  };
}

function parseVerificationResponse(value: unknown): ChefBusinessVerificationRecord {
  const parsed = parseChefBusinessVerificationRecord(value);
  if (!parsed) {
    throw new Error('Chef business verification returned an unsupported response.');
  }
  return parsed;
}

export const chefBusinessInformationApi = {
  async getVerificationRecord(
    signal?: AbortSignal,
  ): Promise<ChefBusinessVerificationRecord> {
    const response = await httpClient.get<unknown>('/api/v1/chef/application', {
      signal,
      dedupeKey: 'chef-business-information:verification',
    });
    return parseVerificationResponse(response);
  },
};
