import { boundedFetch } from "@/lib/bounded-fetch";
import { boundBffRequest } from "@/lib/bff-request-limits";
import { isSameOrigin } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { parseChefProofDocument } from "@/lib/chef-application-contract";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "APPLICANT_PHOTO",
  "GOVERNMENT_ID_FRONT",
  "GOVERNMENT_ID_BACK",
  "TAX_ID_CARD",
  "KITCHEN_PHOTO_1",
  "KITCHEN_PHOTO_2",
  "FSSAI_LICENSE", "SELECTED_PROOF_FRONT", "SELECTED_PROOF_BACK",
]);
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// File validation and storage failures both use HTTP 400 upstream. Only expose
// these known codes and safe copy, never raw storage diagnostics or credentials.
const UPLOAD_ERRORS: Record<string, string> = {
  DOCUMENT_FILE_REQUIRED: "Choose a non-empty file to upload.",
  DOCUMENT_FILE_TOO_LARGE: "Choose a file no larger than 10 MB.",
  DOCUMENT_FILE_TYPE_NOT_ALLOWED: "Choose a JPG, PNG or PDF file.",
  APPLICANT_PHOTO_FILE_TYPE_NOT_ALLOWED: "Your applicant photo must be a JPG or PNG image.",
  DOCUMENT_CONTENT_TYPE_MISMATCH: "The file contents do not match its format. Export the original as JPG, PNG or PDF; renaming the extension is not enough.",
  DOCUMENT_FILE_SIZE_INVALID: "The complete file could not be read. Select it again and retry.",
  DOCUMENT_FILE_UNREADABLE: "The file could not be read. Select it again and retry.",
  DOCUMENT_STORE_NOT_CONFIGURED: "Craves document storage is not ready. Your file format is not the issue. Please contact support.",
  DOCUMENT_STORAGE_PRIVACY_REQUIRED: "Secure document storage is temporarily unavailable. Please try again later.",
  DOCUMENT_SIZE_LIMIT_INVALID: "Document uploads are temporarily unavailable. Please contact support.",
  DOCUMENT_UPLOAD_FAILED: "Craves could not store your document. Please try again later or contact support.",
  DOCUMENT_UPLOAD_UNAVAILABLE: "Craves document storage is temporarily unavailable. Please try again later.",
  CHEF_APPLICATION_REQUIRED: "Save your Chef application details before uploading identity documents.",
  CHEF_DOCUMENT_TYPE_NOT_ALLOWED: "Choose one of the documents required for your saved Chef application.",
  CHEF_DOCUMENT_ALREADY_APPROVED: "This document is already approved and cannot be replaced.",
  CHEF_ALREADY_APPROVED: "Your Chef application is approved, so its documents cannot be replaced.",
};

function apiBaseUrl(): string {
  const value = process.env.CRAVES_API_BASE_URL?.trim();
  if (!value?.startsWith("https://"))
    throw new Error("CRAVES_API_BASE_URL must use HTTPS");
  return value.replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  if (!isSameOrigin(request))
    return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token)
    return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const documentType = form?.get("documentType");
  const file = form?.get("file");
  if (typeof documentType !== "string" || !ALLOWED_TYPES.has(documentType) || !(file instanceof File)) {
    return NextResponse.json({ code: "INVALID_PROOF_FILE_REQUEST" }, { status: 400 });
  }
  if (!ALLOWED_CONTENT_TYPES.has(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ code: "INVALID_PROOF_FILE" }, { status: 400 });
  }
  if (["APPLICANT_PHOTO", "KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2"].includes(documentType) && !PHOTO_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json({ code: "INVALID_APPLICANT_PHOTO" }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.set("file", file, file.name);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await boundedFetch(
      `${apiBaseUrl()}/chef/application/proof-files?documentType=${encodeURIComponent(documentType)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: upstreamForm,
        cache: "no-store",
        signal: controller.signal,
      }, 40_000
    );
    if (!upstream.ok) {
      const upstreamError = await upstream.json().catch(() => null) as { code?: unknown } | null;
      const knownCode = typeof upstreamError?.code === "string" && Object.hasOwn(UPLOAD_ERRORS, upstreamError.code)
        ? upstreamError.code : null;
      console.warn("CHEF_PROOF_UPLOAD_REJECTED", { status: upstream.status, code: knownCode ?? "UNKNOWN_UPSTREAM_ERROR" });
      const response = NextResponse.json(
        {
          code: upstream.status === 401
            ? "SESSION_EXPIRED"
            : knownCode ?? "PROOF_FILE_UPLOAD_FAILED",
          message: upstream.status === 401
            ? "Your session expired. Sign in again."
            : knownCode
              ? UPLOAD_ERRORS[knownCode]
              : upstream.status === 400
                ? "The upload could not be accepted. Please try again or contact support if it continues."
                : upstream.status === 409
                  ? "This document cannot be replaced in its current review state."
                  : "Proof upload is temporarily unavailable.",
        },
        { status: upstream.status },
      );
      if (upstream.status === 401) response.cookies.delete("craves_access_token");
      return response;
    }
    const document = parseChefProofDocument(await upstream.json().catch(() => null));
    if (!document) return NextResponse.json({ code: "INVALID_PROOF_FILE_RESPONSE" }, { status: 502 });
    const response = NextResponse.json(document);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { code: timedOut ? "PROOF_FILE_TIMEOUT" : "PROOF_FILE_UNAVAILABLE" },
      { status: timedOut ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
