export type ChefEvidenceStatus = "UPLOADED" | "APPROVED" | "REJECTED";

export type ChefEvidenceMetadata = {
  id: string;
  documentType: string;
  originalFileName: string;
  fileSizeBytes: number;
  status: ChefEvidenceStatus;
  reviewReason: string | null;
  reviewedAt: string | null;
};

const STATUSES = new Set<ChefEvidenceStatus>(["UPLOADED", "APPROVED", "REJECTED"]);

export function parseChefEvidenceMetadata(value: unknown): ChefEvidenceMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.documentType !== "string" ||
    typeof raw.originalFileName !== "string" ||
    typeof raw.fileSizeBytes !== "number" ||
    !Number.isFinite(raw.fileSizeBytes) ||
    typeof raw.status !== "string" ||
    !STATUSES.has(raw.status as ChefEvidenceStatus) ||
    (raw.reviewReason !== null && raw.reviewReason !== undefined && typeof raw.reviewReason !== "string") ||
    (raw.reviewedAt !== null && raw.reviewedAt !== undefined && typeof raw.reviewedAt !== "string")
  ) return null;

  const reviewReason = typeof raw.reviewReason === "string"
    ? raw.reviewReason.replace(/[\r\n]+/g, " ").trim().slice(0, 1000) || null
    : null;
  const reviewedAt = typeof raw.reviewedAt === "string" && !Number.isNaN(Date.parse(raw.reviewedAt))
    ? raw.reviewedAt
    : null;

  return {
    id: raw.id,
    documentType: raw.documentType,
    originalFileName: raw.originalFileName,
    fileSizeBytes: raw.fileSizeBytes,
    status: raw.status as ChefEvidenceStatus,
    reviewReason,
    reviewedAt,
  };
}

export function parseChefEvidenceList(value: unknown): ChefEvidenceMetadata[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const parsed = value.map(parseChefEvidenceMetadata);
  return parsed.some(item => item === null) ? null : parsed as ChefEvidenceMetadata[];
}
