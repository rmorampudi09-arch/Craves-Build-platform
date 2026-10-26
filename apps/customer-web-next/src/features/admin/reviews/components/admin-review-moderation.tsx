"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import {
  adminReviewSchema, moderationActions, reviewPageSchema, type AdminReview, type ModerationAction, type ReviewStatus,
} from "@/features/admin/reviews/lib/review-moderation-contract";

const buttonStyle = "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";
const TABS: { status: ReviewStatus; label: string }[] = [
  { status: "PENDING_MODERATION", label: "Waiting" }, { status: "PUBLISHED", label: "Published" },
  { status: "HIDDEN", label: "Hidden" }, { status: "REJECTED", label: "Rejected" },
];
const ACTION: Record<ModerationAction, { label: string; status: ReviewStatus; done: string; style: string }> = {
  PUBLISH: { label: "Publish", status: "PUBLISHED", done: "Published. It now shows on the kitchen page and to the chef.", style: "border-green-700 bg-green-700 text-white" },
  HIDE: { label: "Hide", status: "HIDDEN", done: "Hidden. Customers and the chef no longer see it.", style: "" },
  REJECT: { label: "Reject", status: "REJECTED", done: "Rejected. It is not shown anywhere.", style: "border-red-300 text-red-700" },
};
const SUB_RATINGS = [
  ["foodTasteRating", "Taste"], ["portionValueRating", "Portion"], ["packagingRating", "Packaging"],
  ["accuracyRating", "Accuracy"], ["chefPreparationRating", "Preparation"], ["deliveryRating", "Delivery"],
] as const;

async function ensureSuccess(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "Review request failed. Refresh before retrying.");
  return body;
}
const shortId = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();
function when(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}
const reasonValid = (reason: string) => reason.trim().length >= 10 && reason.trim().length <= 500 && /^[\x20-\x7E]+$/.test(reason.trim());

