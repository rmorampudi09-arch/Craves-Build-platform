import type { MobileIdentity } from '../auth/contracts';

export function hasChefRole(identity: MobileIdentity | null | undefined): boolean {
  return identity?.roles.some(role => role.trim().toUpperCase() === 'CHEF') === true;
}

export type ChefApplicationSummary = {
  status: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  documentTypes: Array<'AADHAAR_CARD' | 'PAN_CARD'>;
};

const STATUSES = new Set(['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED']);
const DOCUMENT_TYPES = new Set(['AADHAAR_CARD', 'PAN_CARD']);

function instant(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function parseChefApplicationSummary(value: unknown): ChefApplicationSummary | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
  if (!STATUSES.has(status)) return null;
  const documents = Array.isArray(body.documents) ? body.documents : [];
  const documentTypes = documents
    .map(document => document && typeof document === 'object' ? (document as Record<string, unknown>).documentType : null)
    .filter((type): type is 'AADHAAR_CARD' | 'PAN_CARD' => typeof type === 'string' && DOCUMENT_TYPES.has(type));
  return {
    status: status as ChefApplicationSummary['status'],
    rejectionReason: typeof body.rejectionReason === 'string' && body.rejectionReason.trim() ? body.rejectionReason.trim().slice(0, 1000) : null,
    submittedAt: instant(body.submittedAt),
    reviewedAt: instant(body.reviewedAt),
    documentTypes: [...new Set(documentTypes)]
  };
}
