"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { parseAdminChefDrafts, type AdminChefDraft } from "@/features/admin/chef-review/lib/admin-chef-review-contract";
import { toCsv } from "@/features/admin/fleet/lib/payout-contract";
import { ONBOARDING_LANGUAGES, PROOF_OPTIONS } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";

const STEPS: Record<string, string> = {
  "signed-in": "Signed in with OTP, form not started",
  personal: "Personal details and email code",
  kitchen: "Kitchen details",
  "kitchen-photos": "Kitchen photos",
  fssai: "FSSAI licence",
  documents: "ID proof",
  review: "Ready to submit",
};

/** India time the way a spreadsheet reads it: 2026-11-14 18:41. */
const indiaTime = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");
const proof = (item: AdminChefDraft) => {
  const name = PROOF_OPTIONS.find(([key]) => key === item.details?.proofKind)?.[1] ?? item.details?.proofKind ?? null;
  return name && item.details?.otherGovernmentId ? `${name}: ${item.details.otherGovernmentId}` : name;
};
// Each heading sits next to its value, so the two cannot drift apart.
const COLUMNS: [string, (item: AdminChefDraft) => string | number | null][] = [
  ["First name", item => item.firstName], ["Last name", item => item.lastName], ["Phone", item => item.phoneNumber], ["Email", item => item.email],
  ["Email verified", item => item.emailVerified ? "Yes" : "No"],
  ["Where they stopped", item => item.reviewStatus === "MORE_INFORMATION_REQUIRED" ? "Sent back for changes" : STEPS[item.step] ?? item.step],
  ["Started (India time)", item => indiaTime(item.startedAt)], ["Last active (India time)", item => indiaTime(item.lastActivityAt)],
  ["Kitchen name", item => item.details?.kitchenName ?? null], ["About the kitchen", item => item.details?.kitchenDescription ?? null],
  ["Address line 1", item => item.details?.addressLine1 ?? null], ["Address line 2", item => item.details?.addressLine2 ?? null],
  ["Landmark", item => item.details?.landmark ?? null], ["City", item => item.details?.city ?? null], ["State", item => item.details?.state ?? null],
  ["PIN code", item => item.details?.postalCode ?? null], ["Latitude", item => item.details?.latitude ?? null], ["Longitude", item => item.details?.longitude ?? null],
  ["Date of birth", item => item.details?.dateOfBirth ?? null], ["ID proof", proof], ["FSSAI number", item => item.details?.fssaiNumber ?? null],
  ["Preferred language", item => ONBOARDING_LANGUAGES.find(([key]) => key === item.details?.language)?.[1] ?? item.details?.language ?? null],
  ["Application ID", item => item.applicationId], ["Account ID", item => item.identityId],
];

function exportCsv(items: AdminChefDraft[]) {
  const csv = toCsv([COLUMNS.map(([heading]) => heading), ...items.map(item => COLUMNS.map(([, value]) => value(item)))]);
  // The byte-order mark tells Excel the file is UTF-8, so names like Asha’s Kitchen and Telugu text open intact.
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `craves-chefs-not-submitted-${indiaTime(new Date().toISOString()).slice(0, 10)}.csv` });
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Everyone who started the Chef application and has not submitted it, so admins can contact them. */
export function AdminChefDraftList() {
  const [items, setItems] = useState<AdminChefDraft[]>([]);
  const [message, setMessage] = useState("Loading chefs who have not submitted yet…");

  useEffect(() => {
    void (async () => {
      const response = await adminFetch("/api/admin/chef-onboarding/applications/drafts", { cache: "no-store" });
      if (response.status === 401) throw new Error("Administrator session expired.");
      if (response.status === 403) throw new Error("Administrator access is required.");
      const drafts = response.ok ? parseAdminChefDrafts(await response.json().catch(() => null)) : null;
      if (!drafts) throw new Error("Chefs who have not submitted are temporarily unavailable.");
      setItems(drafts); setMessage(drafts.length ? "" : "Everyone who started has submitted.");
    })().catch(error => setMessage(error instanceof Error ? error.message : "Chefs who have not submitted are unavailable."));
  }, []);

  return <>
    {message && <div className="mt-6 rounded-[24px] bg-[#FFF8EC] p-6 text-slate-950" role="status">{message}</div>}
    {items.length > 0 && <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600">{items.length} {items.length === 1 ? "chef has" : "chefs have"} started and not submitted yet, latest activity first.{items.length >= 1000 ? " Showing the latest 1,000." : ""}</p>
      <button type="button" onClick={() => exportCsv(items)} className="inline-flex items-center gap-2 rounded-2xl border border-[#cfc4d7] bg-white px-4 py-2 font-bold text-[#5f506b]">
        <Download size={16} aria-hidden="true" />Export to CSV</button>
    </div>}
    <div className="mt-4 space-y-4">{items.map(item => <article key={item.identityId} className="rounded-[26px] bg-[#FFF8EC] p-6 text-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">{item.reviewStatus === "MORE_INFORMATION_REQUIRED" ? "Sent back for changes" : `Stopped at: ${STEPS[item.step] ?? item.step}`}</p>
          <h2 className="mt-2 text-2xl font-bold">{[item.firstName, item.lastName].filter(Boolean).join(" ") || "Name not entered yet"}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {item.email ? <><a className="underline" href={`mailto:${item.email}`}>{item.email}</a>{item.emailVerified ? " · email verified" : " · email not verified"}</> : "No email entered"}
            {" · "}
            {item.phoneNumber ? <a className="underline" href={`tel:${item.phoneNumber}`}>{item.phoneNumber}</a> : "Phone not saved"}
          </p>
        </div>
        <span className="text-sm text-slate-500">Last active {new Date(item.lastActivityAt).toLocaleString("en-IN")}</span>
      </div>
      <p className="mt-4 text-sm text-slate-700">Started {new Date(item.startedAt).toLocaleString("en-IN")}</p>
    </article>)}</div>
  </>;
}
