"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminChefApplication } from "@/lib/admin-chef-review-contract";

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminChefReviewDetails({ applicationId }: { applicationId: string }) {
  const [item, setItem] = useState<AdminChefApplication | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("Loading chef application…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/chef-reviews/${applicationId}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new Error("Administrator session expired.");
    if (response.status === 403) throw new Error("Administrator access is required.");
    if (response.status === 404) throw new Error("Chef application was not found.");
    if (!response.ok) throw new Error("Chef application is temporarily unavailable.");
    setItem(body as AdminChefApplication); setMessage("");
  }, [applicationId]);

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Chef application is unavailable.")); }, [load]);

  async function decide(action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) { setMessage("A rejection reason is required."); return; }
    if (action === "approve" && !window.confirm("Confirm that you inspected the available proof files and want to approve this chef application.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/chef-reviews/${applicationId}/${action}`, { method: "POST", headers: action === "reject" ? { "Content-Type": "application/json" } : undefined, body: action === "reject" ? JSON.stringify({ reason }) : undefined });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(action === "approve" ? "Chef approval failed." : "Chef rejection failed.");
      setItem(body as AdminChefApplication); setReason("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Chef decision failed."); }
    finally { setBusy(false); }
  }

  if (!item) return <section className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950"><p role="status">{message}</p></section>;
  return <div className="space-y-6">
    <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">{item.status}</p><h2 className="mt-2 text-3xl font-bold">{item.firstName} {item.lastName}</h2><p className="mt-2 text-sm text-slate-600">{item.email} · {item.phoneNumber}</p></div><span className="text-sm text-slate-500">Submitted {new Date(item.submittedAt).toLocaleString("en-IN")}</span></div><p className="mt-5 text-sm leading-6">{item.addressLine1}{item.addressLine2 ? `, ${item.addressLine2}` : ""}{item.landmark ? `, ${item.landmark}` : ""}<br />{item.city}, {item.state} {item.postalCode ?? ""}</p>{item.rejectionReason && <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-900"><strong>Rejection reason</strong><p className="mt-2">{item.rejectionReason}</p></div>}</section>
    <section className="rounded-[30px] bg-white p-6 text-slate-950 sm:p-8"><h2 className="text-2xl font-bold">Proof files</h2><p className="mt-2 text-sm text-slate-600">Open each proof through the administrator-only content stream before deciding.</p><div className="mt-5 space-y-3">{item.documents.map(document => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FFF8EC] p-4"><div><strong>{document.documentType.replace("_", " ")}</strong><p className="mt-1 text-sm text-slate-600">{document.originalFileName} · {bytes(document.fileSizeBytes)} · {document.status}</p></div><a target="_blank" rel="noopener noreferrer" href={`/api/admin/chef-reviews/${item.id}/documents/${document.id}/content`} className="rounded-2xl bg-[#6930CA] px-4 py-2 font-bold text-white">Open proof</a></div>)}{item.documents.length === 0 && <p className="rounded-2xl bg-amber-50 p-4 text-amber-900">No proof files are attached.</p>}</div></section>
    {item.status === "PENDING" && <section className="rounded-[30px] bg-white p-6 text-slate-950 sm:p-8"><h2 className="text-2xl font-bold">Decision</h2><label className="mt-5 block text-sm font-bold">Rejection reason<textarea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl bg-[#FFF8EC] p-4" /></label><div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} onClick={() => void decide("approve")} className="rounded-2xl bg-green-700 px-5 py-3 font-bold text-white disabled:opacity-50">Approve</button><button disabled={busy || !reason.trim()} onClick={() => void decide("reject")} className="rounded-2xl bg-red-700 px-5 py-3 font-bold text-white disabled:opacity-50">Reject</button></div></section>}
    {message && <p className="rounded-2xl bg-[#FFF8EC] p-4 text-slate-950" role="status">{message}</p>}
  </div>;
}
