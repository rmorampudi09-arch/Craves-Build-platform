"use client";

import { CheckCircle2, CircleAlert, FileUp, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseChefEvidenceMetadata,
  type ChefEvidenceMetadata,
} from "@/lib/chef-application-evidence-contract";

type EvidenceType =
  | "APPLICANT_PHOTO"
  | "GOVERNMENT_ID_FRONT"
  | "GOVERNMENT_ID_BACK"
  | "TAX_ID_CARD";

type ProgressState = {
  progress: number;
  phase: "IDLE" | "UPLOADING" | "SECURING" | "DONE" | "ERROR";
  message: string;
};

const REQUIREMENTS: Array<{
  type: EvidenceType;
  title: string;
  helper: string;
  accept: string;
}> = [
  {
    type: "APPLICANT_PHOTO",
    title: "Applicant photograph",
    helper: "Upload a recent passport-size or clear passport-style portrait. JPG or PNG only.",
    accept: "image/jpeg,image/png",
  },
  {
    type: "GOVERNMENT_ID_FRONT",
    title: "Government photo ID — front",
    helper: "Upload the front side of the government photo ID used for the application. A masked copy is preferred when suitable.",
    accept: "application/pdf,image/jpeg,image/png",
  },
  {
    type: "GOVERNMENT_ID_BACK",
    title: "Government photo ID — back",
    helper: "Upload the reverse side showing the address/details required for the application.",
    accept: "application/pdf,image/jpeg,image/png",
  },
  {
    type: "TAX_ID_CARD",
    title: "PAN / tax ID card",
    helper: "Upload the applicant's PAN/tax-ID card as PDF, JPG or PNG.",
    accept: "application/pdf,image/jpeg,image/png",
  },
];

const INITIAL_PROGRESS: ProgressState = { progress: 0, phase: "IDLE", message: "" };

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(document: ChefEvidenceMetadata | undefined): string {
  if (!document) return "Required";
  if (document.status === "APPROVED") return "Approved ✓";
  if (document.status === "REJECTED") return "Replacement required";
  return "Under review";
}

function statusClasses(document: ChefEvidenceMetadata | undefined): string {
  if (!document) return "bg-slate-50 text-slate-700";
  if (document.status === "APPROVED") return "bg-emerald-50 text-emerald-800";
  if (document.status === "REJECTED") return "bg-red-50 text-red-800";
  return "bg-slate-50 text-primary";
}

