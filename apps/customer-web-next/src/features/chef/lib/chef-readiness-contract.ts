import { z } from "zod";

const documentType = z.enum(["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD", "KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2", "FSSAI_LICENSE", "SELECTED_PROOF_FRONT", "SELECTED_PROOF_BACK"]);
const schema = z.object({
  contractVersion: z.literal(1),
  applicationStatus: z.enum(["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"]),
  emailStatus: z.enum(["NOT_CHECKED", "VERIFIED", "VERIFICATION_REQUIRED"]),
  approvalReady: z.boolean(),
  requiredDocumentCount: z.number().int().min(3).max(5),
  uploadedDocumentCount: z.number().int().min(0).max(5),
  approvedDocumentCount: z.number().int().min(0).max(5),
  documents: z.array(z.object({
    documentType,
    status: z.enum(["MISSING", "UPLOADED", "APPROVED", "REJECTED"]),
    rejectionReason: z.string().max(1000).nullable(),
  })).min(3).max(5),
  blockingIssues: z.array(z.object({
    code: z.enum(["APPLICATION_REQUIRED", "APPLICATION_REJECTED", "EMAIL_VERIFICATION_REQUIRED", "DOCUMENT_MISSING", "DOCUMENT_REJECTED", "DOCUMENT_AWAITING_REVIEW", "ONBOARDING_NOT_SUBMITTED"]),
    documentType: documentType.nullable(),
  })).max(9),
  evaluatedAt: z.string().datetime(),
  lastSavedAt: z.string().datetime().nullable(),
}).superRefine((value, context) => {
  const approved = value.documents.filter(document => document.status === "APPROVED").length;
  const uploaded = value.documents.filter(document => document.status !== "MISSING").length;
  if (new Set(value.documents.map(document => document.documentType)).size !== value.requiredDocumentCount || value.documents.length !== value.requiredDocumentCount
    || approved !== value.approvedDocumentCount || uploaded !== value.uploadedDocumentCount
    || value.approvalReady !== (value.applicationStatus === "PENDING" && value.emailStatus === "VERIFIED" && approved === value.requiredDocumentCount && !value.blockingIssues.some(issue => issue.code === "ONBOARDING_NOT_SUBMITTED"))
    || (value.approvalReady && value.blockingIssues.length !== 0)) {
    context.addIssue({ code: "custom", message: "Inconsistent application readiness" });
  }
});

export type ChefApplicationReadiness = z.infer<typeof schema>;

export function parseChefApplicationReadiness(value: unknown): ChefApplicationReadiness | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function chefReadinessSummary(value: ChefApplicationReadiness): string {
  if (value.applicationStatus === "APPROVED") return "Your Chef application is approved.";
  if (value.applicationStatus === "NOT_SUBMITTED") return "Submit your Chef details to begin review.";
  if (value.applicationStatus === "REJECTED") return "Review the rejection reason and resubmit your application.";
  if (value.emailStatus !== "VERIFIED") return "Verify your application email before approval.";
  if (value.approvalReady) return "All required evidence is approved. Your application is awaiting the final admin decision.";
  return `${value.approvedDocumentCount} of ${value.requiredDocumentCount} required documents approved.`;
}
