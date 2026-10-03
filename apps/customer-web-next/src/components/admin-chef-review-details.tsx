"use client";

import { adminFetch } from "@/lib/admin-renewal";
import Link from "next/link";

import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseAdminChefApplication, type AdminChefApplication } from "@/lib/admin-chef-review-contract";
import { parseAdminChefDocuments, type AdminChefDocument } from "@/lib/admin-chef-document-contract";

const REQUIREMENTS = [
  ["APPLICANT_PHOTO", "Applicant photograph"],
  ["GOVERNMENT_ID_FRONT", "Government photo ID — front"],
  ["GOVERNMENT_ID_BACK", "Government photo ID — back"],
  ["TAX_ID_CARD", "PAN / tax ID card"],
] as const;

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusStyle(status: AdminChefDocument["status"]): string {
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50/60 text-emerald-900";
  if (status === "REJECTED") return "border-red-200 bg-red-50/70 text-red-900";
  return "border-amber-200 bg-amber-50/70 text-amber-900";
}

export function AdminChefReviewDetails({ applicationId }: { applicationId: string }) {
  const [item, setItem] = useState<AdminChefApplication | null>(null);
  const [documents, setDocuments] = useState<AdminChefDocument[]>([]);
  const [documentsAvailable, setDocumentsAvailable] = useState(false);
  const [applicationReason, setApplicationReason] = useState("");
  const [documentReasons, setDocumentReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("Loading chef application…");
  const [busy, setBusy] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tone, setTone] = useState<"info" | "error" | "success" | "busy">("busy");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const actionInFlight = useRef(false);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const current = ++generation.current;
    setLoading(true); setDocumentsAvailable(false);
    try {
    const [response, documentResponse] = await Promise.all([
      adminFetch(`/api/admin/chef-reviews/${applicationId}`, { cache: "no-store", signal: controller.signal }),
      adminFetch(`/api/admin/chef-reviews/${applicationId}/evidence-status`, { cache: "no-store", signal: controller.signal }),
    ]);
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new Error("Administrator session expired.");
    if (response.status === 403) throw new Error("Administrator access is required.");
    if (response.status === 404) throw new Error("Chef application was not found.");
    if (!response.ok) throw new Error("Chef application is temporarily unavailable.");
    const application = parseAdminChefApplication(body);
    if (!application || application.id.toLowerCase() !== applicationId.toLowerCase()) throw new Error("The chef application response could not be verified.");

    const parsedDocuments = parseAdminChefDocuments(await documentResponse.json().catch(() => null));
    if (current !== generation.current || controller.signal.aborted) return false;
    setItem(application);
    if (documentResponse.ok && parsedDocuments) {
      setDocuments(parsedDocuments);
      setDocumentsAvailable(true);
      setMessage("");
      return true;
    }
    setDocuments([]);
    setDocumentsAvailable(false);
    setTone("error");
    setMessage("Document review status could not be loaded. Select Refresh to restore document decisions.");
    return false;
    } catch (error) { if (current !== generation.current || controller.signal.aborted) return false; throw error; }
    finally { if (current === generation.current) setLoading(false); }
  }, [applicationId]);

  const cancelLoad = useCallback(() => { generation.current += 1; request.current?.abort(); }, []);
  useEffect(() => {
    void load().catch(error => { if (request.current?.signal.aborted) return; setTone("error"); setMessage(error instanceof Error ? error.message : "Chef application is unavailable."); });
    return cancelLoad;
  }, [load, cancelLoad]);

  async function refresh() {
    if (actionInFlight.current || loading) return;
    setTone("busy"); setMessage("Refreshing chef application…");
    try { if (await load()) { setTone("success"); setMessage("Application and document decisions refreshed."); } }
    catch (error) { setTone("error"); setMessage(error instanceof Error ? error.message : "Chef application could not be refreshed."); }
  }

  const documentByType = useMemo(() => new Map(documents.map(document => [document.documentType, document])), [documents]);
  const uploadedCount = REQUIREMENTS.filter(([type]) => documentByType.has(type)).length;
  const approvedCount = REQUIREMENTS.filter(([type]) => documentByType.get(type)?.status === "APPROVED").length;
  const allApproved = documentsAvailable && approvedCount === REQUIREMENTS.length && item?.id === applicationId;
  const anyBusy = loading || busy || busyDocumentId !== null;

  async function decideApplication(action: "approve" | "reject") {
    if (actionInFlight.current || anyBusy || item?.id !== applicationId) return;
    setTone("error");
    if (action === "reject" && !applicationReason.trim()) {
      setMessage("A whole-application rejection reason is required.");
      return;
    }
    if (action === "approve" && !allApproved) {
      setMessage("Application approval is blocked until all 4 required documents are individually approved.");
      return;
    }
    if (action === "approve" && !window.confirm("Confirm final Chef approval. All four required documents have individual APPROVED decisions.")) return;
    if (action === "reject" && !window.confirm("Reject the entire Chef application? Use the document-level reject button instead when only one file needs replacement.")) return;

    actionInFlight.current = true;
    const current = generation.current;
    setBusy(true); setTone("busy");
    setMessage(`Submitting chef application ${action === "approve" ? "approval" : "rejection"}…`);
    try {
      const response = await adminFetch(`/api/admin/chef-reviews/${applicationId}/${action}`, {
        method: "POST",
        headers: action === "reject" ? { "Content-Type": "application/json" } : undefined,
        body: action === "reject" ? JSON.stringify({ reason: applicationReason }) : undefined,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code === "SESSION_RENEWED_RETRY_REQUIRED" ? "Your session was renewed. Review the application and submit the decision again." : action === "approve" ? "Chef approval failed. Verify all four document decisions." : "Whole-application rejection failed.");
      if (current !== generation.current) return;
      const application = parseAdminChefApplication(body);
      if (!application || application.id !== applicationId) { setDocumentsAvailable(false); setTone("error"); setMessage("Decision was accepted, but its result could not be verified. Refresh before taking another action."); return; }
      setItem(application);
      setApplicationReason("");
      try {
        const ready = await load();
        setTone(ready ? "success" : "error");
        setMessage(`${action === "approve" ? "Chef application approved." : "Entire Chef application rejected."}${ready ? "" : " Document status could not be refreshed. Select Refresh before continuing."}`);
      } catch { setDocumentsAvailable(false); setTone("error"); setMessage("Application decision was saved. Refresh the application to verify its latest document status."); }
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "Chef decision failed.");
    } finally {
      setBusy(false);
      actionInFlight.current = false;
    }
  }

  async function decideDocument(document: AdminChefDocument, action: "approve" | "reject") {
    if (actionInFlight.current || anyBusy || item?.id !== applicationId) return;
    setTone("error");
    const reason = documentReasons[document.id]?.trim() ?? "";
    if (action === "reject" && reason.length < 3) {
      setMessage("Enter a reason for this document rejection. Only this file will need replacement.");
      return;
    }
    if (action === "approve" && !window.confirm(`Approve ${document.originalFileName}? This file will stay accepted and cannot be replaced through normal Chef upload.`)) return;

    actionInFlight.current = true;
    const current = generation.current;
    setBusyDocumentId(document.id); setTone("busy");
    setMessage(`Submitting document ${action === "approve" ? "approval" : "rejection"}…`);
    try {
      const response = await adminFetch(
        `/api/admin/chef-reviews/${applicationId}/documents/${document.id}/${action}`,
        {
          method: "POST",
          headers: action === "reject" ? { "Content-Type": "application/json" } : undefined,
          body: action === "reject" ? JSON.stringify({ reason }) : undefined,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { code?: string } | null;
        throw new Error(body?.code === "SESSION_RENEWED_RETRY_REQUIRED" ? "Your session was renewed. Review the document and submit the decision again." : body?.code === "DOCUMENT_NOT_AWAITING_REVIEW" ? "This document has already received a decision. Refresh the application." : `Document ${action} failed.`);
      }
      if (current !== generation.current) return;
      setDocumentReasons(current => ({ ...current, [document.id]: "" }));
      try {
        const ready = await load();
        setTone(ready ? "success" : "error");
        setMessage(`${action === "approve" ? "Document approved." : "Document rejected; the chef must replace this file."}${ready ? "" : " Document status could not be refreshed. Select Refresh before continuing."}`);
      } catch { setDocumentsAvailable(false); setTone("error"); setMessage("Document decision was saved. Refresh to verify the latest application state before another decision."); }
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "Document decision failed.");
    } finally {
      setBusyDocumentId(null);
      actionInFlight.current = false;
    }
  }

  if (!item || item.id !== applicationId) return <section aria-busy={loading} className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950"><p role={tone === "error" ? "alert" : "status"}>{message}</p><button className="cr-button" disabled={loading} onClick={() => void refresh()}>{loading ? "Loading…" : "Retry application"}</button></section>;

  return <div className="space-y-6">
    <div className="cr-actions"><Link className="cr-button" href="/admin/chef-reviews">Back to applications</Link><button className="cr-button" disabled={anyBusy} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh application"}</button></div>
    {message && <p className="cr-action-notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}>{message}</p>}
    <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">{item.status}</p><h2 className="mt-2 text-3xl font-bold">{item.firstName} {item.lastName}</h2><p className="mt-2 text-sm text-slate-600">{item.email} · {item.phoneNumber}</p></div>
        <span className="text-sm text-slate-500">Submitted {new Date(item.submittedAt).toLocaleString("en-IN")}</span>
      </div>
      <p className="mt-5 text-sm leading-6">{item.addressLine1}{item.addressLine2 ? `, ${item.addressLine2}` : ""}{item.landmark ? `, ${item.landmark}` : ""}<br />{item.city}, {item.state} {item.postalCode ?? ""}</p>
      {item.rejectionReason && <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-900"><strong>Whole-application rejection reason</strong><p className="mt-2">{item.rejectionReason}</p></div>}
    </section>

    <section className="rounded-[30px] bg-white p-6 text-slate-950 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">Document review</p><h2 className="mt-1 text-2xl font-bold">Review each document independently</h2><p className="mt-2 max-w-2xl text-sm text-slate-600">Open each file, then approve or reject that specific document. Rejecting one file keeps the application pending and preserves every document already approved.</p></div>
        <div className="min-w-[220px] rounded-2xl bg-[#FFF8EC] p-4"><div className="flex justify-between gap-3 text-sm"><strong>{approvedCount}/4 approved</strong><span>{uploadedCount}/4 uploaded</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#6930CA] transition-[width] duration-500" style={{ width: `${approvedCount * 25}%` }} /></div></div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {REQUIREMENTS.map(([type, label]) => {
          const document = documentByType.get(type);
          if (!document) {
            return <article key={type} className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><strong>{label}</strong><p className="mt-1 text-sm text-amber-800">{documentsAvailable ? "Missing — Chef must upload this item." : "Document status unavailable. Refresh the application to verify this file."}</p></div></div></article>;
          }
          const decisionBusy = busyDocumentId === document.id;
          return <article key={type} className={`rounded-2xl border p-4 ${statusStyle(document.status)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">{document.status === "APPROVED" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : document.status === "REJECTED" ? <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}<div><strong>{label}</strong><p className="mt-1 text-sm opacity-80">{document.originalFileName} · {bytes(document.fileSizeBytes)}</p>{document.reviewedAt && <p className="mt-1 text-xs opacity-70">Reviewed {new Date(document.reviewedAt).toLocaleString("en-IN")}</p>}</div></div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{document.status}</span>
            </div>

            {document.status === "REJECTED" && <div className="mt-4 rounded-xl bg-white/80 p-3 text-sm"><strong>Replacement requested</strong><p className="mt-1">{document.reviewReason || "No reason returned."}</p><p className="mt-2 text-xs opacity-75">The Chef replaces only this document. Other APPROVED documents remain accepted.</p></div>}

            <div className="mt-4 flex flex-wrap gap-2">
              <a target="_blank" rel="noopener noreferrer" href={`/api/admin/chef-reviews/${item.id}/documents/${document.id}/content`} className="inline-flex rounded-xl bg-[#6930CA] px-4 py-2 text-sm font-bold text-white">Open document</a>
              {item.status === "PENDING" && document.status === "UPLOADED" && <button disabled={anyBusy || !documentsAvailable} onClick={() => void decideDocument(document, "approve")} className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{decisionBusy ? "Saving decision…" : "Approve document"}</button>}
            </div>

            {item.status === "PENDING" && document.status === "UPLOADED" && <div className="mt-4 border-t border-black/10 pt-4"><label className="text-sm font-bold">Reject only this document<textarea disabled={anyBusy || !documentsAvailable} value={documentReasons[document.id] ?? ""} maxLength={1000} onChange={event => setDocumentReasons(current => ({ ...current, [document.id]: event.target.value }))} placeholder="Explain what is wrong with this file and what the Chef should replace" className="mt-2 min-h-20 w-full rounded-xl border border-black/10 bg-white p-3 text-slate-950" /></label><button disabled={anyBusy || !documentsAvailable || (documentReasons[document.id]?.trim().length ?? 0) < 3} onClick={() => void decideDocument(document, "reject")} className="mt-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{decisionBusy ? "Saving decision…" : "Reject this document only"}</button></div>}
          </article>;
        })}
      </div>

      {!documentsAvailable && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Document decision state could not be verified. Final approval is fail-closed until this check succeeds.</p>}
      {allApproved && <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">4/4 required documents are individually approved. The Chef application is eligible for final application-level approval.</p>}
    </section>

    {item.status === "PENDING" && <section className="rounded-[30px] border border-red-100 bg-white p-6 text-slate-950 sm:p-8">
      <h2 className="text-2xl font-bold">Final application decision</h2>
      <p className="mt-2 text-sm text-slate-600">Use document-level rejection above when only one file is incorrect. Use the red action below only when the <strong>entire Chef application</strong> must be rejected.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button disabled={anyBusy || !allApproved} onClick={() => void decideApplication("approve")} className="rounded-2xl bg-green-700 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Saving decision…" : "Approve Chef application"}</button></div>
      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5"><label className="block text-sm font-bold text-red-950">Whole-application rejection reason<textarea disabled={anyBusy} value={applicationReason} maxLength={1000} onChange={event => setApplicationReason(event.target.value)} placeholder="Use only for an application-level problem, not a single bad document" className="mt-2 min-h-28 w-full rounded-2xl bg-white p-4 text-slate-950" /></label><button disabled={anyBusy || !applicationReason.trim()} onClick={() => void decideApplication("reject")} className="mt-3 rounded-2xl bg-red-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Saving decision…" : "Reject entire application"}</button></div>
    </section>}

  </div>;
}
