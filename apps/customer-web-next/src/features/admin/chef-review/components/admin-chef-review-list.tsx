"use client";

import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";

import { useCallback, useEffect, useState } from "react";
import type { AdminChefApplication, AdminChefApplicationStatus } from "@/features/admin/chef-review/lib/admin-chef-review-contract";
import { AdminChefDraftList } from "@/features/admin/chef-review/components/admin-chef-draft-list";

// Ready to check: the chef sent everything. Waiting for the chef: an application not sent yet.
const TABS: { value: AdminChefApplicationStatus | "NOT_SUBMITTED"; label: string }[] = [
  { value: "PENDING", label: "Ready to check" }, { value: "NOT_SUBMITTED", label: "Waiting for the chef" },
  { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Not approved" },
];
const STATUS_WORDS: Record<AdminChefApplicationStatus, string> = { PENDING: "Ready to check", APPROVED: "Approved", REJECTED: "Not approved" };
const EMPTY: Record<AdminChefApplicationStatus, string> = {
  PENDING: "No kitchen applications are waiting to be checked.", APPROVED: "No kitchens have been approved yet.", REJECTED: "No kitchen applications were turned down.",
};

export function AdminChefReviewList() {
  const [tab, setTab] = useState<AdminChefApplicationStatus | "NOT_SUBMITTED">("PENDING");
  return <section>
    <div className="flex flex-wrap gap-3">{TABS.map(({ value, label }) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`rounded-2xl px-4 py-2 font-bold ${tab === value ? "bg-[#6930CA] text-white" : "border border-[#cfc4d7] bg-white text-[#5f506b]"}`}>{label}</button>)}</div>
    {tab === "NOT_SUBMITTED" ? <AdminChefDraftList /> : <AdminChefApplicationList key={tab} status={tab} />}
  </section>;
}

function AdminChefApplicationList({ status }: { status: AdminChefApplicationStatus }) {
  const [items, setItems] = useState<AdminChefApplication[]>([]);
  const [message, setMessage] = useState("Loading kitchen applications…");

  const load = useCallback(async () => {
    const response = await adminFetch(`/api/admin/chef-reviews?status=${status}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new Error("Administrator session expired.");
    if (response.status === 403) throw new Error("Administrator access is required.");
    if (!response.ok) throw new Error("Chef applications are temporarily unavailable.");
    const applications = body as AdminChefApplication[];
    setItems(applications); setMessage(applications.length ? "" : EMPTY[status]);
  }, [status]);

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Chef applications are unavailable.")); }, [load]);

  return <>
    {message && <div className="mt-6 rounded-[24px] bg-[#FFF8EC] p-6 text-slate-950" role="status">{message}</div>}
    <div className="mt-6 space-y-4">{items.map(item => <a key={item.id} href={`/admin/chef-reviews/${item.id}`} className="block rounded-[26px] bg-[#FFF8EC] p-6 text-slate-950"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">{item.referenceCode ? `${item.referenceCode} · ` : ""}{STATUS_WORDS[item.status]}</p><h2 className="mt-2 text-2xl font-bold">{item.firstName} {item.lastName}</h2><p className="mt-2 text-sm text-slate-600">{item.email} · {item.phoneNumber}</p></div><span className="text-sm text-slate-500">{new Date(item.submittedAt).toLocaleString("en-IN")}</span></div><p className="mt-4 text-sm text-slate-700">{item.city}, {item.state} · {item.documents.length} {item.documents.length === 1 ? "document" : "documents"}</p></a>)}</div>
  </>;
}
