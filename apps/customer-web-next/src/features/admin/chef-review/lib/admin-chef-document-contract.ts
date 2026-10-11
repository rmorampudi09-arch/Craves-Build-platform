export type AdminChefDocument = {
  id: string;
  documentType: string;
  originalFileName: string;
  fileSizeBytes: number;
  status: "UPLOADED" | "APPROVED" | "REJECTED";
  reviewReason: string | null;
  reviewedAt: string | null;
};

const DOCUMENT_STATUSES = new Set(["UPLOADED", "APPROVED", "REJECTED"]);

export function parseAdminChefDocument(value: unknown): AdminChefDocument | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.documentType !== "string" ||
    typeof raw.originalFileName !== "string" ||
    typeof raw.fileSizeBytes !== "number" ||
    typeof raw.status !== "string" ||
    !DOCUMENT_STATUSES.has(raw.status) ||
    (raw.reviewReason !== null && raw.reviewReason !== undefined && typeof raw.reviewReason !== "string") ||
    (raw.reviewedAt !== null && raw.reviewedAt !== undefined && typeof raw.reviewedAt !== "string")
  ) return null;

  return {
    id: raw.id,
    documentType: raw.documentType,
    originalFileName: raw.originalFileName,
    fileSizeBytes: raw.fileSizeBytes,
    status: raw.status as AdminChefDocument["status"],
    reviewReason: typeof raw.reviewReason === "string" ? raw.reviewReason : null,
    reviewedAt: typeof raw.reviewedAt === "string" ? raw.reviewedAt : null,
  };
}

export function parseAdminChefDocuments(value: unknown): AdminChefDocument[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const documents = value.map(parseAdminChefDocument);
  return documents.some(document => document === null) ? null : documents as AdminChefDocument[];
}
