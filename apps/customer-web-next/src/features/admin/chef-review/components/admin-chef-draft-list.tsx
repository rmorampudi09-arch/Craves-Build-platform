"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { parseAdminChefDrafts, type AdminChefDraft } from "@/features/admin/chef-review/lib/admin-chef-review-contract";

const STEPS: Record<string, string> = {
  "signed-in": "Signed in with OTP, form not started",
  personal: "Personal details and email code",
  kitchen: "Kitchen details",
  "kitchen-photos": "Kitchen photos",
  fssai: "FSSAI licence",
  documents: "ID proof",
  review: "Ready to submit",
};

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
    {items.length > 0 && <p className="mt-6 text-sm text-slate-600">{items.length} {items.length === 1 ? "chef has" : "chefs have"} started and not submitted yet, latest activity first.{items.length >= 1000 ? " Showing the latest 1,000." : ""}</p>}
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
