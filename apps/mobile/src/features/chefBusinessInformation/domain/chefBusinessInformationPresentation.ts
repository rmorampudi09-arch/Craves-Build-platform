import type {
  ChefBusinessDocumentType,
  ChefBusinessVerificationRecord,
  ChefBusinessVerificationStatus,
} from '../api/chefBusinessInformationApi';
import type {
  ChefKitchenProfile,
  ChefKitchenStatus,
} from '../../chefProfile/api/chefProfileApi';

export type ChefBusinessInformationTone =
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral';

export interface ChefBusinessVerificationPresentation {
  title: string;
  summary: string;
  label: string;
  tone: ChefBusinessInformationTone;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function getChefBusinessVerificationPresentation(
  record: ChefBusinessVerificationRecord,
): ChefBusinessVerificationPresentation {
  switch (record.status) {
    case 'APPROVED':
      return {
        title: 'Business verification approved',
        summary:
          'Your Chef application is approved. Proof files shown below are listed exactly as the verification service currently reports them.',
        label: 'Verified',
        tone: 'success',
      };
    case 'PENDING':
      return {
        title: 'Verification under review',
        summary:
          'Your Chef application is pending review. Status remains server-authoritative while Craves waits for a decision.',
        label: 'Pending',
        tone: 'warning',
      };
    case 'REJECTED':
      return {
        title: 'Verification needs attention',
        summary:
          record.rejectionReason ??
          'Your Chef application was rejected. Review your business details before taking the next supported action.',
        label: 'Rejected',
        tone: 'error',
      };
    case 'NOT_SUBMITTED':
      return {
        title: 'Verification not submitted',
        summary:
          'No Chef application is currently available for this signed-in account.',
        label: 'Not submitted',
        tone: 'warning',
      };
  }
}

export function chefBusinessDocumentTypeLabel(
  type: ChefBusinessDocumentType,
): string {
  return type === 'AADHAAR_CARD' ? 'Aadhaar card' : 'PAN card';
}

export function chefKitchenStatusLabel(status: ChefKitchenStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'DRAFT':
      return 'Draft';
    case 'INACTIVE':
      return 'Inactive';
    case 'SUSPENDED':
      return 'Suspended';
  }
}

export function formatChefBusinessFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

export function formatChefBusinessDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatChefBusinessAddress(
  kitchen: ChefKitchenProfile,
): string {
  return [
    kitchen.addressLine1,
    kitchen.addressLine2,
    kitchen.landmark,
    kitchen.areaName,
    kitchen.city,
    kitchen.state,
    kitchen.postalCode,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(', ');
}

export function verificationStatusLabel(
  status: ChefBusinessVerificationStatus,
): string {
  switch (status) {
    case 'APPROVED':
      return 'Approved';
    case 'PENDING':
      return 'Pending';
    case 'REJECTED':
      return 'Rejected';
    case 'NOT_SUBMITTED':
      return 'Not submitted';
  }
}