export function AdminReviewModeration() {
  const [status, setStatus] = useState<ReviewStatus>("PENDING_MODERATION");
  const [items, setItems] = useState<AdminReview[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [decision, setDecision] = useState<{ reviewId: string; action: ModerationAction; reason: string } | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (tab: ReviewStatus, cursor?: string) => {
    const id = ++requestId.current;
    const query = new URLSearchParams({ status: tab });
    if (cursor) query.set("cursor", cursor);
    const page = reviewPageSchema.parse(await ensureSuccess(await adminFetch(`/api/admin/reviews?${query}`, { cache: "no-store" })));
    if (id !== requestId.current) return;
    setItems(current => cursor ? [...current, ...page.items] : page.items);
    setNames(current => ({ ...(cursor ? current : {}), ...page.kitchenNames }));
    setNextCursor(page.hasMore ? page.nextCursor ?? null : null);
    setLoaded(true);
  }, []);
  const show = useCallback((tab: ReviewStatus, cursor?: string) => {
    void load(tab, cursor).catch(error => { setLoaded(true); setMessage(error instanceof Error ? error.message : "Reviews unavailable."); });
  }, [load]);
  useEffect(() => {
    const requests = requestId;
    show(status);
    return () => { requests.current++; };
  }, [show, status]);

  const openTab = (tab: ReviewStatus) => { setStatus(tab); setLoaded(false); setItems([]); setDecision(null); setMessage(""); };

  const decide = async () => {
    if (!decision || busy || !reasonValid(decision.reason)) return;
    setBusy(true); setMessage("");
    try {
      adminReviewSchema.parse(await ensureSuccess(await adminFetch(`/api/admin/reviews/${decision.reviewId}/moderation`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision.action, reason: decision.reason.trim() }),
      })));
      setItems(current => current.filter(item => item.reviewId !== decision.reviewId));
      setMessage(ACTION[decision.action].done); setDecision(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Decision failed. Refresh before retrying."); }
    finally { setBusy(false); }
  };

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-4" role="tablist" aria-label="Review status">
      {TABS.map(tab => <button key={tab.status} type="button" role="tab" aria-selected={tab.status === status} disabled={busy}
        className={`${buttonStyle} rounded-full ${tab.status === status ? "border-zinc-900 bg-zinc-900 text-white" : ""}`}
        onClick={() => openTab(tab.status)}>{tab.label}</button>)}
      <button type="button" aria-label="Refresh reviews" title="Refresh reviews" className={`${buttonStyle} ml-auto`} disabled={busy}
        onClick={() => { setMessage(""); show(status); }}><RefreshCw size={18} /></button>
    </div>
    {message ? <p role="status" className="text-sm font-medium">{message}</p> : null}
    {!loaded ? <p role="status">Loading reviews...</p> : items.length === 0 ? <p className="text-sm text-zinc-600">No reviews here.</p> :
      <ul className="space-y-3">{items.map(review => {
        const open = decision?.reviewId === review.reviewId ? decision : null;
        const subs = SUB_RATINGS.filter(([key]) => review[key]).map(([key, label]) => `${label} ${review[key]}/5`);
        return <li key={review.reviewId} className="space-y-3 rounded-lg border border-zinc-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">{names[review.kitchenId] ?? `Kitchen ${shortId(review.kitchenId)}`}</p>
            <p className="font-mono text-xs text-zinc-600">Order #{shortId(review.orderId)} · {when(review.submittedAt ?? review.updatedAt)}</p>
          </div>
          <p aria-label={review.overallRating ? `${review.overallRating} out of 5` : "No overall rating"} className="text-amber-600">
            {review.overallRating ? "★".repeat(review.overallRating) + "☆".repeat(5 - review.overallRating) : "No overall rating"}
          </p>
          {subs.length ? <p className="text-xs text-zinc-600">{subs.join(" · ")}</p> : null}
          <p className={review.reviewText ? "whitespace-pre-wrap text-sm" : "text-sm italic text-zinc-500"}>{review.reviewText || "No written comment."}</p>
          {review.tagCodes?.length ? <p className="text-xs text-zinc-600">{review.tagCodes.map(code => code.toLowerCase().replace(/_/g, " ")).join(" · ")}</p> : null}
          <div className="flex flex-wrap gap-2">
            {moderationActions.filter(action => ACTION[action].status !== review.status).map(action =>
              <button key={action} type="button" className={`${buttonStyle} ${ACTION[action].style}`} disabled={busy}
                onClick={() => { setMessage(""); setDecision({ reviewId: review.reviewId, action, reason: action === "PUBLISH" ? "Checked: genuine feedback on a delivered order." : "" }); }}>
                {ACTION[action].label}</button>)}
          </div>
          {open ? <div className="space-y-2 border-t border-dashed border-zinc-200 pt-3">
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`reason-${review.reviewId}`}>
              Reason to {ACTION[open.action].label.toLowerCase()} (10 to 500 characters, English letters)
              <textarea id={`reason-${review.reviewId}`} className="rounded-md border border-zinc-300 px-3 py-2 font-normal" rows={2} maxLength={500}
                value={open.reason} disabled={busy} onChange={event => setDecision({ ...open, reason: event.target.value })} />
            </label>
            <p className="text-xs text-zinc-600">Saved with your account in the review audit log.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${buttonStyle} ${ACTION[open.action].style}`} disabled={busy || !reasonValid(open.reason)}
                onClick={() => { void decide(); }}>{busy ? "Saving..." : `Confirm ${ACTION[open.action].label.toLowerCase()}`}</button>
              <button type="button" className={buttonStyle} disabled={busy} onClick={() => setDecision(null)}>Cancel</button>
            </div>
          </div> : null}
        </li>;
      })}</ul>}
    {loaded && nextCursor ? <button type="button" className={buttonStyle} disabled={busy} onClick={() => show(status, nextCursor)}>Load more</button> : null}
  </section>;
}