export function ChefApplicationEvidenceUploader({
  applicationReady,
  locked,
  initialDocuments,
  onComplete,
}: {
  applicationReady: boolean;
  locked: boolean;
  initialDocuments: ChefEvidenceMetadata[];
  onComplete?: () => void;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState<ChefEvidenceMetadata[]>(initialDocuments);
  const [files, setFiles] = useState<Partial<Record<EvidenceType, File>>>({});
  const [progress, setProgress] = useState<Partial<Record<EvidenceType, ProgressState>>>({});
  const requestRefs = useRef<Partial<Record<EvidenceType, XMLHttpRequest>>>({});

  useEffect(() => {
    const requests = requestRefs.current;
    return () => {
      for (const xhr of Object.values(requests)) {
        if (!xhr) continue;
        xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
        xhr.upload.onprogress = null;
        xhr.abort();
      }
    };
  }, []);

  const uploadedByType = useMemo(
    () => new Map(documents.map(document => [document.documentType, document])),
    [documents],
  );
  const uploadedCount = REQUIREMENTS.filter(item => uploadedByType.has(item.type)).length;
  const approvedCount = REQUIREMENTS.filter(item => uploadedByType.get(item.type)?.status === "APPROVED").length;
  const rejectedCount = REQUIREMENTS.filter(item => uploadedByType.get(item.type)?.status === "REJECTED").length;
  const awaitingReviewCount = REQUIREMENTS.filter(item => uploadedByType.get(item.type)?.status === "UPLOADED").length;
  const approvalProgress = Math.round((approvedCount / REQUIREMENTS.length) * 100);
  const incompleteApprovedHistory = locked && approvedCount < REQUIREMENTS.length;

  useEffect(() => {
    if (
      onComplete &&
      applicationReady &&
      !locked &&
      uploadedCount === REQUIREMENTS.length &&
      rejectedCount === 0
    ) {
      onComplete();
    }
  }, [applicationReady, locked, onComplete, rejectedCount, uploadedCount]);

  function stateFor(type: EvidenceType): ProgressState {
    return progress[type] ?? INITIAL_PROGRESS;
  }

  function setTypeProgress(type: EvidenceType, next: ProgressState) {
    setProgress(current => ({ ...current, [type]: next }));
  }

  function chooseFile(type: EvidenceType, file: File | null) {
    setFiles(current => {
      const next = { ...current };
      if (file) next[type] = file;
      else delete next[type];
      return next;
    });
    setTypeProgress(type, INITIAL_PROGRESS);
  }

  function upload(type: EvidenceType) {
    const file = files[type];
    const existing = uploadedByType.get(type);
    if (!file) {
      setTypeProgress(type, { progress: 0, phase: "ERROR", message: "Choose a file first." });
      return;
    }
    if (!applicationReady || locked || existing?.status === "APPROVED") return;
    const accepted = REQUIREMENTS.find(item => item.type === type)?.accept.split(",") ?? [];
    if (file.size <= 0 || file.size > 10_000_000 || !accepted.includes(file.type)) {
      setTypeProgress(type, { progress: 0, phase: "ERROR", message: "Choose a supported file up to 10 MB. Photos must be JPG or PNG." });
      return;
    }

    requestRefs.current[type]?.abort();
    const data = new FormData();
    data.set("documentType", type);
    data.set("file", file);

    const xhr = new XMLHttpRequest();
    requestRefs.current[type] = xhr;
    xhr.open("POST", "/api/chef/application/proof-files", true);
    xhr.responseType = "json";
    xhr.withCredentials = true;
    xhr.timeout = 60_000;

    setTypeProgress(type, { progress: 0, phase: "UPLOADING", message: existing?.status === "REJECTED" ? "Uploading replacement…" : "Starting secure upload…" });

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      const value = Math.min(100, Math.round((event.loaded / event.total) * 100));
      setTypeProgress(type, {
        progress: value,
        phase: value >= 100 ? "SECURING" : "UPLOADING",
        message: value >= 100 ? "100% transferred · securing document…" : `Uploading · ${value}%`,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const uploaded = parseChefEvidenceMetadata(xhr.response);
        if (!uploaded) {
          setTypeProgress(type, { progress: 100, phase: "ERROR", message: "Upload completed but the response could not be verified." });
          return;
        }
        setDocuments(current => [
          ...current.filter(document => document.documentType !== type),
          uploaded,
        ]);
        setFiles(current => {
          const next = { ...current };
          delete next[type];
          return next;
        });
        setTypeProgress(type, { progress: 100, phase: "DONE", message: existing?.status === "REJECTED" ? "Replacement uploaded. This document is back under review ✓" : "Uploaded securely. Awaiting document review ✓" });
        router.refresh();
        return;
      }
      const body = xhr.response as { message?: unknown; code?: unknown } | null;
      setTypeProgress(type, {
        progress: 0,
        phase: "ERROR",
        message: body?.code === "CHEF_DOCUMENT_ALREADY_APPROVED"
          ? "This document has already been approved and cannot be replaced."
          : typeof body?.message === "string"
            ? body.message
            : "Upload failed. Check the file and try again.",
      });
    };

    xhr.onerror = () => setTypeProgress(type, { progress: 0, phase: "ERROR", message: "Network error during upload. Try again." });
    xhr.ontimeout = () => setTypeProgress(type, { progress: 0, phase: "ERROR", message: "We couldn’t confirm this upload in time. Refresh your document history before trying again." });
    xhr.onabort = () => setTypeProgress(type, { progress: 0, phase: "IDLE", message: "Upload cancelled." });
    xhr.send(data);
  }

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-6 text-slate-950 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Chef application documents</p>
          <h2 className="mt-2 text-2xl font-bold">Document review status</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {locked ? "Your application is approved. The available document history is shown below." : "Each file is reviewed independently. If a document needs replacing, your other approved documents stay accepted."}
          </p>
        </div>
        {!incompleteApprovedHistory && <div className="min-w-[210px] rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between gap-3 text-sm"><strong>{approvedCount}/4 approved</strong><span>{uploadedCount}/4 uploaded</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200" aria-label={`Document approval progress ${approvalProgress}%`}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${approvalProgress}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Final Chef approval requires 4/4 document approvals.</p>
        </div>}
      </div>

      {!applicationReady && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>Submit your Chef details first.</strong><p className="mt-1">After the application record is created, all four document upload controls become available.</p></div>
        </div>
      )}

      {locked && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>Chef application approved.</strong><p className="mt-1">{incompleteApprovedHistory ? "Your approval is recorded, but your current document history is incomplete. Contact Craves support to review this history. You cannot replace documents here while the application is approved." : "Your approved documents are locked. No further upload is needed here."}</p></div>
        </div>
      )}

      {rejectedCount > 0 && !locked && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>{rejectedCount} document{rejectedCount === 1 ? " needs" : "s need"} replacement.</strong><p className="mt-1">Replace only the red document{rejectedCount === 1 ? "" : "s"}. Your approved documents remain accepted.</p></div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {REQUIREMENTS.filter(requirement => !locked || uploadedByType.has(requirement.type)).map(requirement => {
          const uploaded = uploadedByType.get(requirement.type);
          const selected = files[requirement.type];
          const uploadState = stateFor(requirement.type);
          const busy = uploadState.phase === "UPLOADING" || uploadState.phase === "SECURING";
          const approved = uploaded?.status === "APPROVED";
          const rejected = uploaded?.status === "REJECTED";
          const canReplace = Boolean(applicationReady && !locked && !approved);
          const displayProgress = uploadState.phase === "IDLE" && uploaded ? 100 : uploadState.progress;

          return (
            <article key={requirement.type} className={`rounded-2xl border bg-white p-4 sm:p-5 ${rejected ? "border-red-200" : approved ? "border-emerald-200" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${approved ? "bg-emerald-50 text-emerald-700" : rejected ? "bg-red-50 text-red-700" : uploaded ? "bg-slate-50 text-primary" : "bg-slate-50 text-slate-700"}`}>
                    {approved ? <CheckCircle2 className="h-5 w-5" /> : rejected ? <XCircle className="h-5 w-5" /> : uploaded ? <ShieldCheck className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold">{requirement.title} <span className="text-red-600">*</span></h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{requirement.helper}</p>
                    {uploaded && <p className={`mt-2 break-words text-xs font-semibold ${approved ? "text-emerald-700" : rejected ? "text-red-700" : "text-primary"}`}>{uploaded.originalFileName} · {formatBytes(uploaded.fileSizeBytes)}</p>}
                    {uploaded?.reviewedAt && <p className="mt-1 text-[11px] text-slate-500">Reviewed {new Date(uploaded.reviewedAt).toLocaleString("en-IN")}</p>}
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses(uploaded)}`}>{statusLabel(uploaded)}</span>
              </div>

              {rejected && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
                  <strong>Why this document was rejected</strong>
                  <p className="mt-1 leading-6">{uploaded.reviewReason || "Craves requested a replacement for this document."}</p>
                  <p className="mt-2 text-xs font-semibold">Only this document needs a replacement. Other approved documents stay locked and accepted.</p>
                </div>
              )}

              {approved ? (
                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div><strong>Accepted by Craves.</strong><p className="mt-1">No action is required for this document, and normal replacement is disabled.</p></div>
                </div>
              ) : !locked ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <label className="text-sm font-semibold">
                    {rejected ? "Choose replacement file" : uploaded ? "Replace before review completes (optional)" : "Choose file"}
                    <input
                      type="file"
                      accept={requirement.accept}
                      disabled={!canReplace || busy}
                      onChange={event => chooseFile(requirement.type, event.target.files?.[0] ?? null)}
                      className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm disabled:bg-slate-100"
                    />
                    {selected && <span className="mt-1 block text-xs font-normal text-slate-500">Selected: {selected.name} · {formatBytes(selected.size)}</span>}
                  </label>
                  <button
                    type="button"
                    disabled={!canReplace || busy || !selected}
                    onClick={() => upload(requirement.type)}
                    className={`min-h-12 rounded-full px-6 font-bold text-white disabled:opacity-40 ${rejected ? "bg-red-700" : "bg-primary"}`}
                  >
                    {busy ? "Uploading…" : rejected ? "Replace rejected document" : uploaded ? "Replace" : "Upload"}
                  </button>
                </div>
              ) : null}

              {(busy || uploadState.phase === "DONE" || uploadState.phase === "ERROR") && (
                <div className="mt-4" aria-live="polite">
                  <div className="flex items-center justify-between gap-3 text-xs"><span className={uploadState.phase === "ERROR" ? "font-semibold text-red-700" : "text-slate-600"}>{uploadState.message}</span><strong>{displayProgress}%</strong></div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${uploadState.phase === "ERROR" ? "bg-red-500" : uploadState.phase === "DONE" ? "bg-emerald-600" : "bg-primary"}`}
                      style={{ width: `${displayProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className={`mt-5 rounded-2xl p-4 text-sm ${approvedCount === 4 ? "bg-emerald-50 text-emerald-900" : rejectedCount > 0 ? "bg-red-50 text-red-950" : "bg-white text-slate-700"}`}>
        {locked
          ? incompleteApprovedHistory ? "Your application approval has not changed. Missing history has not been marked as verified." : "Your application and all four documents are approved."
          : approvedCount === 4
          ? "All four required documents are individually approved. Your application can now proceed to the final Chef approval decision."
          : rejectedCount > 0
            ? `${rejectedCount} document${rejectedCount === 1 ? "" : "s"} need replacement. ${approvedCount} already-approved document${approvedCount === 1 ? " remains" : "s remain"} accepted.`
            : uploadedCount < 4
              ? `${4 - uploadedCount} required document${4 - uploadedCount === 1 ? "" : "s"} still need to be uploaded.`
              : `${awaitingReviewCount} document${awaitingReviewCount === 1 ? " is" : "s are"} awaiting individual review. Approved documents will be locked as each decision is completed.`}
      </div>
    </section>
  );
}
