"use client";

import { adminFetch } from "@/lib/admin-renewal";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseAdminChefApplications, type AdminChefApplication, type AdminChefApplicationStatus } from "@/lib/admin-chef-review-contract";
import { formatAdminTimestamp, readableAdminStatus } from "@/lib/admin-navigation";

export function AdminChefReviewList() {
  const [status, setStatus] = useState<AdminChefApplicationStatus>("PENDING");
  const [items, setItems] = useState<AdminChefApplication[]>([]);
  const [message, setMessage] = useState("Loading chef applications…");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const current = ++generation.current;
    setLoading(true); setFailed(false); setItems([]); setMessage("Loading chef applications…");
    try {
      const response = await adminFetch(`/api/admin/chef-reviews?status=${status}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (response.status === 401) throw new Error("Administrator session expired.");
      if (response.status === 403) throw new Error("Administrator access is required.");
      if (!response.ok) throw new Error("Chef applications are temporarily unavailable. Select Refresh to retry.");
      const applications = parseAdminChefApplications(body);
      if (!applications || applications.some(item => item.status !== status)) throw new Error("The chef application list could not be verified. Select Refresh to retry.");
      if (current !== generation.current || controller.signal.aborted) return;
      setItems(applications); setMessage(applications.length ? `${applications.length} ${status.toLowerCase()} application${applications.length === 1 ? "" : "s"}.` : `No ${status.toLowerCase()} chef applications.`);
    } catch (error) {
      if (current === generation.current && !controller.signal.aborted) { setFailed(true); setMessage(error instanceof Error ? error.message : "Chef applications are unavailable. Select Refresh to retry."); }
    } finally { if (current === generation.current) setLoading(false); }
  }, [status]);

  const cancelLoad = useCallback(() => { generation.current += 1; request.current?.abort(); }, []);
  useEffect(() => { void load(); return cancelLoad; }, [load, cancelLoad]);

  return <section aria-busy={loading}>
    <div className="flex flex-wrap gap-3">{(["PENDING", "APPROVED", "REJECTED"] as AdminChefApplicationStatus[]).map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-2xl px-4 py-2 font-bold ${status === value ? "bg-[#6930CA] text-white" : "border border-[#cfc4d7] bg-white text-[#5f506b]"}`}>{readableAdminStatus(value)}</button>)}<button className="cr-button ml-auto" disabled={loading} onClick={() => void load()}>{loading ? "Loading…" : "Refresh"}</button></div>
    {message && <div className="cr-action-notice mt-6" data-tone={failed ? "error" : loading ? "busy" : "info"} role={failed ? "alert" : "status"}>{message}</div>}
    <div className="mt-6 space-y-4">{items.map(item => <a key={item.id} href={`/admin/chef-reviews/${item.id}`} className="block rounded-[26px] bg-[#FFF8EC] p-6 text-slate-950"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">{readableAdminStatus(item.status)}</p><h2 className="mt-2 text-2xl font-bold">{item.firstName} {item.lastName}</h2><p className="mt-2 text-sm text-slate-600">{item.email} · {item.phoneNumber}</p></div><span className="text-sm text-slate-500">{formatAdminTimestamp(item.submittedAt)}</span></div><p className="mt-4 text-sm text-slate-700">{item.city}, {item.state} · {item.documents.length} proof file(s)</p></a>)}</div>
  </section>;
}
